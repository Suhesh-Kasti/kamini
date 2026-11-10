import { gsap } from "gsap";
import { getConfig, themeFor } from "./config";
import { readPrefs, patchPrefs, type LocalPrefs } from "./storage";
import {
  EASE,
  initEases,
  prefersReducedMotion,
  pulse,
  questionEntrance,
  sceneExit,
  splitWords,
  wait,
} from "./animations";
import { cycleLabel, resetHover, runBehavior, type BehaviorPhase } from "./behaviors";
import { playEnding } from "./endings";
import { AudioPlayer } from "./audio";
import type { Question, QuestionButton, Theme } from "../lib/types";
import type { ThreeSceneApi } from "./three-scene";

const config = getConfig();
initEases();

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function qs<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

let prefs: LocalPrefs = readPrefs();
const audio = new AudioPlayer();
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let sceneApi: ThreeSceneApi | null = null;
let currentQuestion: Question = config.questions[0];
let currentThemeId = "";
let currentTheme: Theme = config.themes[config.active_theme] ?? Object.values(config.themes)[0];
let currentSceneKey = "";
let currentButtons: HTMLButtonElement[] = [];
let transitionToken = 0;
let locked = false;
let ended = false;
let activating = false;
let lastWhisper = "";
let lastEndingTheme = prefs.lastEndingTheme ?? config.active_theme;
let panelOpen = false;
let deferredPrompt: InstallEvent | null = null;
let lastFocus: HTMLElement | null = null;
let coinValue = Number(sessionStorage.getItem("pocket-mood.coins") ?? 0);

const questionScene = required("#question-scene");
const endingScene = required("#ending-scene");
const endingHost = required("#ending-host");
const endingActions = required("[data-ending-actions]");
const eyebrowEl = required("[data-eyebrow]");
const questionEl = required("[data-question]");
const answersEl = required("[data-answers]");
const whisperEl = required("[data-whisper]");
const canvas = document.getElementById("three-stage") as HTMLCanvasElement | null;
const introEl = qs("#intro");
const introLine = qs("[data-intro-line]");
const introSub = qs("[data-intro-sub]");

function preferredThemeId(): string {
  return prefs.theme && config.themes[prefs.theme] ? prefs.theme : config.active_theme;
}

function effectiveThemeId(question: Question): string {
  if (question.theme_override && config.themes[question.theme_override]) return question.theme_override;
  return preferredThemeId();
}

function motionReduced(): boolean {
  if (prefs.reducedMotion === true) return true;
  if (prefs.reducedMotion === false) return false;
  return config.global.reduced_motion_fallback ? prefersReducedMotion() : false;
}

function applyMotionPreference(): void {
  const isReduced = motionReduced();
  document.documentElement.dataset.motion = isReduced ? "soft" : "full";
  sceneApi?.setReduced(isReduced);
}

function applyTheme(themeId: string): Theme {
  const theme = themeFor(config, themeId);
  const root = document.documentElement;
  const c = theme.colors;
  const t = theme.type;

  root.style.setProperty("--c-primary", c.primary);
  root.style.setProperty("--c-secondary", c.secondary);
  root.style.setProperty("--c-accent", c.accent);
  root.style.setProperty("--c-ink", c.ink);
  root.style.setProperty("--c-paper", c.paper);
  root.style.setProperty("--c-highlight", c.highlight);
  root.style.setProperty("--grad-1", c.background_gradient[0]);
  root.style.setProperty("--grad-2", c.background_gradient[1]);
  root.style.setProperty("--grad-3", c.background_gradient[2]);
  root.style.setProperty("--font-display", t.display);
  root.style.setProperty("--font-display-weight", String(t.display_weight));
  root.style.setProperty("--font-hand", t.hand);
  root.style.setProperty("--font-hand-weight", String(t.hand_weight));
  root.style.setProperty("--font-body", t.body);
  root.style.setProperty("--font-body-weight", String(t.body_weight));

  root.dataset.theme = themeId;
  root.dataset.layout = theme.layout;
  root.dataset.decor = theme.decor;
  root.dataset.themeMotion = theme.motion;
  root.dataset.material = theme.material;
  root.dataset.scene = theme.scene;
  document.body.dataset.theme = themeId;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", c.background_gradient[0]);

  currentThemeId = themeId;
  currentTheme = theme;
  const clawLayer = qs("[data-claw-layer]");
  if (clawLayer) clawLayer.replaceChildren();
  if (theme.signature_moment === "claw_marks") restoreClaws();

  if (sceneApi && currentSceneKey !== theme.scene) {
    currentSceneKey = theme.scene;
    if (canvas) {
      gsap.to(canvas, {
        opacity: 0,
        duration: motionReduced() ? 0.08 : 0.28,
        ease: "power2.in",
        onComplete: () => {
          sceneApi?.setTheme(theme, motionReduced());
          if (!ended && questionScene && !questionScene.hidden) {
            gsap.to(canvas, { opacity: 1, duration: motionReduced() ? 0.15 : 0.8, ease: "power2.out", delay: 0.04 });
          }
        },
      });
    } else {
      sceneApi.setTheme(theme, motionReduced());
    }
  } else if (sceneApi && !currentSceneKey) {
    currentSceneKey = theme.scene;
    sceneApi.setTheme(theme, motionReduced());
  }

  return theme;
}

