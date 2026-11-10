import { gsap } from "gsap";
import { getConfig, themeFor } from "./config";
import { readPrefs, patchPrefs, type LocalPrefs } from "./storage";
import {
  EASE,
  initEases,
  prefersReducedMotion,
  questionEntrance,
  sceneExit,
  splitWords,
} from "./animations";
import { resetHover, runBehavior, safeOffset, type BehaviorPhase } from "./behaviors";
import { playEnding } from "./endings";
import { AudioPlayer } from "./audio";
import { mountMinigame, verifyPermission, type MinigameCleanup } from "./minigames";
import { personalityTaunt } from "./personalities";
import { buildPlan, clearSeen, type PlannedQuestion, type SessionPlan } from "./variants";
import { detectCaps, permissionFor } from "./device";
import { printKeepsake } from "./print";
import { preloadThemeFonts, revealText, waitForFonts } from "./reveal";
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
let preferredTheme =
  prefs.theme && config.themes[prefs.theme] ? prefs.theme : config.active_theme;
const audio = new AudioPlayer();
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const caps = detectCaps();
const gameRegistry = config.minigames ?? [];

let sceneApi: ThreeSceneApi | null = null;
let currentQuestion: Question = config.questions[0];
let currentThemeId = "";
let currentTheme: Theme = config.themes[config.active_theme] ?? Object.values(config.themes)[0];
let currentSceneKey = "";
let currentButtons: HTMLButtonElement[] = [];
let interactionCleanup: MinigameCleanup | null = null;
let sessionPlan: SessionPlan | null = null;
let currentBase: Question | null = null;
let currentPlan: PlannedQuestion | null = null;
let currentVariantId = "";
let currentGameId = "";
let lastEndingNote = "";
let newHint: HTMLElement | null = null;
let transitionToken = 0;
let locked = false;
let ended = false;
let activating = false;
type SiteState =
  | "loading"
  | "question_active"
  | "transitioning"
  | "ending_active"
  | "settings_open"
  | "theme_switching";
let siteState: SiteState = "loading";
let stateTimer: number | null = null;
let panelReturnState: SiteState = "question_active";
let pendingTheme: string | null = null;
let themeSwitching = false;
const debugEnabled = new URLSearchParams(location.search).has("debug");
let debugEl: HTMLElement | null = null;
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
const themeVeil = qs<HTMLElement>("[data-theme-veil]");

