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

const questionScene = required("#question-scene");
const endingScene = required("#ending-scene");
const endingHost = required("#ending-host");
const endingActions = required("[data-ending-actions]");
const eyebrowEl = required("[data-eyebrow]");
const questionEl = required("[data-question]");
const answersEl = required("[data-answers]");
const whisperEl = required("[data-whisper]");
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

function applyTypography(): void {
  const root = document.documentElement;
  root.style.setProperty("--font-heading", `"${config.fonts.heading}", "Segoe Script", cursive`);
  root.style.setProperty("--font-sub", `"${config.fonts.subheading}", "Dancing Script", cursive`);
  root.style.setProperty("--font-body", `"${config.fonts.body}", "Trebuchet MS", sans-serif`);
}

function applyTheme(themeId: string): Theme {
  const theme = themeFor(config, themeId);
  const root = document.documentElement;
  root.style.setProperty("--c-primary", theme.colors.primary);
  root.style.setProperty("--c-secondary", theme.colors.secondary);
  root.style.setProperty("--c-accent", theme.colors.accent);
  root.style.setProperty("--c-ink", theme.colors.ink);
  root.style.setProperty("--c-soft", theme.colors.soft);
  root.style.setProperty("--grad-1", theme.colors.background_gradient[0]);
  root.style.setProperty("--grad-2", theme.colors.background_gradient[1]);
  root.style.setProperty("--grad-3", theme.colors.background_gradient[2]);
  document.body.dataset.theme = themeId;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.colors.background_gradient[0]);
  sceneApi?.setTheme(theme, motionReduced());
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

function updateMusic(question: Question, theme: Theme): void {
  audio.setTrack(resolveAudio(question.music_override ?? theme.music));
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

function bindButton(btn: HTMLButtonElement, def: QuestionButton, question: Question): void {
  btn.addEventListener("pointerenter", () => {
    if (!finePointer.matches || locked) return;
    void runPhase(def.on_hover, def, btn, question, "hover");
  });

  btn.addEventListener("pointerleave", () => resetHover(btn));

  btn.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    btn.dataset.touching = "1";
    try {
      btn.setPointerCapture(event.pointerId);
    } catch {
      // Some older engines refuse capture. The tap still works.
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
      await wait(motionReduced() ? 0.04 : 0.16);
      await advance(target, question.transition_out);
      return;
    }

    await wrongFeedback(def, btn, question);
  } finally {
    activating = false;
  }
}

async function advance(target: string | undefined, transition = "fade_soft"): Promise<void> {
  const index = config.questions.findIndex((question) => question.id === currentQuestion.id);
  const isLast = index === config.questions.length - 1;
  if (target === "ending" || (!target && isLast)) {
    await showEnding();
    return;
  }

  let resolved = target && findQuestion(target) ? target : undefined;
  if (!resolved) resolved = nextQuestionId(currentQuestion.id);
  if (!resolved) {
    await showEnding();
    return;
  }
  await renderQuestion(resolved, transition);
}

async function renderQuestion(id: string, transition = "fade_soft", skipExit = false): Promise<void> {
  const question = findQuestion(id);
  if (!question) return;
  const token = ++transitionToken;
  locked = true;

  if (!skipExit) {
    await sceneExit(questionScene, transition, motionReduced());
  }
  if (token !== transitionToken) return;

  currentQuestion = question;
  const themeId = effectiveThemeId(question);
  const theme = applyTheme(themeId);

  endingScene.hidden = true;
  questionScene.hidden = false;
  document.getElementById("three-stage")?.classList.remove("is-dimmed");
  gsap.set(questionScene, { clearProps: "filter,opacity" });

  eyebrowEl.textContent = question.eyebrow ?? "";
  const text = question.text_by_theme?.[themeId] ?? question.text;
  splitWords(questionEl, text);
  answersEl.replaceChildren();
  currentButtons = question.buttons.map((def, index) => createButton(def, index, question));
  whisperEl.textContent = "";
  gsap.set(whisperEl, { opacity: 0 });

  updateMusic(question, theme);
  questionEntrance(questionScene, { reduced: motionReduced() });

  ended = false;
  locked = false;
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
  restart.addEventListener("click", () => restartExperience(false));

  endingActions.append(replay, restart);
}

async function showEnding(themeId = preferredThemeId()): Promise<void> {
  locked = true;
  ended = true;
  hideInstall();
  const theme = applyTheme(themeId);
  audio.setTrack(resolveAudio(theme.music));

  if (!questionScene.hidden) {
    await sceneExit(questionScene, "ending_glow", motionReduced());
  }
  questionScene.hidden = true;
  endingScene.hidden = false;
  document.getElementById("three-stage")?.classList.add("is-dimmed");
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

  if (config.global.install_prompt && !prefs.installDismissed) {
    gsap.delayedCall(1.8, showInstall);
  }
}

function restartExperience(silent = false): void {
  transitionToken += 1;
  hideInstall();
  endingScene.hidden = true;
  questionScene.hidden = false;
  ended = false;
  locked = false;
  activating = false;
  gsap.set(questionScene, { clearProps: "filter,opacity" });
  void renderQuestion(config.questions[0].id, silent ? "fade_soft" : "bounce_warm", true);
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
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: reduced ? 0.4 : 1.2,
          ease: EASE.pillow,
        }
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
  const canvas = qs<HTMLCanvasElement>("#three-stage");
  if (!canvas) return;
  try {
    const { createThreeScene } = await import("./three-scene");
    sceneApi = await createThreeScene(canvas, {
      maxPixelRatio: config.global.max_pixel_ratio,
      reduced: motionReduced(),
    });
    applyTheme(effectiveThemeId(currentQuestion));
    canvas.classList.add("is-ready");
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

  const requiredTaps = Math.max(
    1,
    config.easter_egg.unlock_after_taps ?? config.global.secret_taps ?? 2
  );
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

  const replay = qs<HTMLButtonElement>("[data-replay-ending]");
  if (replay) replay.disabled = false;
}

function selectTheme(id: string): void {
  prefs = patchPrefs({ theme: id });
  applyPanelState();
  const showingEnding = !endingScene.hidden;
  if (showingEnding) {
    void showEnding(id);
  } else {
    void renderQuestion(currentQuestion.id, "fade_soft", true);
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
      restartExperience(false);
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
}

function hideInstall(): void {
  const install = qs("#install");
  install?.classList.remove("is-open");
  install?.setAttribute("aria-hidden", "true");
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
  applyTypography();
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
  registerServiceWorker();

  const first = config.questions[0];
  if (!first) return;

  const idle = () => void initThree();
  const requestIdle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (requestIdle) {
    requestIdle(idle, { timeout: 2200 });
  } else {
    globalThis.setTimeout(idle, 900);
  }

  await playIntro();
  await renderQuestion(first.id, "fade_soft", true);
}

void start();