function findQuestion(id: string | undefined): Question | undefined {
  return config.questions.find((question) => question.id === id);
}

function nextQuestionId(id: string): string | undefined {
  const index = config.questions.findIndex((question) => question.id === id);
  if (index < 0) return config.questions[0]?.id;
  return config.questions[index + 1]?.id;
}

function resolveAudio(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^(https?:)?\/\//.test(src) || src.startsWith("/")) return src;
  return `/${src}`;
}

function resolvePhoto(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith("/")) return src;
  return `/${src}`;
}

function populateHeroPhoto(root: HTMLElement, isReduced: boolean): void {
  const figure = root.querySelector<HTMLElement>("[data-hero-photo]");
  if (!figure) return;
  const indices =
    currentTheme.ending.photo_indices ??
    (currentTheme.ending.photo_index !== undefined ? [currentTheme.ending.photo_index] : []);
  if (indices.length === 0) {
    figure.hidden = true;
    return;
  }
  const photos = config.global.her_photos ?? [];
  const single = config.global.her_photo;
  const singleEntry = single
    ? { src: single, alt: config.global.her_photo_alt, caption: config.global.her_photo_caption }
    : null;
  const entries = indices
    .map((index) => singleEntry ?? photos[index] ?? null)
    .filter((entry): entry is { src: string; alt?: string; caption?: string } => Boolean(entry));
  if (entries.length === 0) {
    figure.hidden = true;
    return;
  }
  const imgs = Array.from(figure.querySelectorAll<HTMLImageElement>("[data-hero-photo-img]"));
  imgs.forEach((img, index) => {
    const entry = entries[index] ?? entries[entries.length - 1];
    if (!entry?.src) {
      img.style.display = "none";
      return;
    }
    img.src = resolvePhoto(entry.src);
    img.alt = entry.alt || "a portrait";
    img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
  });
  const caption = figure.querySelector<HTMLElement>("[data-hero-photo-caption]");
  if (caption) {
    caption.textContent =
      currentTheme.ending.photo_caption ||
      entries[0].caption ||
      config.global.her_photo_caption ||
      "";
  }
  figure.hidden = false;
  endingScene.classList.add("has-photo");
  gsap.set(figure, { autoAlpha: 0, y: 18, scale: 0.92, rotate: -6 });
  gsap.to(figure, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    rotate: -2,
    duration: isReduced ? 0.3 : 0.9,
    delay: isReduced ? 0.15 : 2.1,
    ease: "back.out(1.5)",
  });
}

function updateMusic(question: Question, theme: Theme): void {
  audio.setTrack(resolveAudio(question.music_override ?? theme.music ?? config.global.music));
}

function showWhisper(text: string): void {
  if (!whisperEl || !text) return;
  lastWhisper = text;
  whisperEl.textContent = text;
  const token = (whisperEl as HTMLElement & { _token?: number })._token ?? 0;
  const next = token + 1;
  (whisperEl as HTMLElement & { _token?: number })._token = next;
  gsap.killTweensOf(whisperEl);
  gsap.fromTo(
    whisperEl,
    { opacity: 0, y: 8 },
    {
      opacity: 1,
      y: 0,
      duration: motionReduced() ? 0.2 : 0.5,
      ease: EASE.pillow,
      onComplete: () => {
        gsap.delayedCall(2.6, () => {
          if ((whisperEl as HTMLElement & { _token?: number })._token === next) {
            gsap.to(whisperEl, { opacity: 0, y: -4, duration: 0.6, ease: EASE.hush });
          }
        });
      },
    }
  );
}