function timer(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function preferredThemeId(): string {
  return preferredTheme;
}

function effectiveThemeId(_question: Question): string {
  // The theme store is the only source. Question-level overrides are ignored
  // so a choice in settings can never be silently reset mid-story.
  return preferredTheme;
}

function minigameEnabled(id: string): boolean {
  const game = gameRegistry.find((entry) => entry.id === id);
  return prefs.minigames?.[id] ?? game?.enabled_by_default ?? false;
}

function buildSession(record = true): void {
  sessionPlan = buildPlan(config.questions, gameRegistry, {
    caps,
    themeId: preferredTheme,
    enabled: minigameEnabled,
    permission: (kind) => prefs.permissions?.[kind],
    record,
  });
  showNewHint(sessionPlan.newVariants);
  updateDebug();
}

function planFor(question: Question): PlannedQuestion {
  if (!sessionPlan) buildSession();
  const planned = sessionPlan?.questions[question.id];
  if (planned) return planned;
  const fallbackButtons = (question.buttons ?? []).map((button) => ({ ...button }));
  return {
    questionId: question.id,
    variantId: "fallback",
    gameId: fallbackButtons.length ? "buttons" : "choose_item",
    buttons: fallbackButtons,
    text: question.text ?? "",
    microcopy: question.whispers ?? [],
  };
}

function effectiveQuestion(base: Question, plan: PlannedQuestion): Question {
  return {
    ...base,
    text: plan.text || base.text || "",
    whispers: plan.microcopy.length ? plan.microcopy : base.whispers,
    buttons: plan.buttons.length ? plan.buttons : undefined,
    music_override: plan.music ?? base.music_override,
    variants: undefined,
  };
}

function showNewHint(show: boolean): void {
  if (!newHint) {
    newHint = document.createElement("span");
    newHint.className = "new-hint";
    newHint.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';
    newHint.title = "something new today";
    newHint.setAttribute("aria-label", "something new today");
    document.body.append(newHint);
  }
  newHint.classList.toggle("is-visible", show);
}

function setupDebugApi(): void {
  if (!debugEnabled) return;
  (window as unknown as { __pocketMood?: unknown }).__pocketMood = {
    state: () => ({
      state: siteState,
      theme: preferredTheme,
      question: currentQuestion?.id ?? "",
      variant: currentVariantId,
      game: currentGameId,
      panelOpen,
      permissions: { ...(prefs.permissions ?? {}) },
    }),
    plan: () => sessionPlan,
    skip: () => {
      if (siteState !== "question_active") return false;
      completeInteraction(currentQuestion, nextQuestionId(currentBase?.id ?? currentQuestion.id));
      return true;
    },
    forceVariant: (variantId: string) => {
      if (!currentBase || !sessionPlan) return false;
      const variant = currentBase.variants?.find((entry) => entry.id === variantId);
      if (!variant) return false;
      const plan = sessionPlan.questions[currentBase.id];
      if (!plan) return false;
      const buttons = (variant.buttons ?? []).map((button) => ({ ...button }));
      plan.variantId = variant.id;
      plan.text = variant.text ?? currentBase.text ?? "";
      plan.microcopy = variant.microcopy ?? currentBase.whispers ?? [];
      plan.buttons = buttons;
      plan.gameId = buttons.length ? "buttons" : variant.minigame_pool?.[0] ?? "choose_item";
      currentPlan = plan;
      currentVariantId = variant.id;
      currentGameId = plan.gameId;
      void renderQuestion(currentBase.id, true);
      return true;
    },
    forceGame: (id: string) => {
      if (!currentBase || !sessionPlan) return false;
      const plan = sessionPlan.questions[currentBase.id];
      if (!plan) return false;
      const game = gameRegistry.find((entry) => entry.id === id);
      if (id !== "buttons" && (!game || game.status !== "ready")) return false;
      plan.gameId = id;
      if (id !== "buttons") plan.buttons = [];
      currentPlan = plan;
      currentGameId = id;
      if (siteState === "question_active") {
        interactionCleanup?.();
        interactionCleanup = null;
        void renderQuestion(currentBase.id, true);
      }
      return true;
    },
  };
}

function showToast(text: string): void {
  const toast = document.createElement("div");
  toast.className = "minigame-toast";
  toast.textContent = text;
  document.body.append(toast);
  gsap.fromTo(toast, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
  window.setTimeout(() => {
    gsap.to(toast, { opacity: 0, y: -6, duration: 0.3, ease: "power2.in", onComplete: () => toast.remove() });
  }, 2600);
}

function ensureDebugOverlay(): void {
  if (!debugEnabled || debugEl) return;
  debugEl = document.createElement("div");
  debugEl.className = "debug-overlay";
  debugEl.setAttribute("aria-hidden", "true");
  document.body.append(debugEl);
  updateDebug();
}

function updateDebug(): void {
  if (!debugEl) return;
  const audioState = audio.hasError
    ? "error"
    : audio.playing
      ? "playing"
      : audio.waitingForGesture
        ? "waiting"
        : audio.hasTrack
          ? "ready"
          : "none";
  debugEl.textContent = `state ${siteState}
theme ${preferredTheme} (${currentThemeId || "-"})
question ${currentQuestion?.id ?? "-"}
variant ${currentVariantId || "-"} game ${currentGameId || "-"}
caps touch:${caps.touch} mouse:${caps.mouse} gyro:${caps.gyro} cam:${caps.camera} mic:${caps.mic}
permissions ${Object.entries(prefs.permissions ?? {}).map(([key, value]) => `${key}:${value}`).join(" ") || "-"}
pending ${pendingTheme ?? "-"}
audio ${audioState}
activating ${activating} locked ${locked}
scene ${currentSceneKey || "-"}`;
}

function setState(next: SiteState, timeoutMs = 0, fallback?: () => void): void {
  if (stateTimer !== null) {
    clearTimeout(stateTimer);
    stateTimer = null;
  }
  siteState = next;
  locked = next !== "question_active";
  updateDebug();
  if (timeoutMs > 0 && fallback) {
    stateTimer = window.setTimeout(() => {
      if (siteState === next) {
        console.warn("[state] timeout", next);
        fallback();
      }
    }, timeoutMs);
  }
}

function forceRevealQuestion(): void {
  endingScene.hidden = true;
  questionScene.hidden = false;
  gsap.set(questionScene, { clearProps: "filter,opacity" });
  const sheet = questionScene.querySelector<HTMLElement>("[data-sheet]");
  if (sheet) {
    gsap.killTweensOf(sheet);
    gsap.set(sheet, { clearProps: "transform,opacity", scaleY: 1, opacity: 1, visibility: "visible" });
  }
  questionScene
    .querySelectorAll<HTMLElement>(".word, .answer, .interaction, .eyebrow, .whisper")
    .forEach((element) => gsap.set(element, { opacity: 1, filter: "none" }));
  setState("question_active");
  if (pendingTheme) {
    const next = pendingTheme;
    pendingTheme = null;
    void switchTheme(next);
    return;
  }
  window.setTimeout(() => questionEl.focus({ preventScroll: true }), 60);
}

function recoverQuestion(token: number): void {
  if (token !== transitionToken) return;
  console.warn("[recovery] forcing the question visible");
  forceRevealQuestion();
}

function confirmQuestionVisible(token: number): void {
  if (token !== transitionToken) return;
  const sheet = questionScene.querySelector<HTMLElement>("[data-sheet]");
  const textRect = questionEl.getBoundingClientRect();
  const sheetStyle = sheet ? getComputedStyle(sheet) : null;
  const textStyle = getComputedStyle(questionEl);
  const visible =
    textRect.width > 2 &&
    textRect.height > 2 &&
    Number.parseFloat(textStyle.opacity || "1") > 0.05 &&
    (!sheetStyle ||
      (sheetStyle.visibility !== "hidden" && Number.parseFloat(sheetStyle.opacity || "1") > 0.05));
  if (!visible) {
    console.warn("[mount] question was not visible; forcing reveal");
    forceRevealQuestion();
  }
}

function showThemeVeil(id: string): void {
  if (!themeVeil) return;
  const theme = themeFor(config, id);
  themeVeil.dataset.veilTheme = id;
  themeVeil.style.setProperty("--veil-paper", theme.colors.paper);
  themeVeil.style.setProperty("--veil-accent", theme.colors.primary);
  themeVeil.style.setProperty("--veil-ink", theme.colors.ink);
  themeVeil.setAttribute("aria-hidden", "false");
  themeVeil.classList.add("is-open");
}

function hideThemeVeil(): void {
  if (!themeVeil) return;
  themeVeil.classList.remove("is-open");
  window.setTimeout(() => themeVeil.setAttribute("aria-hidden", "true"), 240);
}

async function switchTheme(id: string): Promise<void> {
  if (themeSwitching) {
    pendingTheme = id;
    return;
  }
  themeSwitching = true;
  setState("theme_switching", 2800, () => {
    hideThemeVeil();
    themeSwitching = false;
    forceRevealQuestion();
  });
  showThemeVeil(id);
  applyTheme(id);
  const showingEnding = !endingScene.hidden;
  await waitForFonts(themeFor(config, id), 1400);
  if (showingEnding) {
    gsap.killTweensOf(Array.from(endingHost.querySelectorAll("*")));
    void showEnding(id);
    await timer(520);
  } else {
    // The question and its minigame are theme-agnostic. Recolouring in place
    // avoids remounting the scene, restarting a game, or replaying a reveal.
    await timer(180);
  }
  closePanel();
  hideThemeVeil();
  themeSwitching = false;
  if (siteState === "theme_switching") {
    setState(showingEnding ? "ending_active" : "question_active");
  }
  if (pendingTheme && pendingTheme !== id) {
    const next = pendingTheme;
    pendingTheme = null;
    void switchTheme(next);
  }
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
  if (debugEnabled) console.info("[theme] read", themeId);
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

  updateDebug();
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
  const keep = figure.querySelector<HTMLButtonElement>("[data-keep-photo]");
  if (keep) {
    const first = entries[0];
    keep.hidden = !first;
    keep.onclick = first
      ? () => printKeepsake(
          resolvePhoto(first.src),
          config.global.print_caption ?? "kept on {date}",
          config.global.print_signature ?? "pocket mood"
        )
      : null;
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

function triggerShimmer(): void {
  if (currentTheme.signature_moment !== "foil_shimmer" && currentTheme.motion !== "shimmer") return;
  document.documentElement.classList.add("is-shimmer");
  window.setTimeout(() => document.documentElement.classList.remove("is-shimmer"), 1200);
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

function dodgeWrong(btn: HTMLButtonElement, def: QuestionButton, event: Event): void {
  if (siteState !== "question_active" || locked || activating || ended) return;
  event.preventDefault();
  event.stopPropagation();
  const now = performance.now();
  if (now - Number(btn.dataset.lastDodge ?? 0) < 420) return;
  btn.dataset.lastDodge = String(now);

  const pointer = event instanceof PointerEvent ? event : null;
  const rect = btn.getBoundingClientRect();
  const correct = currentButtons.find((candidate) => candidate.dataset.role === "correct");
  const correctRect = correct?.getBoundingClientRect() ?? null;
  const direction = pointer && pointer.clientX < rect.left + rect.width / 2 ? 1 : -1;
  let offset = safeOffset(btn, 120, 72);
  let x = direction * Math.max(72, Math.abs(offset.x));
  let y = offset.y;
  const overlapsCorrect = () => {
    if (!correctRect) return false;
    const left = rect.left + x;
    const top = rect.top + y;
    return left < correctRect.right + 10 && left + rect.width > correctRect.left - 10 && top < correctRect.bottom + 10 && top + rect.height > correctRect.top - 10;
  };
  if (overlapsCorrect()) {
    x = -x;
    y = -offset.y;
    if (overlapsCorrect()) {
      x = offset.x;
      y = offset.y;
    }
  }

  const currentX = Number(gsap.getProperty(btn, "x")) || 0;
  const currentY = Number(gsap.getProperty(btn, "y")) || 0;
  btn.dataset.dodging = "1";
  gsap.timeline({ onComplete: () => { delete btn.dataset.dodging; } })
    .to(btn, { x: currentX + x, y: currentY + y, rotate: gsap.utils.random(-7, 7), duration: 0.3, ease: EASE.pillow })
    .to(btn, { scale: 1, duration: 0.18 }, 0);

  if (def.personality) personalityTaunt(def.personality, btn, showWhisper);
}

function bindWrongButton(btn: HTMLButtonElement, def: QuestionButton): void {
  const dodge = (event: Event) => dodgeWrong(btn, def, event);
  btn.addEventListener("pointerenter", (event) => {
    if (finePointer.matches) dodge(event);
  });
  btn.addEventListener("pointerdown", (event) => {
    try { btn.setPointerCapture(event.pointerId); } catch { /* fine */ }
    dodge(event);
  });
  btn.addEventListener("click", (event) => dodge(event));
  btn.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      dodge(event);
    }
  });
}

function bindButton(btn: HTMLButtonElement, def: QuestionButton, question: Question): void {
  if (def.role !== "correct") {
    bindWrongButton(btn, def);
    return;
  }
  btn.addEventListener("pointerenter", () => {
    if (!finePointer.matches || locked) return;
    triggerShimmer();
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
  if (def.personality) {
    btn.dataset.personality = def.personality;
    btn.dataset.personalityStep = "0";
  }

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
  if (!name || locked || siteState !== "question_active") return;
  await runBehavior(name, {
    btn,
    def,
    buttons: currentButtons,
    question,
    reduced: motionReduced(),
    phase,
    whisper: showWhisper,
  });
}

async function activate(def: QuestionButton, btn: HTMLButtonElement, question: Question): Promise<void> {
  if (debugEnabled) console.info("[activate]", def.label, siteState, ended, activating, btn.dataset.role);
  if (btn.dataset.role !== "correct") return;
  if (siteState !== "question_active" || ended || activating) return;
  if (btn.dataset.state === "gone") return;
  activating = true;
  updateDebug();
  const watchdog = window.setTimeout(() => {
    if (!activating) return;
    activating = false;
    console.warn("[activation] timed out");
  }, 2600);
  try {
    bumpCoin();
    triggerShimmer();
    await Promise.race([
      runBehavior(def.on_click, {
        btn,
        def,
        buttons: currentButtons,
        question,
        reduced: motionReduced(),
        phase: "click",
        whisper: showWhisper,
      }),
      timer(1600),
    ]);
    setState("transitioning", 2800, () => forceRevealQuestion());
    btn.classList.add("answer--glow");
    btn.dataset.ready = "true";
    const target = def.next ?? nextQuestionId(question.id);
    await timer(motionReduced() ? 30 : 160);
    await advance(target, question);
  } finally {
    clearTimeout(watchdog);
    activating = false;
    updateDebug();
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

function completeInteraction(question: Question, next?: string): void {
  if (siteState !== "question_active") return;
  setState("transitioning", 2800, () => forceRevealQuestion());
  const target = next ?? nextQuestionId(currentBase?.id ?? question.id);
  void advance(target, question);
}

async function renderQuestion(id: string, skipExit = false): Promise<void> {
  const base = findQuestion(id);
  if (!base) return;
  const plan = planFor(base);
  const question = effectiveQuestion(base, plan);
  currentBase = base;
  currentPlan = plan;
  currentVariantId = plan.variantId;
  currentGameId = plan.gameId;
  currentQuestion = question;
  const token = ++transitionToken;
  const exitMotion = currentTheme.motion;
  setState("transitioning", 3000, () => recoverQuestion(token));
  const upcomingTheme = themeFor(config, effectiveThemeId(base));
  await waitForFonts(upcomingTheme, 1600);

  if (!skipExit) {
    await Promise.race([sceneExit(questionScene, exitMotion, motionReduced()), timer(1200)]);
  }
  if (token !== transitionToken) return;

  gsap.killTweensOf(Array.from(questionScene.querySelectorAll("*")));
  updateDebug();
  const themeId = effectiveThemeId(base);
  const theme = applyTheme(themeId);

  endingScene.hidden = true;
  questionScene.hidden = false;
  const mountSheet = questionScene.querySelector<HTMLElement>("[data-sheet]");
  if (mountSheet) {
    gsap.killTweensOf(mountSheet);
    gsap.set(mountSheet, { clearProps: "transform,opacity", scaleY: 1, opacity: 1, visibility: "visible" });
  }
  if (window.scrollY > 4) {
    window.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" });
  }
  if (canvas) gsap.to(canvas, { opacity: 1, duration: motionReduced() ? 0.15 : 0.75, ease: "power2.out" });
  gsap.set(questionScene, { clearProps: "filter,opacity" });

  eyebrowEl.textContent = question.eyebrow ?? "";
  const text = question.text;
  splitWords(questionEl, text ?? "");
  interactionCleanup?.();
  interactionCleanup = null;
  answersEl.replaceChildren();
  if (plan.gameId === "buttons") {
    currentButtons = (question.buttons ?? []).map((def, index) => createButton(def, index, question));
  } else {
    currentButtons = [];
    interactionCleanup = mountMinigame(answersEl, plan.gameId, {
      question,
      games: gameRegistry,
      caps,
      permissions: prefs.permissions ?? {},
      enabled: minigameEnabled,
      theme,
      reduced: motionReduced(),
      muted: audio.isMuted(),
      complete: () => completeInteraction(question, nextQuestionId(base.id)),
      whisper: showWhisper,
      toast: showToast,
      setPermission: (kind, state) => {
        prefs = patchPrefs({ permissions: { ...(prefs.permissions ?? {}), [kind]: state } });
        updateDebug();
      },
      onGame: (gameId) => {
        currentGameId = gameId;
        updateDebug();
      },
      printCaption: config.global.print_caption,
      printSignature: config.global.print_signature,
    });
  }
  whisperEl.textContent = "";
  gsap.set(whisperEl, { opacity: 0 });

  updateMusic(question, theme);
  const entrance = questionEntrance(questionScene, {
    reduced: motionReduced(),
    motion: plan.animation ?? theme.motion,
  });
  let entranceDone = false;
  entrance.eventCallback("onComplete", () => {
    entranceDone = true;
    if (token !== transitionToken) return;
    if (pendingTheme) {
      const next = pendingTheme;
      pendingTheme = null;
      void switchTheme(next);
      return;
    }
    setState("question_active");
  });
  setState("question_active");
  window.setTimeout(() => confirmQuestionVisible(token), 320);
  window.setTimeout(() => {
    if (token !== transitionToken || entranceDone) return;
    if (siteState !== "question_active" && siteState !== "transitioning") return;
    console.warn("[recovery] question entrance was slow");
    forceRevealQuestion();
  }, 1500);

  ended = false;
  updateDebug();

  window.setTimeout(() => {
    if (!questionScene.hidden && siteState === "question_active") questionEl.focus({ preventScroll: true });
  }, 160);
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

function revealEndingActions(): void {
  gsap.to(endingActions, {
    opacity: 1,
    duration: 0.8,
    ease: EASE.hush,
    onComplete: () => endingActions.classList.add("is-ready"),
    overwrite: "auto",
  });
}

function forceEndingVisible(): void {
  questionScene.hidden = true;
  endingScene.hidden = false;
  endingHost
    .querySelectorAll<HTMLElement>("[data-note], .note-paper, .note-text, .note-sign")
    .forEach((element) => {
      element.style.visibility = "visible";
      element.style.opacity = "1";
    });
  revealEndingActions();
  setState("ending_active");
}

async function showEnding(themeId = preferredThemeId()): Promise<void> {
  ended = true;
  transitionToken += 1;
  interactionCleanup?.();
  interactionCleanup = null;
  hideInstall();
  setState("ending_active", 12000, () => forceEndingVisible());
  const theme = applyTheme(themeId);
  await waitForFonts(theme, 1600);
  audio.setTrack(resolveAudio(theme.music ?? config.global.music));

  if (!questionScene.hidden) {
    await Promise.race([sceneExit(questionScene, theme.motion, motionReduced()), timer(1200)]);
  }
  if (canvas) gsap.to(canvas, { opacity: 0, duration: motionReduced() ? 0.2 : 0.7, ease: "power2.in" });
  questionScene.hidden = true;
  endingScene.hidden = false;
  endingScene.classList.remove("has-photo");
  if (window.scrollY > 4) {
    window.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" });
  }
  const keepsake = qs<HTMLButtonElement>("[data-sticker-keepsake]");
  if (keepsake) keepsake.hidden = true;
  gsap.killTweensOf(Array.from(endingHost.querySelectorAll("*")));
  endingHost.replaceChildren();
  endingActions.classList.remove("is-ready");

  const animation = theme.ending.animation;
  const template =
    endingScene.querySelector<HTMLTemplateElement>(`template[data-ending="${animation}"]`) ??
    endingScene.querySelector<HTMLTemplateElement>("template");
  if (!template) {
    forceEndingVisible();
    return;
  }

  endingHost.append(template.content.cloneNode(true));
  const root = endingHost.querySelector<HTMLElement>("[data-ending-scene]");
  if (!root) {
    forceEndingVisible();
    return;
  }

  populateHeroPhoto(root, motionReduced());
  buildEndingActions();
  gsap.set(endingActions, { opacity: 0 });

  const notes = (theme.ending.notes?.length ? theme.ending.notes : config.ending_notes?.[themeId]) ?? [theme.ending.note];
  const notePool = notes.filter(Boolean);
  let endingNote = notePool[0] ?? theme.ending.note;
  if (notePool.length > 1) {
    const options = notePool.filter((note) => note !== lastEndingNote);
    endingNote = options[Math.floor(Math.random() * options.length)] ?? endingNote;
  }
  lastEndingNote = endingNote;

  try {
    await playEnding(animation, {
      root,
      note: endingNote,
      signature: theme.ending.signature,
      reduced: motionReduced(),
      theme,
    });
  } catch (error) {
    console.warn("[ending] animation failed", error);
  }

  revealEndingActions();
  lastEndingTheme = themeId;
  prefs = patchPrefs({ lastEndingTheme: themeId });
  showStickerKeepsake();
  setState("ending_active");
  updateDebug();

  if (config.global.install_prompt && !prefs.installDismissed) {
    gsap.delayedCall(1.8, showInstall);
  }
}

function restartExperience(): void {
  transitionToken += 1;
  hideInstall();
  const sticker = qs<HTMLButtonElement>("[data-sticker-keepsake]");
  if (sticker) sticker.hidden = true;
  interactionCleanup?.();
  interactionCleanup = null;
  endingScene.hidden = true;
  questionScene.hidden = false;
  if (canvas) gsap.to(canvas, { opacity: 1, duration: motionReduced() ? 0.15 : 0.7, ease: "power2.out" });
  gsap.set(questionScene, { clearProps: "filter,opacity" });
  ended = false;
  activating = false;
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

    void revealText([introLine, introSub].filter((node): node is HTMLElement => Boolean(node)), {
      theme: currentTheme,
      reduced,
      duration: reduced ? 0.35 : 0.9,
      stagger: reduced ? 0.05 : 0.18,
      y: 18,
      ease: EASE.pillow,
    });

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
    const hasTrack = audio.hasTrack;
    const muted = prefs.muted ?? false;
    const playing = audio.playing;
    const waiting = hasTrack && !playing && !muted && !audio.hasError;
    toggle.classList.toggle("is-playing", playing && !muted);
    toggle.classList.toggle("is-waiting", waiting);
    toggle.classList.toggle("is-unavailable", !hasTrack || audio.hasError);
    toggle.disabled = !hasTrack || audio.hasError;
    toggle.setAttribute("aria-pressed", String(muted || !hasTrack));
    toggle.setAttribute(
      "aria-label",
      !hasTrack || audio.hasError
        ? "music unavailable"
        : muted
          ? "turn music on"
          : playing
            ? "turn music off"
            : "start music"
    );
    updateDebug();
  };

  audio.onState(update);
  update();
  toggle.addEventListener("click", () => {
    if (!audio.hasTrack || audio.hasError) return;
    if (!audio.isMuted() && !audio.playing) {
      audio.playNow();
      update();
      return;
    }
    prefs = patchPrefs({ muted: !(prefs.muted ?? false) });
    audio.setMuted(prefs.muted ?? false);
    update();
  });

  window.setInterval(update, 1200);
}

function bindGlobalGestures(): void {
  const unlock = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-music-toggle]")) return;
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

  document.querySelectorAll<HTMLButtonElement>("[data-game-toggle]").forEach((toggle) => {
    const id = toggle.dataset.gameToggle ?? "";
    const game = gameRegistry.find((entry) => entry.id === id);
    toggle.setAttribute("aria-pressed", String(minigameEnabled(id)));
    toggle.disabled = game?.status !== "ready";
  });
}

function selectTheme(id: string): void {
  const valid = config.themes[id] ? id : config.active_theme;
  if (valid === preferredTheme) {
    closePanel();
    return;
  }
  preferredTheme = valid;
  prefs = patchPrefs({ theme: valid });
  if (debugEnabled) console.info("[theme] write", valid);
  applyPanelState();
  closePanel();
  if (themeSwitching || siteState === "theme_switching" || siteState === "transitioning") {
    pendingTheme = valid;
    return;
  }
  void switchTheme(valid);
}

function openPanel(): void {
  if (panelOpen) return;
  if (
    siteState === "loading" ||
    siteState === "transitioning" ||
    siteState === "theme_switching"
  ) return;
  panelOpen = true;
  if (debugEnabled) console.info("[panel] open");
  try {
    preloadThemeFonts(Object.values(config.themes));
  } catch (error) {
    console.warn("[fonts] theme preload failed", error);
  }
  panelReturnState = ended ? "ending_active" : "question_active";
  lastFocus = document.activeElement as HTMLElement | null;
  applyPanelState();
  qs("#secret-backdrop")?.classList.add("is-open");
  const sheet = qs("#secret-sheet");
  sheet?.classList.add("is-open");
  sheet?.setAttribute("aria-hidden", "false");
  sheet?.removeAttribute("inert");
  document.getElementById("app")?.setAttribute("inert", "");
  document.addEventListener("keydown", onPanelKey);
  setState("settings_open");
  window.setTimeout(() => qs<HTMLButtonElement>("[data-close-panel]")?.focus(), 120);
}

function closePanel(): void {
  const wasOpen = panelOpen;
  if (debugEnabled) console.info("[panel] close", wasOpen, siteState);
  panelOpen = false;
  qs("#secret-backdrop")?.classList.remove("is-open");
  const sheet = qs("#secret-sheet");
  sheet?.classList.remove("is-open");
  sheet?.setAttribute("aria-hidden", "true");
  sheet?.setAttribute("inert", "");
  document.getElementById("app")?.removeAttribute("inert");
  document.removeEventListener("keydown", onPanelKey);
  if (wasOpen) {
    setState(panelReturnState);
    lastFocus?.focus?.();
  }
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

  const shuffleButton = qs<HTMLButtonElement>("[data-shuffle]");
  if (shuffleButton) {
    shuffleButton.addEventListener("click", () => {
      clearSeen();
      buildSession();
      showNewHint(false);
      closePanel();
      restartExperience();
    });
  }

  document.querySelectorAll<HTMLButtonElement>("[data-game-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", async () => {
      const id = toggle.dataset.gameToggle ?? "";
      const game = gameRegistry.find((entry) => entry.id === id);
      if (!game || game.status !== "ready") return;
      const next = !minigameEnabled(id);
      if (next) {
        if (game.permissions.includes("camera") && !caps.camera) {
          showToast("no camera here. here is a cute alternative.");
          return;
        }
        if (game.permissions.includes("mic") && !caps.mic) {
          showToast("no microphone here. here is another one.");
          return;
        }
        const kind = permissionFor(game, caps);
        if (kind) {
          const granted = await verifyPermission(kind);
          if (!granted) {
            prefs = patchPrefs({ permissions: { ...(prefs.permissions ?? {}), [kind]: "denied" } });
            showToast("no worries. here is another one instead.");
            applyPanelState();
            return;
          }
          prefs = patchPrefs({ permissions: { ...(prefs.permissions ?? {}), [kind]: "granted" } });
        }
      }
      prefs = patchPrefs({ minigames: { ...(prefs.minigames ?? {}), [id]: next } });
      applyPanelState();
      buildSession(false);
      const currentBaseId = currentBase?.id;
      if (
        currentBaseId &&
        currentPlan?.gameId &&
        currentPlan.gameId !== "buttons" &&
        !minigameEnabled(currentPlan.gameId) &&
        siteState === "question_active"
      ) {
        void renderQuestion(currentBaseId, true);
      }
    });
  });

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
  ensureDebugOverlay();
  setState("loading");
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
  buildSession();
  setupDebugApi();
  window.addEventListener("error", (event) => {
    console.error("[app] uncaught", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[app] rejection", event.reason);
  });

  const first = config.questions[0];
  if (!first) return;

  window.setTimeout(() => {
    if (siteState !== "loading") return;
    console.warn("[recovery] intro did not finish");
    if (introEl) introEl.hidden = true;
    void renderQuestion(first.id, true);
  }, 6000);

  await waitForFonts(currentTheme, 1600);
  await playIntro();
  if (siteState === "loading") {
    await renderQuestion(first.id, true);
  }

  gsap.delayedCall(2.2, () => void initThree());
}

void start();