function pickWhisper(question: Question): string {
  const pool = question.whispers?.length ? question.whispers : config.whispers;
  if (!pool.length) return "";
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && pick === lastWhisper) {
    pick = pool[(pool.indexOf(pick) + 1) % pool.length];
  }
  return pick;
}

function triggerShimmer(): void {
  if (currentTheme.signature_moment !== "foil_shimmer" && currentTheme.motion !== "shimmer") return;
  document.documentElement.classList.add("is-shimmer");
  window.setTimeout(() => document.documentElement.classList.remove("is-shimmer"), 1200);
}

function addClawMark(btn: HTMLButtonElement): void {
  if (currentTheme.signature_moment !== "claw_marks") return;
  const layer = qs("[data-claw-layer]");
  if (!layer) return;
  const rect = btn.getBoundingClientRect();
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mark.setAttribute("viewBox", "0 0 80 80");
  mark.classList.add("claw-mark");
  mark.style.left = `${rect.left + rect.width * (0.25 + Math.random() * 0.5)}px`;
  mark.style.top = `${rect.top - 18}px`;
  mark.style.setProperty("--claw-rotation", `${-24 + Math.random() * 48}deg`);
  mark.innerHTML =
    '<path d="M8 10c14 10 24 24 30 44"/><path d="M22 4c12 12 20 26 25 46"/><path d="M38 2c10 13 16 28 19 48"/>';
  layer.append(mark);
  const saved = JSON.parse(sessionStorage.getItem("pocket-mood.claws") ?? "[]") as { left: string; top: string }[];
  saved.push({ left: mark.style.left, top: mark.style.top });
  sessionStorage.setItem("pocket-mood.claws", JSON.stringify(saved.slice(-8)));
}

function restoreClaws(): void {
  const layer = qs("[data-claw-layer]");
  if (!layer) return;
  layer.replaceChildren();
  const saved = JSON.parse(sessionStorage.getItem("pocket-mood.claws") ?? "[]") as { left: string; top: string }[];
  saved.forEach((mark) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 80 80");
    svg.classList.add("claw-mark");
    svg.style.left = mark.left;
    svg.style.top = mark.top;
    svg.innerHTML =
      '<path d="M8 10c14 10 24 24 30 44"/><path d="M22 4c12 12 20 26 25 46"/><path d="M38 2c10 13 16 28 19 48"/>';
    layer.append(svg);
  });
}

function bindRain(): void {
  const layer = qs("[data-rain-layer]");
  if (!layer || layer.childElementCount > 0) return;
  const addDrop = () => {
    const drop = document.createElement("span");
    drop.className = "rain-drop";
    const edge = Math.random() > 0.5;
    drop.style.left = edge ? `${2 + Math.random() * 10}%` : `${88 + Math.random() * 9}%`;
    drop.style.top = `${8 + Math.random() * 78}%`;
    drop.style.width = `${7 + Math.random() * 6}px`;
    drop.style.height = `${18 + Math.random() * 14}px`;
    drop.addEventListener("click", () => {
      drop.classList.add("is-splashing");
      window.setTimeout(() => drop.remove(), 600);
      window.setTimeout(addDrop, 1400);
    });
    layer.append(drop);
  };
  for (let i = 0; i < 9; i += 1) window.setTimeout(addDrop, i * 180);
}

function bumpCoin(): void {
  if (currentTheme.signature_moment !== "coin_counter") return;
  coinValue += 1;
  sessionStorage.setItem("pocket-mood.coins", String(coinValue));
  const value = qs("[data-coin-value]");
  if (!value) return;
  value.textContent = String(coinValue);
  gsap.fromTo(
    value,
    { scale: 1 },
    { scale: 1.18, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.out", transformOrigin: "50% 50%" }
  );
}

function showStickerKeepsake(): void {
  if (currentTheme.ending.animation !== "sticker_drop") return;
  const sticker = qs<HTMLButtonElement>("[data-sticker-keepsake]");
  if (!sticker) return;
  sticker.hidden = false;
  gsap.fromTo(
    sticker,
    { scale: 0.3, rotate: -22, opacity: 0 },
    { scale: 1, rotate: -8, opacity: 1, duration: 0.9, ease: "back.out(1.7)" }
  );
  sticker.onclick = () => {
    gsap.to(sticker, {
      scale: 0.3,
      rotate: 24,
      opacity: 0,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        sticker.hidden = true;
      },
    });
  };
}

function bindButton(btn: HTMLButtonElement, def: QuestionButton, question: Question): void {
  btn.addEventListener("pointerenter", () => {
    if (!finePointer.matches || locked) return;
    if (def.role === "correct") triggerShimmer();
    void runPhase(def.on_hover, def, btn, question, "hover");
  });

  btn.addEventListener("pointerleave", () => resetHover(btn));

  btn.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    btn.dataset.touching = "1";
    try {
      btn.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be refused. The tap still works.
    }
    void runPhase(def.on_tap, def, btn, question, "tap");
  });

  btn.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") return;
    if (btn.dataset.touching !== "1") return;
    delete btn.dataset.touching;
    void activate(def, btn, question);
  });

  btn.addEventListener("pointercancel", () => {
    delete btn.dataset.touching;
  });

  btn.addEventListener("click", (event) => {
    const pointerType = (event as PointerEvent).pointerType;
    if (pointerType === "touch" || pointerType === "pen") return;
    void activate(def, btn, question);
  });
}

function createButton(def: QuestionButton, index: number, question: Question): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "answer";
  btn.dataset.role = def.role;
  btn.dataset.index = String(index);
  btn.dataset.labelIndex = "0";
  if (question.id === "yarn_picker") btn.dataset.yarn = "true";

  const label = document.createElement("span");
  label.className = "answer__label";
  label.textContent = def.label;
  btn.append(label);
  btn.setAttribute("aria-label", def.label);

  bindButton(btn, def, question);
  answersEl.append(btn);
  return btn;
}

async function runPhase(
  name: string | undefined,
  def: QuestionButton,
  btn: HTMLButtonElement,
  question: Question,
  phase: BehaviorPhase
): Promise<void> {
  if (!name || locked) return;
  await runBehavior(name, {
    btn,
    def,
    buttons: currentButtons,
    question,
    reduced: motionReduced(),
    phase,
    whisper: showWhisper,
    lines: config.behavior_lines,
  });
}

function bumpCorrectButtons(): void {
  currentButtons.forEach((btn) => {
    if (btn.dataset.role !== "correct") return;
    btn.classList.add("answer--glow");
    gsap.fromTo(
      btn,
      { scale: 1 },
      { scale: motionReduced() ? 1 : 1.04, duration: 0.2, yoyo: true, repeat: 1, ease: "sine.inOut" }
    );
    window.setTimeout(() => btn.classList.remove("answer--glow"), 900);
  });
}

async function wrongFeedback(def: QuestionButton, btn: HTMLButtonElement, question: Question): Promise<void> {
  const recentlyCycled = performance.now() - Number(btn.dataset.lastCycle ?? 0) < 340;
  if (def.labels_cycle && !recentlyCycled) cycleLabel(btn, def.labels_cycle);

  showWhisper(pickWhisper(question));
  bumpCorrectButtons();
  addClawMark(btn);
  bumpCoin();

  question.buttons.forEach((buttonDef, index) => {
    const candidate = currentButtons[index];
    if (!candidate || candidate.dataset.role !== "correct") return;
    if ([buttonDef.on_hover, buttonDef.on_tap, buttonDef.on_click].includes("pop_up")) {
      void runBehavior("pop_up", {
        btn: candidate,
        def: buttonDef,
        buttons: currentButtons,
        question,
        reduced: motionReduced(),
        phase: "click",
        whisper: showWhisper,
        lines: config.behavior_lines,
      });
    }
  });
}

async function activate(def: QuestionButton, btn: HTMLButtonElement, question: Question): Promise<void> {
  if (locked || ended || activating) return;
  if (btn.dataset.state === "gone") return;
  activating = true;
  try {
    bumpCoin();
    if (btn.dataset.role === "correct") triggerShimmer();
    const result = await runBehavior(def.on_click, {
      btn,
      def,
      buttons: currentButtons,
      question,
      reduced: motionReduced(),
      phase: "click",
      whisper: showWhisper,
      lines: config.behavior_lines,
    });

    if (result === "consume") {
      if (btn.dataset.role !== "correct") await wrongFeedback(def, btn, question);
      return;
    }

    const isCorrect = btn.dataset.role === "correct";
    if (result === "advance" || isCorrect) {
      if (isCorrect) {
        btn.classList.add("answer--glow");
        await pulse(btn, motionReduced());
      }
      locked = true;
      const target = def.next ?? nextQuestionId(question.id);
      await wait(motionReduced() ? 0.03 : 0.14);
      await advance(target, question);
      return;
    }

    await wrongFeedback(def, btn, question);
  } finally {
    activating = false;
  }
}

async function advance(target: string | undefined, question: Question): Promise<void> {
  const index = config.questions.findIndex((item) => item.id === question.id);
  const isLast = index === config.questions.length - 1;
  if (target === "ending" || (!target && isLast)) {
    await showEnding();
    return;
  }
  let resolved = target && findQuestion(target) ? target : undefined;
  if (!resolved) resolved = nextQuestionId(question.id);
  if (!resolved) {
    await showEnding();
    return;
  }
  await renderQuestion(resolved);
}

async function renderQuestion(id: string, skipExit = false): Promise<void> {
  const question = findQuestion(id);
  if (!question) return;
  const token = ++transitionToken;
  const exitMotion = currentTheme.motion;
  locked = true;

  if (!skipExit) {
    await sceneExit(questionScene, exitMotion, motionReduced());
  }
  if (token !== transitionToken) return;

  currentQuestion = question;
  const themeId = effectiveThemeId(question);
  const theme = applyTheme(themeId);

  endingScene.hidden = true;
  questionScene.hidden = false;
  if (canvas) gsap.to(canvas, { opacity: 1, duration: motionReduced() ? 0.15 : 0.75, ease: "power2.out" });
  gsap.set(questionScene, { clearProps: "filter,opacity" });

  eyebrowEl.textContent = question.eyebrow ?? "";
  const text = question.text_by_theme?.[themeId] ?? question.text;
  splitWords(questionEl, text);
  answersEl.replaceChildren();
  currentButtons = question.buttons.map((def, index) => createButton(def, index, question));
  whisperEl.textContent = "";
  gsap.set(whisperEl, { opacity: 0 });

  updateMusic(question, theme);
  questionEntrance(questionScene, { reduced: motionReduced(), motion: theme.motion });

  ended = false;
  locked = false;

  window.setTimeout(() => {
    if (!questionScene.hidden) questionEl.focus({ preventScroll: true });
  }, 120);
}

function buildEndingActions(): void {
  endingActions.replaceChildren();

  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "soft-btn";
  const replayIcon = document.createElement("i");
  replayIcon.className = "fa-solid fa-rotate-right";
  replayIcon.setAttribute("aria-hidden", "true");
  const replayLabel = document.createElement("span");
  replayLabel.textContent = config.ending.replay_label;
  replay.append(replayIcon, replayLabel);
  replay.addEventListener("click", () => void showEnding(lastEndingTheme));

  const restart = document.createElement("button");
  restart.type = "button";
  restart.className = "soft-btn";
  const restartIcon = document.createElement("i");
  restartIcon.className = "fa-solid fa-arrow-rotate-left";
  restartIcon.setAttribute("aria-hidden", "true");
  const restartLabel = document.createElement("span");
  restartLabel.textContent = config.ending.restart_label;
  restart.append(restartIcon, restartLabel);
  restart.addEventListener("click", () => restartExperience());

  endingActions.append(replay, restart);
}

async function showEnding(themeId = preferredThemeId()): Promise<void> {
  locked = true;
  ended = true;
  hideInstall();
  const theme = applyTheme(themeId);
  audio.setTrack(resolveAudio(theme.music ?? config.global.music));

  if (!questionScene.hidden) {
    await sceneExit(questionScene, theme.motion, motionReduced());
  }
  if (canvas) gsap.to(canvas, { opacity: 0, duration: motionReduced() ? 0.2 : 0.7, ease: "power2.in" });
  questionScene.hidden = true;
  endingScene.hidden = false;
  endingScene.classList.remove("has-photo");
  const keepsake = qs<HTMLButtonElement>("[data-sticker-keepsake]");
  if (keepsake) keepsake.hidden = true;
  endingHost.replaceChildren();
  endingActions.classList.remove("is-ready");

  const animation = theme.ending.animation;
  const template =
    endingScene.querySelector<HTMLTemplateElement>(`template[data-ending="${animation}"]`) ??
    endingScene.querySelector<HTMLTemplateElement>("template");
  if (!template) return;

  endingHost.append(template.content.cloneNode(true));
  const root = endingHost.querySelector<HTMLElement>("[data-ending-scene]");
  if (!root) return;

  populateHeroPhoto(root, motionReduced());
  buildEndingActions();
  gsap.set(endingActions, { opacity: 0 });

  await playEnding(animation, {
    root,
    note: theme.ending.note,
    signature: theme.ending.signature,
    reduced: motionReduced(),
    theme,
  });

  gsap.to(endingActions, {
    opacity: 1,
    duration: 0.8,
    ease: EASE.hush,
    onComplete: () => endingActions.classList.add("is-ready"),
  });
  lastEndingTheme = themeId;
  prefs = patchPrefs({ lastEndingTheme: themeId });
  showStickerKeepsake();

  if (config.global.install_prompt && !prefs.installDismissed) {
    gsap.delayedCall(1.8, showInstall);
  }
}

function restartExperience(): void {
  transitionToken += 1;
  hideInstall();
  const sticker = qs<HTMLButtonElement>("[data-sticker-keepsake]");
  if (sticker) sticker.hidden = true;
  endingScene.hidden = true;
  questionScene.hidden = false;
  ended = false;
  locked = false;
  activating = false;
  if (canvas) gsap.to(canvas, { opacity: 1, duration: 0.7, ease: "power2.out" });
  gsap.set(questionScene, { clearProps: "filter,opacity" });
  void renderQuestion(config.questions[0].id, true);
}

function playIntro(): Promise<void> {
  if (!introEl || !config.intro?.line) return Promise.resolve();
  if (introLine) introLine.textContent = config.intro.line;
  if (introSub) introSub.textContent = config.intro.subline;
  introEl.hidden = false;
  gsap.set([introLine, introSub], { autoAlpha: 0 });
  const reduced = motionReduced();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      gsap.to([introLine, introSub], {
        autoAlpha: 0,
        y: -12,
        duration: reduced ? 0.16 : 0.6,
        ease: EASE.hush,
        onComplete: () => {
          introEl.hidden = true;
          resolve();
        },
      });
    };
    const skip = (event: Event) => {
      if (event.type === "keydown") {
        const key = (event as KeyboardEvent).key;
        if (key !== "Enter" && key !== " ") return;
      }
      finish();
    };
    introEl.addEventListener("pointerdown", skip, { once: true });
    introEl.addEventListener("keydown", skip);

    gsap
      .timeline()
      .fromTo(
        introLine,
        { autoAlpha: 0, y: 24, filter: "blur(10px)" },
        { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: reduced ? 0.4 : 1.2, ease: EASE.pillow }
      )
      .fromTo(
        introSub,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: reduced ? 0.3 : 0.9, ease: EASE.hush },
        reduced ? 0.1 : 0.55
      );

    gsap.delayedCall(Math.max(0.8, config.intro.duration / 1000), finish);
  });
}

async function initThree(): Promise<void> {
  if (!canvas) return;
  try {
    const { createThreeScene } = await import("./three-scene");
    sceneApi = await createThreeScene(canvas, {
      maxPixelRatio: config.global.max_pixel_ratio,
      maxPixelRatioMobile: config.global.max_pixel_ratio_mobile,
      reduced: motionReduced(),
    });
    currentSceneKey = "";
    applyTheme(currentThemeId);
    canvas.classList.add("is-ready");
    if (!ended) gsap.to(canvas, { opacity: 1, duration: 1.1, ease: "power2.out" });
  } catch {
    canvas.style.display = "none";
  }
}

function bindMusic(): void {
  const toggle = qs<HTMLButtonElement>("[data-music-toggle]");
  if (!toggle) return;

  const update = () => {
    const muted = prefs.muted ?? false;
    toggle.setAttribute("aria-pressed", String(muted));
    toggle.setAttribute("aria-label", muted ? "turn music on" : "turn music off");
    toggle.classList.toggle("is-playing", !muted && audio.playing);
  };

  update();
  toggle.addEventListener("click", () => {
    audio.unlock();
    prefs = patchPrefs({ muted: !(prefs.muted ?? false) });
    audio.setMuted(prefs.muted ?? false);
    update();
  });

  window.setInterval(update, 1400);
}

function bindGlobalGestures(): void {
  const unlock = () => {
    audio.unlock();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function bindSecret(): void {
  const star = qs<HTMLButtonElement>("#secret-trigger");
  if (!star) return;
  if (!config.global.easter_egg_enabled) {
    star.hidden = true;
    return;
  }

  const requiredTaps = Math.max(1, config.easter_egg.unlock_after_taps ?? config.global.secret_taps ?? 2);
  let taps = 0;

  star.addEventListener("click", () => {
    taps += 1;
    star.classList.remove("is-woken");
    void star.offsetWidth;
    star.classList.add("is-woken");
    gsap.delayedCall(0.9, () => star.classList.remove("is-woken"));

    if (taps >= requiredTaps) {
      taps = 0;
      openPanel();
    } else if (!questionScene.hidden) {
      showWhisper("one more tap, if you are curious");
    }
  });
}

function applyPanelState(): void {
  const chips = document.querySelectorAll<HTMLElement>("[data-theme-chips] .chip");
  chips.forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.theme === preferredThemeId()));
  });

  const slider = qs<HTMLInputElement>("[data-volume]");
  if (slider) slider.value = String(Math.round((prefs.volume ?? config.global.music_volume) * 100));

  const motionButton = qs<HTMLButtonElement>("[data-motion-toggle]");
  if (motionButton) {
    const mode = prefs.reducedMotion;
    const label = mode === undefined ? "follow device" : mode ? "soft motion" : "full motion";
    const span = motionButton.querySelector("span");
    if (span) span.textContent = label;
    motionButton.setAttribute("aria-pressed", String(motionReduced()));
  }
}

function selectTheme(id: string): void {
  prefs = patchPrefs({ theme: id });
  applyPanelState();
  const showingEnding = !endingScene.hidden;
  if (showingEnding) {
    void showEnding(id);
  } else {
    void renderQuestion(currentQuestion.id);
  }
}

function openPanel(): void {
  if (panelOpen) return;
  panelOpen = true;
  lastFocus = document.activeElement as HTMLElement | null;
  applyPanelState();
  qs("#secret-backdrop")?.classList.add("is-open");
  const sheet = qs("#secret-sheet");
  sheet?.classList.add("is-open");
  sheet?.setAttribute("aria-hidden", "false");
  sheet?.removeAttribute("inert");
  document.getElementById("app")?.setAttribute("inert", "");
  document.addEventListener("keydown", onPanelKey);
  window.setTimeout(() => qs<HTMLButtonElement>("[data-close-panel]")?.focus(), 120);
}

function closePanel(): void {
  if (!panelOpen) return;
  panelOpen = false;
  qs("#secret-backdrop")?.classList.remove("is-open");
  const sheet = qs("#secret-sheet");
  sheet?.classList.remove("is-open");
  sheet?.setAttribute("aria-hidden", "true");
  sheet?.setAttribute("inert", "");
  document.getElementById("app")?.removeAttribute("inert");
  document.removeEventListener("keydown", onPanelKey);
  lastFocus?.focus?.();
}

function onPanelKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closePanel();
    return;
  }
  if (event.key !== "Tab") return;
  const sheet = qs("#secret-sheet");
  if (!sheet) return;
  const focusables = Array.from(
    sheet.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((node) => node.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindPanel(): void {
  const title = qs("[data-panel-title]");
  const subtitle = qs("[data-panel-subtitle]");
  if (title) title.textContent = config.easter_egg.panel_title;
  if (subtitle) subtitle.textContent = config.easter_egg.panel_subtitle;

  const chips = qs("[data-theme-chips]");
  if (chips) {
    chips.replaceChildren();
    Object.entries(config.themes).forEach(([id, theme]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.theme = id;
      chip.setAttribute("aria-pressed", String(id === preferredThemeId()));
      const dot = document.createElement("span");
      dot.className = "chip__dot";
      dot.style.background = `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`;
      const label = document.createElement("span");
      label.textContent = theme.label;
      chip.append(dot, label);
      chip.addEventListener("click", () => selectTheme(id));
      chips.append(chip);
    });
  }

  qs("#secret-backdrop")?.addEventListener("click", closePanel);
  qs("[data-close-panel]")?.addEventListener("click", closePanel);

  const slider = qs<HTMLInputElement>("[data-volume]");
  if (slider) {
    slider.addEventListener("input", () => {
      const value = Number(slider.value) / 100;
      prefs = patchPrefs({ volume: value });
      audio.setVolume(value);
      if (!(prefs.muted ?? false)) audio.unlock();
    });
  }

  const motionButton = qs<HTMLButtonElement>("[data-motion-toggle]");
  if (motionButton) {
    motionButton.addEventListener("click", () => {
      const current = prefs.reducedMotion;
      const next = current === undefined ? true : current === true ? false : undefined;
      prefs = patchPrefs({ reducedMotion: next });
      applyMotionPreference();
      applyPanelState();
    });
  }

  const replayButton = qs<HTMLButtonElement>("[data-replay-ending]");
  if (replayButton) {
    replayButton.addEventListener("click", () => {
      closePanel();
      void showEnding(lastEndingTheme);
    });
  }

  const restartButton = qs<HTMLButtonElement>("[data-restart]");
  if (restartButton) {
    restartButton.addEventListener("click", () => {
      closePanel();
      restartExperience();
    });
  }

  applyPanelState();
}

function showInstall(): void {
  if (prefs.installDismissed) return;
  const install = qs("#install");
  if (!install) return;
  const title = qs("[data-install-title]");
  const body = qs("[data-install-body]");
  const action = qs<HTMLButtonElement>("[data-install-action]");
  if (title) title.textContent = config.install.title;
  if (body) {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    body.textContent = deferredPrompt
      ? config.install.body
      : isIos
        ? "Tap the Share button, then Add to Home Screen."
        : "Open your browser menu, then choose Install app or Add to Home Screen.";
  }
  if (action) {
    action.textContent = config.install.button;
    action.hidden = !deferredPrompt;
  }
  install.classList.add("is-open");
  install.setAttribute("aria-hidden", "false");
  install.removeAttribute("inert");
}

function hideInstall(): void {
  const install = qs("#install");
  install?.classList.remove("is-open");
  install?.setAttribute("aria-hidden", "true");
  install?.setAttribute("inert", "");
}

function bindInstall(): void {
  const title = qs("[data-install-title]");
  const body = qs("[data-install-body]");
  const action = qs<HTMLButtonElement>("[data-install-action]");
  const dismiss = qs<HTMLButtonElement>("[data-install-dismiss]");
  if (title) title.textContent = config.install.title;
  if (body) body.textContent = config.install.body;
  if (action) action.textContent = config.install.button;
  if (dismiss) {
    dismiss.setAttribute("aria-label", config.install.dismiss);
    dismiss.addEventListener("click", () => {
      prefs = patchPrefs({ installDismissed: true });
      hideInstall();
    });
  }
  if (action) {
    action.addEventListener("click", async () => {
      if (deferredPrompt) {
        const event = deferredPrompt;
        deferredPrompt = null;
        await event.prompt();
        await event.userChoice.catch(() => undefined);
        hideInstall();
      } else {
        hideInstall();
        if (!questionScene.hidden) showWhisper("browser menu, then add to home screen");
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallEvent;
  });
  window.addEventListener("appinstalled", hideInstall);
}

function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

function bindMotionPreference(): void {
  reduceQuery.addEventListener("change", () => {
    if (prefs.reducedMotion !== undefined) return;
    applyMotionPreference();
  });
}

async function start(): Promise<void> {
  applyTheme(preferredThemeId());
  applyMotionPreference();
  audio.setVolume(prefs.volume ?? config.global.music_volume, false);
  audio.setMuted(prefs.muted ?? false);
  bindGlobalGestures();
  bindMusic();
  bindSecret();
  bindPanel();
  bindInstall();
  bindMotionPreference();
  bindRain();
  registerServiceWorker();

  const first = config.questions[0];
  if (!first) return;

  await playIntro();
  await renderQuestion(first.id, true);

  gsap.delayedCall(2.2, () => void initThree());
}

void start();
