import { gsap } from "gsap";
import type { MinigameConfig, Question, Theme } from "../lib/types";
import type { DeviceCaps } from "./device";
import { permissionFor, supportsGame } from "./device";

export type GameCue = "success" | "miss" | "boop" | "scratch";

export interface MinigameHost {
  question: Question;
  games: MinigameConfig[];
  caps: DeviceCaps;
  permissions: Partial<Record<"camera" | "mic" | "motion", "granted" | "denied">>;
  enabled: (id: string) => boolean;
  theme: Theme;
  reduced: boolean;
  muted: boolean;
  complete: () => void;
  whisper: (text: string) => void;
  toast: (text: string) => void;
  setPermission: (kind: "camera" | "mic" | "motion", state: "granted" | "denied") => void;
  onGame?: (id: string) => void;
  printCaption?: string;
  printSignature?: string;
}

export interface MinigameContext extends MinigameHost {
  game: MinigameConfig;
  content: Record<string, unknown>;
  stream: MediaStream | null;
  cue: (kind: GameCue) => void;
}

export type MinigameCleanup = () => void;
type GameMount = (container: HTMLElement, ctx: MinigameContext) => MinigameCleanup;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function str(content: Record<string, unknown>, key: string, fallback = ""): string {
  const value = content[key];
  return typeof value === "string" ? value : fallback;
}

function list<T = unknown>(content: Record<string, unknown>, key: string): T[] {
  const value = content[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

let cueContext: AudioContext | null = null;

function makeCue(muted: boolean): (kind: GameCue) => void {
  return (kind) => {
    if (muted) return;
    try {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      cueContext ??= new AudioCtor();
      if (cueContext.state === "suspended") void cueContext.resume();
      const now = cueContext.currentTime;
      const notes: Record<GameCue, number[]> = {
        success: [523.25, 659.25, 783.99],
        miss: [233.08, 196.0],
        boop: [440],
        scratch: [659.25],
      };
      notes[kind].forEach((frequency, index) => {
        const osc = cueContext!.createOscillator();
        const gain = cueContext!.createGain();
        osc.type = kind === "miss" ? "triangle" : "sine";
        osc.frequency.value = frequency;
        const start = now + index * 0.07;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.035, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain).connect(cueContext!.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    } catch {
      // Audio cues are decoration. Never block the game.
    }
  };
}

const PERMISSION_PROMPTS: Record<"camera" | "mic" | "motion", { title: string; body: string; icon: string }> = {
  camera: {
    title: "let me see the face I am trying to make smile",
    body: "This stays on your device. Nothing is uploaded. This is just for you and me.",
    icon: "camera",
  },
  mic: {
    title: "blow a little and see what happens",
    body: "The microphone is only for this little breath. Nothing is recorded or uploaded.",
    icon: "microphone",
  },
  motion: {
    title: "tilt your phone a little",
    body: "The motion sensor is only for this game. Nothing is uploaded.",
    icon: "mobile-screen",
  },
};

let activePermissionLayer: HTMLElement | null = null;

export async function requestPermission(
  kind: "camera" | "mic" | "motion",
  overrides: { title?: string; body?: string } = {}
): Promise<boolean> {
  activePermissionLayer?.remove();
  const prompt = PERMISSION_PROMPTS[kind];
  const layer = el("div", "permission-layer");
  layer.innerHTML = `
    <div class="permission-card" role="dialog" aria-modal="true" aria-labelledby="permission-title">
      <span class="permission-card__icon"><i class="fa-solid fa-${prompt.icon}" aria-hidden="true"></i></span>
      <span class="permission-card__kicker">${kind} permission</span>
      <h3 id="permission-title">${overrides.title ?? prompt.title}</h3>
      <p>${overrides.body ?? prompt.body}</p>
      <div class="permission-card__actions">
        <button type="button" class="soft-btn permission-card__yes">yes, show me</button>
        <button type="button" class="soft-btn permission-card__no">not now</button>
      </div>
    </div>`;
  document.body.append(layer);
  activePermissionLayer = layer;
  const yes = layer.querySelector<HTMLButtonElement>(".permission-card__yes");
  const no = layer.querySelector<HTMLButtonElement>(".permission-card__no");
  const app = document.getElementById("app");
  const wasInert = app?.hasAttribute("inert") ?? false;
  app?.setAttribute("inert", "");
  window.setTimeout(() => yes?.focus(), 60);
  return new Promise((resolve) => {
    const close = (value: boolean) => {
      if (app && !wasInert) app.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
      layer.remove();
      if (activePermissionLayer === layer) activePermissionLayer = null;
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };
    yes?.addEventListener("click", () => close(true), { once: true });
    no?.addEventListener("click", () => close(false), { once: true });
    document.addEventListener("keydown", onKey);
  });
}

async function acquirePermission(
  kind: "camera" | "mic" | "motion",
  content: Record<string, unknown>
): Promise<{ granted: boolean; stream: MediaStream | null }> {
  const allowed = await requestPermission(kind, {
    title: kind === "camera" ? str(content, "title", PERMISSION_PROMPTS.camera.title) : undefined,
    body: kind === "camera" ? str(content, "body", PERMISSION_PROMPTS.camera.body) : undefined,
  });
  if (!allowed) return { granted: false, stream: null };
  try {
    if (kind === "motion") {
      const orientation = window.DeviceOrientationEvent as unknown as
        | { requestPermission?: () => Promise<"granted" | "denied"> }
        | undefined;
      if (orientation?.requestPermission) {
        const state = await orientation.requestPermission();
        return { granted: state === "granted", stream: null };
      }
      return { granted: "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window, stream: null };
    }
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera" ? { video: { facingMode: "user" }, audio: false } : { audio: true, video: false }
    );
    return { granted: true, stream };
  } catch (error) {
    console.warn("[minigame] permission failed", kind, error);
    return { granted: false, stream: null };
  }
}

export async function verifyPermission(kind: "camera" | "mic" | "motion"): Promise<boolean> {
  const allowed = await requestPermission(kind);
  if (!allowed) return false;
  try {
    if (kind === "motion") {
      const orientation = window.DeviceOrientationEvent as unknown as
        | { requestPermission?: () => Promise<"granted" | "denied"> }
        | undefined;
      if (orientation?.requestPermission) {
        return (await orientation.requestPermission()) === "granted";
      }
      return "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window;
    }
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera" ? { video: { facingMode: "user" }, audio: false } : { audio: true, video: false }
    );
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

function gameUsable(game: MinigameConfig | undefined, host: MinigameHost): boolean {
  if (!game || game.status !== "ready") return false;
  if (!game.enabled_by_default && !host.enabled(game.id)) return false;
  if (!host.enabled(game.id)) return false;
  return supportsGame(game, host.caps);
}

function fallbackChain(game: MinigameConfig, host: MinigameHost): MinigameConfig[] {
  const map = new Map(host.games.map((entry) => [entry.id, entry]));
  const chain: MinigameConfig[] = [];
  const seen = new Set<string>();
  let current: MinigameConfig | undefined = game;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = map.get(current.fallback_game_id);
  }
  const defaults = ["choose_item", "hold_fill", "drag_to_target"];
  for (const id of defaults) {
    const entry = map.get(id);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      chain.push(entry);
    }
  }
  return chain;
}

const mounts: Record<string, GameMount> = {};

export function mountMinigame(container: HTMLElement, gameId: string, host: MinigameHost): MinigameCleanup {
  let cancelled = false;
  let cleanup: MinigameCleanup = () => undefined;
  const cue = makeCue(host.muted);
  const chosen = host.games.find((game) => game.id === gameId);

  const run = async () => {
    if (!chosen || !gameUsable(chosen, host)) {
      host.toast("this one is not available here. here is a cute alternative.");
    }
    const chain = chosen ? fallbackChain(chosen, host) : [];
    for (const game of chain) {
      if (cancelled) return;
      if (!gameUsable(game, host)) continue;
      if (host.reduced && game.permissions.includes("motion")) {
        host.toast("motion is resting. here is a cute alternative.");
        continue;
      }
      const permission = permissionFor(game, host.caps);
      let stream: MediaStream | null = null;
      if (permission) {
        const acquired = await acquirePermission(permission, (game.content ?? {}) as Record<string, unknown>);
        if (cancelled) {
          acquired.stream?.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!acquired.granted) {
          host.setPermission(permission, "denied");
          host.toast(
            permission === "camera"
              ? "the camera is shy today. here is a cute alternative."
              : permission === "mic"
                ? "the microphone is shy today. here is a cute alternative."
                : "the motion sensor is shy today. here is a cute alternative."
          );
          continue;
        }
        host.setPermission(permission, "granted");
        stream = acquired.stream;
      }
      const mount = mounts[game.id];
      if (!mount) continue;
      try {
        host.onGame?.(game.id);
        const ctx: MinigameContext = {
          ...host,
          game,
          content: (game.content ?? {}) as Record<string, unknown>,
          stream,
          cue,
          complete: () => {
            if (cancelled) return;
            stream?.getTracks().forEach((track) => track.stop());
            host.complete();
          },
        };
        cleanup = mount(container, ctx) ?? (() => undefined);
        return;
      } catch (error) {
        console.warn("[minigame] mount failed", game.id, error);
        stream?.getTracks().forEach((track) => track.stop());
        host.toast("that one got tangled. here is a cute alternative.");
      }
    }
    if (!cancelled) {
      host.toast("here is a tiny tap instead.");
      cleanup = mountTap(container, {
        ...host,
        game: chosen ?? {
          id: "tap_continue",
          name: "tap to continue",
          description: "",
          device_support: ["touch", "mouse"],
          permissions: ["none"],
          fallback_game_id: "tap_continue",
          enabled_by_default: true,
          status: "ready",
        },
        content: {},
        stream: null,
        cue,
      });
    }
  };

  void run();
  return () => {
    cancelled = true;
    activePermissionLayer?.remove();
    activePermissionLayer = null;
    cleanup();
  };
}

/* Shared game card ------------------------------------------------------ */

function gameShell(className: string, promptText: string): { root: HTMLElement; prompt: HTMLElement } {
  const root = el("div", `interaction ${className}`);
  const prompt = el("p", "interaction__prompt", promptText);
  root.append(prompt);
  return { root, prompt };
}

function mountTap(container: HTMLElement, ctx: MinigameContext): MinigameCleanup {
  const root = el("div", "interaction mg-tap");
  const prompt = el("p", "interaction__prompt", "tap when you are ready.");
  const button = el("button", "soft-btn mg-tap__button", "keep going");
  button.type = "button";
  root.append(prompt, button);
  container.append(root);
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    ctx.cue("success");
    gsap.to(root, { opacity: 0, y: -8, duration: 0.3, ease: "power2.in" });
    window.setTimeout(() => ctx.complete(), 420);
  };
  button.addEventListener("click", go, { once: true });
  gsap.fromTo(root, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => { done = true; gsap.killTweensOf(root); };
}

/* 1. Scratch card ------------------------------------------------------- */

const mountScratch: GameMount = (container, ctx) => {
  const promptText = str(ctx.content, "prompt", "scratch until the picture opens.");
  const { root } = gameShell("interaction--scratch mg-scratch", promptText);
  const card = el("div", "scratch-card mg-scratch__card");
  const under = el("div", "scratch-under");
  const imageSrc = str(ctx.content, "image");
  if (imageSrc) {
    const img = document.createElement("img");
    img.src = new URL(imageSrc, document.baseURI).href;
    img.alt = str(ctx.content, "caption", "the picture under the scratch card");
    img.draggable = false;
    under.append(img);
  }
  const caption = el("p", "scratch-under__caption", str(ctx.content, "caption", "scratch card"));
  under.append(caption);
  const canvas = document.createElement("canvas");
  canvas.className = "scratch-canvas";
  const label = el("span", "scratch-label", "scratch here");
  const progress = el("div", "mg-scratch__progress");
  progress.innerHTML = `<svg viewBox="0 0 42 42" aria-hidden="true"><circle class="mg-scratch__track" cx="21" cy="21" r="17"/><circle class="mg-scratch__arc" cx="21" cy="21" r="17"/></svg><span class="mg-scratch__percent">0%</span>`;
  card.append(under, canvas, label, progress);
  const hint = el("p", "interaction__hint is-concealed", str(ctx.content, "reveal", "there it is."));
  const skip = el("button", "soft-btn scratch-skip", "reveal it");
  skip.type = "button";
  root.append(card, hint, skip);
  container.append(root);

  const arc = progress.querySelector<SVGCircleElement>(".mg-scratch__arc");
  const percentEl = progress.querySelector<HTMLElement>(".mg-scratch__percent");
  const circumference = 2 * Math.PI * 17;
  if (arc) {
    arc.style.strokeDasharray = String(circumference);
    arc.style.strokeDashoffset = String(circumference);
  }

  let alive = true;
  let done = false;
  let scratching = false;
  let context: CanvasRenderingContext2D | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastX = 0;
  let lastY = 0;
  let idleTimer = 0;
  const cols = 40;
  const rows = 54;
  const mask = new Uint8Array(cols * rows);
  let marked = 0;
  const total = mask.length;

  const finish = () => {
    if (done || !alive) return;
    done = true;
    card.classList.remove("is-asking");
    card.classList.add("is-open");
    label.classList.add("is-gone");
    hint.classList.remove("is-concealed");
    hint.classList.add("is-visible");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "reveal", "there it is."));
    gsap.to(canvas, {
      opacity: 0,
      duration: ctx.reduced ? 0.12 : 0.3,
      ease: "power2.out",
      onComplete: () => { canvas.style.pointerEvents = "none"; },
    });
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 1200);
  };

  const paintCover = () => {
    if (!context) return;
    const accent = ctx.theme.colors.primary;
    const paper = ctx.theme.colors.paper;
    const ink = ctx.theme.colors.ink;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, paper);
    gradient.addColorStop(0.48, accent);
    gradient.addColorStop(1, paper);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.24;
    context.fillStyle = ink;
    for (let index = 0; index < 60; index += 1) {
      context.beginPath();
      context.arc(Math.random() * width, Math.random() * height, Math.random() * 2 + 0.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.lineWidth = 1;
    for (let index = 0; index < 9; index += 1) {
      context.beginPath();
      context.moveTo(0, (height / 9) * index);
      context.lineTo(width, (height / 9) * index - 14);
      context.stroke();
    }
  };

  const sizeCanvas = () => {
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context = canvas.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    paintCover();
  };

  const updateProgress = () => {
    const percent = Math.min(1, marked / total);
    if (arc) arc.style.strokeDashoffset = String(circumference * (1 - percent));
    if (percentEl) percentEl.textContent = `${Math.min(85, Math.round(percent * 100))}%`;
    if (percent >= 0.85) finish();
  };

  const markMask = (x: number, y: number) => {
    const radius = 26;
    const cx = x / width;
    const cy = y / height;
    const rx = radius / width;
    const ry = radius / height;
    for (let row = 0; row < rows; row += 1) {
      const yy = row / rows;
      if (Math.abs(yy - cy) > ry) continue;
      for (let col = 0; col < cols; col += 1) {
        const xx = col / cols;
        if (Math.abs(xx - cx) > rx) continue;
        const index = row * cols + col;
        if (!mask[index]) {
          mask[index] = 1;
          marked += 1;
        }
      }
    }
  };

  const brush = (x: number, y: number) => {
    if (!context) return;
    const radius = 26;
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    const distance = Math.hypot(x - lastX, y - lastY);
    const steps = Math.max(1, Math.round(distance / 8));
    for (let step = 1; step <= steps; step += 1) {
      const px = lastX + ((x - lastX) * step) / steps;
      const py = lastY + ((y - lastY) * step) / steps;
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fill();
      markMask(px, py);
    }
    markMask(x, y);
    lastX = x;
    lastY = y;
    updateProgress();
  };

  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const armIdleHint = () => {
    card.classList.remove("is-asking");
    window.clearTimeout(idleTimer);
    if (done) return;
    idleTimer = window.setTimeout(() => {
      if (done || marked / total >= 0.85) return;
      card.classList.add("is-asking");
      ctx.whisper("a little more.");
      window.setTimeout(() => card.classList.remove("is-asking"), 1700);
    }, 2000);
  };

  const onDown = (event: PointerEvent) => {
    if (!alive || done) return;
    event.preventDefault();
    scratching = true;
    const p = point(event);
    lastX = p.x;
    lastY = p.y;
    brush(p.x, p.y);
    try { canvas.setPointerCapture(event.pointerId); } catch { /* fine */ }
    armIdleHint();
  };
  const onMove = (event: PointerEvent) => {
    if (!scratching || done) return;
    const p = point(event);
    brush(p.x, p.y);
    armIdleHint();
  };
  const onUp = () => { scratching = false; };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  skip.addEventListener("click", finish);

  requestAnimationFrame(() => {
    sizeCanvas();
    armIdleHint();
  });

  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });

  return () => {
    alive = false;
    done = true;
    window.clearTimeout(idleTimer);
    gsap.killTweensOf([root, canvas]);
  };
};

/* 2. Camera selfie ------------------------------------------------------ */

const mountCamera: GameMount = (container, ctx) => {
  let alive = true;
  let cleanup: MinigameCleanup = () => undefined;
  void import("./camera").then(({ mountCameraGame }) => {
    if (!alive) return;
    cleanup = mountCameraGame(container, {
      content: ctx.content,
      stream: ctx.stream,
      reduced: ctx.reduced,
      complete: () => ctx.complete(),
      whisper: ctx.whisper,
      cue: ctx.cue,
    });
  }).catch((error) => {
    console.warn("[minigame] camera module failed", error);
    ctx.toast("the camera got shy. here is a cute alternative.");
    cleanup = mountChoose(container, ctx);
  });
  return () => {
    alive = false;
    cleanup();
  };
};

/* 3. Catch -------------------------------------------------------------- */

const mountCatch: GameMount = (container, ctx) => {
  const { root } = gameShell("interaction--catch mg-catch", "catch the little camera before it gets away");
  const stage = el("div", "catch-stage");
  const target = document.createElement("button");
  target.type = "button";
  target.className = "catch-target";
  target.setAttribute("aria-label", `catch ${str(ctx.content, "target", "the little thing")}`);
  target.innerHTML = `<i class="fa-solid fa-${str(ctx.content, "icon", "heart")}" aria-hidden="true"></i>`;
  stage.append(target);
  const hint = el("p", "interaction__hint is-concealed", str(ctx.content, "hint", "caught it."));
  hint.setAttribute("aria-live", "polite");
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let caught = false;
  let driftTween: gsap.core.Tween | null = null;
  let lastTilt: number | null = null;

  const drift = () => {
    if (!alive || caught) return;
    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(12, (rect.width - 84) / 2);
    const maxY = Math.max(10, (rect.height - 84) / 2);
    driftTween = gsap.to(target, {
      x: gsap.utils.random(-maxX, maxX),
      y: gsap.utils.random(-maxY, maxY),
      rotate: gsap.utils.random(-7, 7),
      duration: ctx.reduced ? 2.8 : gsap.utils.random(1.35, 2.25),
      ease: "sine.inOut",
      onComplete: drift,
    });
  };

  const catchIt = () => {
    if (caught || !alive) return;
    caught = true;
    driftTween?.kill();
    target.classList.add("is-caught");
    hint.classList.remove("is-concealed");
    hint.classList.add("is-visible");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "hint", "caught it."));
    gsap.to(target, { x: 0, y: 0, rotate: 0, scale: ctx.reduced ? 1 : 1.1, duration: ctx.reduced ? 0.1 : 0.4, ease: "back.out(2)" });
    const ring = el("span", "catch-ring");
    stage.append(ring);
    gsap.fromTo(ring, { scale: 0.25, opacity: 0.9 }, { scale: 1.7, opacity: 0, duration: ctx.reduced ? 0.2 : 0.7, ease: "power2.out" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 350 : 1000);
  };

  const onTilt = (event: DeviceOrientationEvent) => {
    if (caught || !alive || typeof event.gamma !== "number") return;
    if (lastTilt !== null && Math.abs(event.gamma - lastTilt) < 0.4) return;
    lastTilt = event.gamma;
    const x = gsap.utils.clamp(-70, 70, event.gamma * 1.4);
    gsap.to(target, { x, duration: 0.45, ease: "power2.out", overwrite: "auto" });
  };

  const onStageMove = (event: PointerEvent) => {
    if (caught || !alive || ctx.caps.touch) return;
    const tx = target.getBoundingClientRect();
    const dx = event.clientX - (tx.left + tx.width / 2);
    const dy = event.clientY - (tx.top + tx.height / 2);
    if (Math.hypot(dx, dy) < 92) {
      gsap.to(target, {
        x: gsap.utils.clamp(-80, 80, (Number(gsap.getProperty(target, "x")) || 0) - dx * 0.7),
        y: gsap.utils.clamp(-60, 60, (Number(gsap.getProperty(target, "y")) || 0) - dy * 0.5),
        duration: 0.35,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  };

  target.addEventListener("click", catchIt);
  target.addEventListener("pointerdown", (event) => { event.preventDefault(); catchIt(); });
  stage.addEventListener("pointerdown", (event) => {
    if (event.target === target || caught) return;
    ctx.whisper("too slow. it is over there now.");
    if (!ctx.reduced) drift();
  });
  stage.addEventListener("pointermove", onStageMove);
  if (ctx.caps.gyro) window.addEventListener("deviceorientation", onTilt);
  if (!ctx.reduced) drift();

  return () => {
    alive = false;
    driftTween?.kill();
    window.removeEventListener("deviceorientation", onTilt);
    gsap.killTweensOf([target, stage.querySelector(".catch-ring")].filter(Boolean) as Element[]);
  };
};

/* 4. Drag --------------------------------------------------------------- */

interface DragItemConfig { label: string; correct?: boolean; color?: string; }

const mountDrag: GameMount = (container, ctx) => {
  const { root } = gameShell("interaction--drag mg-drag", str(ctx.content, "prompt", "drag the right one into the basket."));
  const stage = el("div", "drag-stage");
  const basket = el("div", "drag-basket");
  basket.append(el("span", "drag-basket__rim"), el("span", "drag-basket__label", str(ctx.content, "target", "the basket")));
  const items = el("div", "drag-items");
  const hint = el("p", "interaction__hint", str(ctx.content, "hint", "the warm one."));
  hint.setAttribute("aria-live", "polite");
  stage.append(basket, items);
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let active: HTMLButtonElement | null = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  const itemData = list<DragItemConfig>(ctx.content, "items");
  const balls = itemData.map((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "drag-item";
    item.dataset.correct = String(Boolean(entry.correct));
    item.setAttribute("aria-label", `${entry.label}${entry.correct ? ", the right one" : ""}`);
    item.style.setProperty("--yarn", entry.color ?? "var(--c-primary)");
    item.innerHTML = `<span class="drag-item__ball" aria-hidden="true"></span><span class="drag-item__label">${entry.label}</span>`;
    item.addEventListener("pointerdown", (event) => onDown(event, item));
    items.append(item);
    return item;
  });

  const listeners = () => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
  };
  const clearListeners = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };

  function onDown(event: PointerEvent, item: HTMLButtonElement): void {
    if (done || active || !alive) return;
    event.preventDefault();
    active = item;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    item.classList.add("is-dragging");
    gsap.to(item, { scale: 1.08, duration: 0.18, ease: "power2.out" });
    try { item.setPointerCapture(event.pointerId); } catch { /* fine */ }
    listeners();
  }

  function onMove(event: PointerEvent): void {
    if (!active || done) return;
    const x = event.clientX - startX;
    const y = event.clientY - startY;
    if (Math.hypot(x, y) > 6) moved = true;
    gsap.set(active, { x, y, rotate: gsap.utils.clamp(-8, 8, x * 0.04) });
  }

  function onCancel(): void {
    if (active) reset(active);
    clearListeners();
  }

  function reset(item: HTMLButtonElement): void {
    gsap.to(item, { x: 0, y: 0, rotate: 0, scale: 1, duration: 0.5, ease: "back.out(2)" });
    item.classList.remove("is-dragging");
    active = null;
  }

  function onUp(): void {
    if (!active || done) { clearListeners(); return; }
    const item = active;
    const itemRect = item.getBoundingClientRect();
    const basketRect = basket.getBoundingClientRect();
    const distance = Math.hypot(
      itemRect.left + itemRect.width / 2 - (basketRect.left + basketRect.width / 2),
      itemRect.top + itemRect.height / 2 - (basketRect.top + basketRect.height / 2)
    );
    const correct = item.dataset.correct === "true";
    clearListeners();
    if (correct && (distance < 118 || !moved)) {
      done = true;
      active = null;
      item.classList.remove("is-dragging");
      item.classList.add("is-placed");
      basket.classList.add("is-fed");
      ctx.cue("success");
      const x = Number(gsap.getProperty(item, "x"));
      const y = Number(gsap.getProperty(item, "y"));
      const dx = basketRect.left + basketRect.width / 2 - (itemRect.left + itemRect.width / 2);
      const dy = basketRect.top + basketRect.height * 0.22 - (itemRect.top + itemRect.height / 2);
      ctx.whisper(str(ctx.content, "success", "that is the one."));
      hint.textContent = str(ctx.content, "success", "that is the one.");
      gsap.to(item, { x: x + dx, y: y + dy, scale: 0.52, opacity: 0.75, rotate: -8, duration: 0.5, ease: "power3.inOut" });
      const ring = el("span", "drag-ring");
      basket.append(ring);
      gsap.fromTo(ring, { scale: 0.4, opacity: 0.8 }, { scale: 1.7, opacity: 0, duration: 0.75, ease: "power2.out" });
      window.setTimeout(() => { if (alive) ctx.complete(); }, 1100);
      return;
    }
    ctx.cue("miss");
    reset(item);
    ctx.whisper(moved ? str(ctx.content, "hint", "not that one. try the warm one.") : "pick it up and bring it here.");
  }

  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    clearListeners();
    gsap.killTweensOf([...balls, basket]);
  };
};

/* 5. Tilt pour ---------------------------------------------------------- */

const mountTilt: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-tilt", str(ctx.content, "prompt", "tilt until the basket is full."));
  const beer = str(ctx.content, "mode") === "beer";
  if (beer) root.classList.add("is-beer");
  const stage = el("div", "mg-tilt__stage");
  if (beer) stage.classList.add("is-beer");
  const stream = el("div", "mg-tilt__stream");
  for (let index = 0; index < 14; index += 1) stream.append(el("i", "mg-tilt__spark"));
  const basket = el("div", "mg-tilt__basket");
  if (beer) basket.append(el("span", "mg-tilt__basket-label", "beer"));
  const meter = el("div", "mg-tilt__meter");
  const fill = el("span", "mg-tilt__fill");
  meter.append(fill);
  stage.append(stream, basket);
  const hint = el("p", "interaction__hint", beer ? "tilt to pour. the phone is right there." : "lean into it.");
  root.append(stage, meter, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let targetX = 84;
  let currentX = 84;
  let progress = 0;
  const tick = () => {
    if (!alive || done) return;
    currentX += (targetX - currentX) * 0.15;
    gsap.set(stream, { x: currentX });
    const centered = Math.abs(currentX) < 52;
    if (centered) {
      progress = Math.min(1, progress + 0.008);
      fill.style.transform = `scaleX(${progress})`;
      if (progress >= 1) finish();
    }
  };
  const finish = () => {
    if (done) return;
    done = true;
    basket.classList.add("is-fed");
    stage.classList.add("is-fed");
    ctx.cue("success");
    const success = str(ctx.content, "success", "that is enough. the basket is happy.");
    ctx.whisper(success);
    hint.textContent = success;
    window.setTimeout(() => { if (alive) ctx.complete(); }, 900);
  };
  const onTilt = (event: DeviceOrientationEvent) => {
    if (typeof event.gamma === "number") targetX = gsap.utils.clamp(-80, 80, event.gamma * 2.2);
  };
  const onPointer = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    targetX = gsap.utils.clamp(-90, 90, ((event.clientX - rect.left) / rect.width - 0.5) * 180);
  };
  if (ctx.caps.touch) window.addEventListener("deviceorientation", onTilt);
  stage.addEventListener("pointermove", onPointer);
  gsap.ticker.add(tick);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    gsap.ticker.remove(tick);
    window.removeEventListener("deviceorientation", onTilt);
  };
};

/* 6. Hold to fill ------------------------------------------------------- */

const mountHold: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-hold", str(ctx.content, "prompt", "hold until the heart is full."));
  const pad = document.createElement("button");
  pad.type = "button";
  pad.className = "mg-hold__pad";
  pad.innerHTML = `<span class="mg-hold__heart"><i class="fa-solid fa-heart" aria-hidden="true"></i></span><span class="mg-hold__label">${str(ctx.content, "label", "hold")}</span><span class="mg-hold__ring" aria-hidden="true"></span>`;
  const hint = el("p", "interaction__hint", "do not let go.");
  root.append(pad, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let tween: gsap.core.Tween | null = null;
  const progress = { value: 0 };
  const update = () => {
    const ring = pad.querySelector<HTMLElement>(".mg-hold__ring");
    if (ring) ring.style.setProperty("--fill", String(progress.value));
    pad.classList.toggle("is-full", progress.value > 0.98);
  };
  const finish = () => {
    if (done) return;
    done = true;
    tween?.kill();
    pad.classList.add("is-full");
    ctx.cue("success");
    ctx.whisper("there. full.");
    gsap.to(pad, { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.inOut" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 750);
  };
  const start = () => {
    if (done || tween) return;
    hint.textContent = "keep holding.";
    tween = gsap.to(progress, {
      value: 1,
      duration: ctx.reduced ? 1.2 : 2,
      ease: "none",
      onUpdate: update,
      onComplete: finish,
    });
  };
  const stop = () => {
    if (done || !tween) return;
    tween.kill();
    tween = null;
    hint.textContent = "almost. try again.";
    ctx.cue("miss");
    gsap.to(progress, {
      value: 0,
      duration: 0.35,
      ease: "back.out(2)",
      onUpdate: update,
    });
  };
  pad.addEventListener("pointerdown", (event) => { event.preventDefault(); start(); });
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointerleave", stop);
  pad.addEventListener("pointercancel", stop);
  pad.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); start(); }
  });
  pad.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stop();
  });
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    tween?.kill();
  };
};

/* 7. Sort into bins ----------------------------------------------------- */

interface SortItem { label: string; bin?: string; }

const mountSort: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-sort", str(ctx.content, "prompt", "tap a thing, then tap keep or let go."));
  const binLabels = list<string>(ctx.content, "bins");
  const itemsData = list<SortItem>(ctx.content, "items");
  const stage = el("div", "mg-sort__stage");
  const bins = binLabels.map((label) => {
    const bin = document.createElement("button");
    bin.type = "button";
    bin.className = "mg-bin";
    bin.dataset.bin = label;
    bin.innerHTML = `<span class="mg-bin__mouth"></span><span class="mg-bin__label">${label}</span><span class="mg-bin__contents"></span>`;
    stage.append(bin);
    return bin;
  });
  const tray = el("div", "mg-sort__items");
  stage.append(tray);
  const hint = el("p", "interaction__hint", "tap a thing, then tap a bin.");
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let selected: HTMLButtonElement | null = null;
  let dragged: HTMLButtonElement | null = null;
  let startX = 0;
  let startY = 0;
  let moved = false;

  const place = (item: HTMLButtonElement, bin: string) => {
    if (done || !alive) return;
    const expected = itemsData.find((entry) => entry.label === item.dataset.label)?.bin;
    if (expected && expected === bin) {
      const target = bins.find((node) => node.dataset.bin === bin);
      const targetRect = target?.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      item.classList.add("is-sorted");
      item.disabled = true;
      selected = null;
      ctx.cue("success");
      hint.textContent = "there. that belongs there.";
      if (target && targetRect) {
        const contents = target.querySelector<HTMLElement>(".mg-bin__contents");
        gsap.to(item, {
          x: targetRect.left + targetRect.width / 2 - (itemRect.left + itemRect.width / 2),
          y: targetRect.top + 18 - (itemRect.top + itemRect.height / 2),
          scale: 0.72,
          opacity: 0,
          duration: 0.35,
          ease: "power2.in",
          onComplete: () => {
            item.style.display = "none";
            if (contents) {
              const chip = el("span", "mg-bin__chip", item.textContent ?? "");
              contents.append(chip);
              gsap.fromTo(chip, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.8)" });
            }
          },
        });
        target.classList.add("is-fed");
        window.setTimeout(() => target.classList.remove("is-fed"), 700);
      }
      const remaining = tray.querySelectorAll(".mg-sort__item:not(.is-sorted)").length;
      if (remaining === 0) {
        done = true;
        gsap.to(stage, { scale: 1.02, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.inOut" });
        window.setTimeout(() => { if (alive) ctx.complete(); }, 850);
      }
    } else {
      ctx.cue("miss");
      hint.textContent = "not quite. try the other bin.";
      gsap.to(item, { x: 6, duration: 0.08, yoyo: true, repeat: 3, ease: "sine.inOut" });
      gsap.set(item, { x: 0 });
    }
  };

  const onBin = (bin: string) => {
    if (selected) place(selected, bin);
  };

  const items = itemsData.map((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "mg-sort__item";
    item.dataset.label = entry.label;
    item.textContent = entry.label;
    item.addEventListener("click", () => {
      if (done) return;
      if (selected === item) {
        selected = null;
        item.classList.remove("is-selected");
        hint.textContent = "tap a thing, then tap a bin.";
        return;
      }
      items.forEach((node) => node.classList.remove("is-selected"));
      selected = item;
      item.classList.add("is-selected");
      hint.textContent = "now tap keep or let go.";
      gsap.fromTo(item, { scale: 1 }, { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.inOut" });
    });
    item.addEventListener("pointerdown", (event) => {
      if (done) return;
      selected = item;
      dragged = item;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      item.classList.add("is-dragging");
      try { item.setPointerCapture(event.pointerId); } catch { /* fine */ }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });
    tray.append(item);
    return item;
  });

  function onMove(event: PointerEvent): void {
    if (!dragged) return;
    const x = event.clientX - startX;
    const y = event.clientY - startY;
    if (Math.hypot(x, y) > 5) moved = true;
    gsap.set(dragged, { x, y });
  }

  function onUp(event: PointerEvent): void {
    window.removeEventListener("pointermove", onMove);
    if (!dragged) return;
    const item = dragged;
    dragged = null;
    item.classList.remove("is-dragging");
    const hit = bins.find((bin) => {
      const rect = bin.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (moved && hit?.dataset.bin) {
      place(item, hit.dataset.bin);
    } else {
      gsap.to(item, { x: 0, y: 0, duration: 0.35, ease: "power3.out" });
    }
  }

  bins.forEach((bin) => bin.addEventListener("click", () => onBin(bin.dataset.bin ?? "")));
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    window.removeEventListener("pointermove", onMove);
    gsap.killTweensOf([...items, ...bins]);
  };
};

/* 8. Pet the cat -------------------------------------------------------- */

const mountPet: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-pet", str(ctx.content, "prompt", "pet the sleepy cat until it wakes up."));
  const stage = el("div", "mg-pet__stage");
  const character = el("div", "mg-pet__character");
  character.innerHTML = `<i class="fa-solid fa-cat" aria-hidden="true"></i><span class="mg-pet__zzz">z z z</span>`;
  const purr = el("span", "mg-pet__purr", "purr");
  stage.append(character, purr);
  const hint = el("p", "interaction__hint", "gentle. it is sleeping on the evidence.");
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let strokes = 0;
  let lastX = 0;
  let lastY = 0;
  let strokeTimer = 0;

  const progress = () => {
    strokes += 1;
    character.classList.add("is-petting");
    window.clearTimeout(strokeTimer);
    strokeTimer = window.setTimeout(() => character.classList.remove("is-petting"), 280);
    if (strokes > 6) purr.classList.add("is-visible");
    if (strokes > 16) finish();
  };
  const finish = () => {
    if (done) return;
    done = true;
    character.classList.add("is-awake");
    purr.classList.add("is-visible");
    hint.textContent = "there you are.";
    ctx.cue("success");
    ctx.whisper("the cat has approved the evidence.");
    gsap.to(character, { y: -8, scale: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.inOut" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 950);
  };
  const onMove = (event: PointerEvent) => {
    if (done) return;
    if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 8) return;
    lastX = event.clientX;
    lastY = event.clientY;
    progress();
  };
  const onShake = (event: DeviceMotionEvent) => {
    if (done) return;
    const accel = event.accelerationIncludingGravity;
    if (!accel) return;
    const magnitude = Math.hypot(accel.x ?? 0, accel.y ?? 0, accel.z ?? 0);
    if (magnitude > 18) progress();
  };
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerdown", (event) => { lastX = event.clientX; lastY = event.clientY; progress(); });
  if (ctx.caps.accel) window.addEventListener("devicemotion", onShake);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    window.clearTimeout(strokeTimer);
    window.removeEventListener("devicemotion", onShake);
  };
};

/* 9. Wipe the fog ------------------------------------------------------- */

const mountWipe: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-wipe", str(ctx.content, "prompt", "wipe the fog away."));
  const card = el("div", "mg-wipe__card");
  const under = el("div", "mg-wipe__under");
  const imageSrc = str(ctx.content, "image");
  if (imageSrc) {
    const sharp = document.createElement("img");
    sharp.className = "mg-wipe__photo";
    sharp.src = new URL(imageSrc, document.baseURI).href;
    sharp.alt = str(ctx.content, "caption", "the face behind the fog");
    sharp.draggable = false;
    const soft = sharp.cloneNode(true) as HTMLImageElement;
    soft.classList.add("mg-wipe__photo--soft");
    soft.alt = "";
    under.append(sharp, soft);
  }
  under.insertAdjacentHTML(
    "beforeend",
    `<span class="mg-wipe__sparkle"><i class="fa-solid fa-star" aria-hidden="true"></i></span><p>${str(ctx.content, "reveal", "the evidence is still here.")}</p><small>${str(ctx.content, "caption", "through the mist.")}</small>`
  );
  const canvas = document.createElement("canvas");
  canvas.className = "mg-wipe__canvas";
  const label = el("span", "mg-wipe__label", "wipe");
  card.append(under, canvas, label);
  const hint = el("p", "interaction__hint", "a little clearer.");
  root.append(card, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let context: CanvasRenderingContext2D | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastX = 0;
  let lastY = 0;
  let wiping = false;
  const cols = 30;
  const rows = 38;
  const mask = new Uint8Array(cols * rows);
  let marked = 0;
  const total = mask.length;

  const finish = () => {
    if (done) return;
    done = true;
    card.classList.add("is-open");
    label.classList.add("is-gone");
    hint.textContent = "there it is.";
    const soft = under.querySelector<HTMLElement>(".mg-wipe__photo--soft");
    if (soft) gsap.to(soft, { opacity: 0, duration: 0.45, ease: "power2.out" });
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "reveal", "there it is."));
    gsap.to(canvas, { opacity: 0, duration: 0.4, ease: "power2.out" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 1100);
  };

  const paint = () => {
    if (!context) return;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    context.fillStyle = ctx.theme.colors.paper;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.5;
    for (let index = 0; index < 28; index += 1) {
      const gradient = context.createRadialGradient(
        Math.random() * width, Math.random() * height, 2,
        Math.random() * width, Math.random() * height, Math.random() * 90 + 30
      );
      gradient.addColorStop(0, "rgba(255,255,255,0.65)");
      gradient.addColorStop(1, "rgba(220,220,220,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }
    context.globalAlpha = 1;
  };

  const size = () => {
    const rect = card.getBoundingClientRect();
    if (!rect.width) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context = canvas.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    paint();
  };

  const mark = (x: number, y: number) => {
    const rx = 24 / width;
    const ry = 24 / height;
    const cx = x / width;
    const cy = y / height;
    for (let row = 0; row < rows; row += 1) {
      if (Math.abs(row / rows - cy) > ry) continue;
      for (let col = 0; col < cols; col += 1) {
        if (Math.abs(col / cols - cx) > rx) continue;
        const index = row * cols + col;
        if (!mask[index]) { mask[index] = 1; marked += 1; }
      }
    }
    if (marked / total > 0.58) finish();
  };

  const brush = (x: number, y: number) => {
    if (!context) return;
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, 24, 0, Math.PI * 2);
    context.fill();
    const steps = Math.max(1, Math.round(Math.hypot(x - lastX, y - lastY) / 8));
    for (let step = 1; step <= steps; step += 1) {
      const px = lastX + ((x - lastX) * step) / steps;
      const py = lastY + ((y - lastY) * step) / steps;
      context.beginPath();
      context.arc(px, py, 24, 0, Math.PI * 2);
      context.fill();
      mark(px, py);
    }
    mark(x, y);
    lastX = x;
    lastY = y;
  };

  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event: PointerEvent) => {
    if (done) return;
    event.preventDefault();
    wiping = true;
    const p = point(event);
    lastX = p.x;
    lastY = p.y;
    brush(p.x, p.y);
    try { canvas.setPointerCapture(event.pointerId); } catch { /* fine */ }
  };
  const move = (event: PointerEvent) => {
    if (!wiping || done) return;
    const p = point(event);
    brush(p.x, p.y);
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", () => { wiping = false; });
  canvas.addEventListener("pointercancel", () => { wiping = false; });
  requestAnimationFrame(size);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    gsap.killTweensOf([root, canvas]);
  };
};

/* 10. Memory match ------------------------------------------------------ */

const mountMemory: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-memory", str(ctx.content, "prompt", "find the pairs."));
  const icons = list<string>(ctx.content, "icons");
  const pairs = (icons.length ? icons : ["cat", "dog", "yarn", "heart"]).slice(0, 4);
  const deck = [...pairs, ...pairs]
    .map((icon, index) => ({ icon, key: `${icon}-${index}` }))
    .sort(() => Math.random() - 0.5);
  const grid = el("div", "mg-memory__grid");
  let alive = true;
  let done = false;
  let first: HTMLButtonElement | null = null;
  let locked = false;
  let matched = 0;
  const cards = deck.map((entry) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mg-card";
    card.dataset.icon = entry.icon;
    card.setAttribute("aria-label", "a face down card");
    card.innerHTML = `<span class="mg-card__inner"><span class="mg-card__back"><i class="fa-solid fa-paw" aria-hidden="true"></i></span><span class="mg-card__front"><i class="fa-solid fa-${entry.icon}" aria-hidden="true"></i></span></span>`;
    card.addEventListener("click", () => flip(card));
    grid.append(card);
    return card;
  });
  const hint = el("p", "interaction__hint", "take your time. the cat is watching.");
  root.append(grid, hint);
  container.append(root);

  const flip = (card: HTMLButtonElement) => {
    if (!alive || done || locked || card.classList.contains("is-flipped") || card.classList.contains("is-matched")) return;
    card.classList.add("is-flipped");
    ctx.cue("boop");
    if (!first) {
      first = card;
      return;
    }
    const a = first;
    first = null;
    if (a.dataset.icon === card.dataset.icon) {
      matched += 1;
      a.classList.add("is-matched");
      card.classList.add("is-matched");
      ctx.cue("success");
      gsap.fromTo([a, card], { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.inOut" });
      if (matched === pairs.length) {
        done = true;
        hint.textContent = str(ctx.content, "success", "all of them. of course they match.");
        window.setTimeout(() => { if (alive) ctx.complete(); }, 850);
      }
    } else {
      locked = true;
      ctx.cue("miss");
      hint.textContent = "not those two. try again.";
      window.setTimeout(() => {
        a.classList.remove("is-flipped");
        card.classList.remove("is-flipped");
        locked = false;
      }, 650);
    }
  };

  gsap.fromTo(cards, { opacity: 0, y: 14, rotate: -2 }, { opacity: 1, y: 0, rotate: 0, duration: 0.45, stagger: 0.045, ease: "back.out(1.4)" });
  return () => {
    alive = false;
    done = true;
    gsap.killTweensOf(cards);
  };
};

/* 11. Choose an item ---------------------------------------------------- */

const mountChoose: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-choose", str(ctx.content, "prompt", "pick one."));
  const labels = list<string>(ctx.content, "items");
  const correct = str(ctx.content, "correct", labels[1] ?? labels[0] ?? "");
  const table = el("div", "mg-choose__table");
  const hint = el("p", "interaction__hint", "no wrong answers. only opinions.");
  let alive = true;
  let done = false;

  const items = labels.map((label, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "mg-choose__item";
    item.style.setProperty("--item-index", String(index));
    item.textContent = label;
    item.addEventListener("click", () => {
      if (done) return;
      items.forEach((node) => node.classList.remove("is-picked"));
      item.classList.add("is-picked");
      if (label === correct) {
        done = true;
        table.classList.add("is-decided");
        item.classList.add("is-right");
        hint.textContent = "good taste. I had a feeling.";
        ctx.cue("success");
        ctx.whisper("good taste. I had a feeling.");
        gsap.to(item, { scale: 1.08, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.inOut" });
        window.setTimeout(() => { if (alive) ctx.complete(); }, 850);
      } else {
        ctx.cue("miss");
        hint.textContent = "close. try the warm one.";
        gsap.to(item, { x: 5, duration: 0.08, yoyo: true, repeat: 3, ease: "sine.inOut" });
        gsap.set(item, { x: 0 });
      }
    });
    table.append(item);
    return item;
  });
  root.append(table, hint);
  container.append(root);
  gsap.fromTo(items, { opacity: 0, y: 12, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.06, ease: "back.out(1.6)" });
  return () => {
    alive = false;
    done = true;
    gsap.killTweensOf(items);
  };
};

/* 12. Pull the thread --------------------------------------------------- */

const mountPull: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-pull", str(ctx.content, "prompt", "pull the thread."));
  const stage = el("div", "mg-pull__stage");
  const thread = el("span", "mg-pull__thread");
  const ball = el("div", "mg-pull__ball");
  ball.innerHTML = '<i class="fa-solid fa-circle" aria-hidden="true"></i>';
  const note = el("p", "mg-pull__note", str(ctx.content, "reveal", "there it is."));
  const pad = document.createElement("button");
  pad.type = "button";
  pad.className = "mg-pull__handle";
  pad.setAttribute("aria-label", "pull the thread");
  stage.append(thread, ball, note, pad);
  const hint = el("p", "interaction__hint", "a little more.");
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let dragging = false;
  let startY = 0;
  let distance = 0;

  const finish = () => {
    if (done) return;
    done = true;
    stage.classList.add("is-undone");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "reveal", "there it is."));
    gsap.to(ball, { scale: 0.2, rotate: 180, opacity: 0.4, duration: 0.5, ease: "power3.in" });
    gsap.to(note, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 2500);
  };
  const update = (value: number) => {
    distance = Math.max(0, value);
    const pull = Math.min(1, distance / 130);
    thread.style.transform = `scaleY(${0.25 + pull * 0.9})`;
    ball.style.transform = `translate(-50%, ${pull * 70}px)`;
    hint.textContent = pull > 0.7 ? "almost." : "a little more.";
    if (pull >= 1) finish();
  };
  const down = (event: PointerEvent) => {
    if (done) return;
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    try { pad.setPointerCapture(event.pointerId); } catch { /* fine */ }
  };
  const move = (event: PointerEvent) => {
    if (!dragging || done) return;
    update(distance + (event.clientY - startY));
    startY = event.clientY;
  };
  const up = () => { dragging = false; };
  pad.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  pad.addEventListener("click", () => { if (!done) update(distance + 30); });
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    gsap.killTweensOf([ball, note, root]);
  };
};

/* 13. Blow the cloud away ----------------------------------------------- */

const mountBlow: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-blow", str(ctx.content, "prompt", "blow at the cloud. a little puff is enough."));
  if (!ctx.stream) throw new Error("No microphone stream");
  const stage = el("div", "mg-blow__stage");
  const cloud = el("div", "mg-blow__cloud");
  for (let index = 0; index < 10; index += 1) cloud.append(el("span", "mg-blow__puff"));
  stage.append(cloud);
  const meter = el("div", "mg-blow__meter");
  const fill = el("span", "mg-blow__fill");
  meter.append(fill);
  const hint = el("p", "interaction__hint", "a little puff.");
  const skip = el("button", "soft-btn mg-blow__skip", "use a tap instead");
  skip.type = "button";
  root.append(stage, meter, hint, skip);
  container.append(root);

  let alive = true;
  let done = false;
  let progress = 0;
  let audio: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array | null = null;

  const finish = () => {
    if (done) return;
    done = true;
    gsap.ticker.remove(tick);
    ctx.cue("success");
    hint.textContent = str(ctx.content, "reveal", "there it is.");
    ctx.whisper(str(ctx.content, "reveal", "there it is."));
    stage.classList.add("is-blown");
    cloud.querySelectorAll<HTMLElement>(".mg-blow__puff").forEach((puff, index) => {
      gsap.to(puff, {
        x: (index - 4.5) * 22,
        y: -30 - Math.random() * 70,
        scale: 0.4,
        opacity: 0,
        duration: ctx.reduced ? 0.2 : 0.8,
        delay: index * 0.025,
        ease: "power2.out",
      });
    });
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 1050);
  };

  const tick = () => {
    if (!alive || done || !analyser || !data) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    if (rms > 0.015) {
      progress = Math.min(1, progress + Math.min(0.09, (rms - 0.01) * 1.35));
      fill.style.transform = `scaleX(${progress})`;
      gsap.set(cloud, { scale: 1 + progress * 0.12, opacity: 1 - progress * 0.55 });
      hint.textContent = progress > 0.6 ? "almost. keep going." : "a little more.";
      if (progress >= 1) finish();
    }
  };

  try {
    audio = new AudioContext();
    source = audio.createMediaStreamSource(ctx.stream);
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    void audio.resume().catch(() => undefined);
    gsap.ticker.add(tick);
  } catch (error) {
    console.warn("[minigame] microphone analyser failed", error);
    hint.textContent = "the microphone is shy. use the tap instead.";
  }

  skip.addEventListener("click", finish);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    gsap.ticker.remove(tick);
    try { source?.disconnect(); } catch { /* ignore */ }
    void audio?.close().catch(() => undefined);
    gsap.killTweensOf(Array.from(cloud.querySelectorAll("*")));
  };
};

/* 14. Tap on the beat --------------------------------------------------- */

const mountRhythm: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-rhythm", str(ctx.content, "prompt", "tap when the ring blooms."));
  const hitsNeeded = Number(ctx.content.hits ?? 6) || 6;
  const interval = 760;
  const stage = el("div", "mg-rhythm__stage");
  const ring = el("span", "mg-rhythm__ring");
  const cat = el("span", "mg-rhythm__cat");
  cat.innerHTML = '<i class="fa-solid fa-cat" aria-hidden="true"></i>';
  stage.append(ring, cat);
  const pips = el("div", "mg-rhythm__pips");
  for (let index = 0; index < hitsNeeded; index += 1) pips.append(el("span", "mg-rhythm__pip"));
  const tap = document.createElement("button");
  tap.type = "button";
  tap.className = "mg-rhythm__tap";
  tap.textContent = "tap";
  const hint = el("p", "interaction__hint", "listen for the ring.");
  root.append(stage, pips, tap, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let score = 0;
  let beatIndex = -1;
  let lastTap = 0;
  const start = performance.now();
  let judgeTimer = 0;

  const pulse = () => {
    if (ctx.reduced) return;
    gsap.fromTo(ring, { scale: 1.3, opacity: 0.35 }, { scale: 1, opacity: 1, duration: 0.32, ease: "power2.out" });
  };

  const tick = () => {
    if (!alive || done) return;
    const index = Math.floor((performance.now() - start) / interval);
    if (index > beatIndex) {
      beatIndex = index;
      pulse();
      if (index > 0) ctx.cue("boop");
    }
  };

  const finish = () => {
    if (done) return;
    done = true;
    gsap.ticker.remove(tick);
    tap.disabled = true;
    stage.classList.add("is-done");
    hint.textContent = "there. right on the beat.";
    ctx.cue("success");
    ctx.whisper("right on the beat. show off.");
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 850);
  };

  const judge = () => {
    if (!alive || done) return;
    const now = performance.now();
    if (now - lastTap < 120) return;
    lastTap = now;
    const phase = ((now - start) % interval) / interval;
    const distance = Math.min(phase, 1 - phase);
    const offBeat = distance > 0.23;
    cat.classList.remove("is-happy", "is-judging");
    void cat.offsetWidth;
    if (offBeat) {
      ctx.cue("miss");
      cat.classList.add("is-judging");
      hint.textContent = str(ctx.content, "miss", "almost. listen for the next one.");
      window.clearTimeout(judgeTimer);
      judgeTimer = window.setTimeout(() => cat.classList.remove("is-judging"), 500);
      return;
    }
    score += 1;
    pips.children[score - 1]?.classList.add("is-hit");
    ctx.cue("success");
    cat.classList.add("is-happy");
    hint.textContent = str(ctx.content, "hit", "there.");
    window.clearTimeout(judgeTimer);
    judgeTimer = window.setTimeout(() => cat.classList.remove("is-happy"), 480);
    if (score >= hitsNeeded) finish();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      judge();
    }
  };
  tap.addEventListener("click", judge);
  document.addEventListener("keydown", onKey);
  gsap.ticker.add(tick);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    gsap.ticker.remove(tick);
    document.removeEventListener("keydown", onKey);
    window.clearTimeout(judgeTimer);
    gsap.killTweensOf([ring, cat]);
  };
};

/* 15. Trace the line ---------------------------------------------------- */

const mountTrace: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-trace", str(ctx.content, "prompt", "follow the dotted line without lifting your finger."));
  const holder = el("div", "mg-trace__holder");
  const pathD = "M 28 142 C 44 42, 98 32, 124 98 S 180 168, 212 92 S 252 30, 276 86";
  holder.innerHTML = `<svg viewBox="0 0 300 190" class="mg-trace__svg" role="img" aria-label="trace the dotted path"><path class="mg-trace__track" d="${pathD}"/><path class="mg-trace__fill" d="${pathD}"/><circle class="mg-trace__thumb" r="8" cx="28" cy="142"/></svg>`;
  const hint = el("p", "interaction__hint", "start at the little dot.");
  const skip = el("button", "soft-btn mg-trace__skip", "trace it for me");
  skip.type = "button";
  root.append(holder, hint, skip);
  container.append(root);

  const svg = holder.querySelector<SVGSVGElement>(".mg-trace__svg");
  const track = holder.querySelector<SVGPathElement>(".mg-trace__track");
  const fill = holder.querySelector<SVGPathElement>(".mg-trace__fill");
  const thumb = holder.querySelector<SVGCircleElement>(".mg-trace__thumb");
  if (!svg || !track || !fill || !thumb) throw new Error("Trace paths missing");

  let alive = true;
  let done = false;
  let tracing = false;
  let progressIndex = 0;
  const samples = 180;
  const total = track.getTotalLength();
  const points: DOMPoint[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const point = track.getPointAtLength((total * index) / samples);
    points.push(new DOMPoint(point.x, point.y));
  }
  fill.style.strokeDasharray = String(total);
  fill.style.strokeDashoffset = String(total);

  const finish = () => {
    if (done) return;
    done = true;
    holder.classList.add("is-done");
    hint.textContent = str(ctx.content, "reveal", "traced. remembered.");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "reveal", "traced. remembered."));
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 900);
  };

  const localPoint = (event: PointerEvent) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : new DOMPoint(0, 0);
  };

  const nearest = (x: number, y: number) => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const dx = points[index].x - x;
      const dy = points[index].y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return { index: best, distance: Math.sqrt(bestDistance) };
  };

  const update = (index: number) => {
    progressIndex = Math.max(progressIndex, Math.min(samples, index));
    const ratio = progressIndex / samples;
    fill.style.strokeDashoffset = String(total * (1 - ratio));
    const point = points[progressIndex];
    thumb.setAttribute("cx", String(point.x));
    thumb.setAttribute("cy", String(point.y));
    hint.textContent = ratio > 0.7 ? "almost." : "keep following it.";
    if (ratio >= 0.84) finish();
  };

  const onDown = (event: PointerEvent) => {
    if (!alive || done) return;
    event.preventDefault();
    const point = localPoint(event);
    const found = nearest(point.x, point.y);
    if (found.distance > 34) {
      hint.textContent = "start at the little dot.";
      return;
    }
    if (found.index > 10 && progressIndex === 0) {
      hint.textContent = "start at the little dot.";
      return;
    }
    tracing = true;
    update(found.index);
    try { svg.setPointerCapture(event.pointerId); } catch { /* fine */ }
  };
  const onMove = (event: PointerEvent) => {
    if (!tracing || !alive || done) return;
    const point = localPoint(event);
    const found = nearest(point.x, point.y);
    if (found.distance < 36 && found.index >= progressIndex && found.index <= progressIndex + 26) {
      update(found.index);
    }
  };
  const onUp = () => { tracing = false; };

  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
  skip.addEventListener("click", finish);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    gsap.killTweensOf([root, fill, thumb]);
  };
};

/* 16. Shake to reveal --------------------------------------------------- */

const mountShake: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-shake", str(ctx.content, "prompt", "shake the little box. gently."));
  const stage = el("div", "mg-shake__stage");
  const box = el("div", "mg-shake__box");
  const lid = el("span", "mg-shake__lid");
  const note = el("p", "mg-shake__note", str(ctx.content, "reveal", "the note was in there."));
  const body = el("span", "mg-shake__body");
  box.append(body, lid, note);
  stage.append(box);
  const meter = el("div", "mg-shake__meter");
  const fill = el("span", "mg-shake__fill");
  meter.append(fill);
  const hint = el("p", "interaction__hint", "a gentle shake.");
  const tap = el("button", "soft-btn mg-shake__tap", "shake with a tap");
  tap.type = "button";
  root.append(stage, meter, hint, tap);
  container.append(root);

  let alive = true;
  let done = false;
  let progress = 0;
  let lastMagnitude = 0;
  let lastShake = 0;

  const finish = () => {
    if (done) return;
    done = true;
    box.classList.add("is-open");
    hint.textContent = str(ctx.content, "reveal", "the note was in there.");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "reveal", "the note was in there."));
    gsap.to(lid, { y: -36, rotate: -12, duration: 0.45, ease: "back.out(1.6)" });
    gsap.to(note, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
    gsap.to(box, { y: -5, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.inOut" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 950);
  };

  const add = (amount: number) => {
    if (done) return;
    progress = Math.min(1, progress + amount);
    fill.style.transform = `scaleX(${progress})`;
    gsap.fromTo(box, { rotate: -2 }, { rotate: 2, duration: 0.1, yoyo: true, repeat: 1, ease: "sine.inOut" });
    hint.textContent = progress > 0.65 ? "it is loosening." : "a little more.";
    if (progress >= 1) finish();
  };

  const onMotion = (event: DeviceMotionEvent) => {
    if (done) return;
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;
    const magnitude = Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0);
    const delta = Math.abs(magnitude - lastMagnitude);
    lastMagnitude = magnitude;
    const now = performance.now();
    if (delta > 12 && now - lastShake > 90) {
      lastShake = now;
      add(Math.min(0.16, delta / 90));
    }
  };

  if (ctx.caps.accel) window.addEventListener("devicemotion", onMotion);
  tap.addEventListener("click", () => add(0.2));
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    window.removeEventListener("devicemotion", onMotion);
    gsap.killTweensOf([box, lid, note]);
  };
};

/* 17. Feed the cat ------------------------------------------------------ */

interface FeedFood { label: string; icon?: string; }

const mountFeed: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-feed", str(ctx.content, "prompt", "feed the cat. it is supervising."));
  const foodsData = list<FeedFood>(ctx.content, "foods");
  const stage = el("div", "mg-feed__stage");
  const cat = el("div", "mg-feed__cat");
  cat.innerHTML = '<i class="fa-solid fa-cat" aria-hidden="true"></i><span class="mg-feed__mouth">·</span>';
  const bowl = el("div", "mg-feed__bowl");
  const foodTray = el("div", "mg-feed__foods");
  const hearts = el("div", "mg-feed__hearts");
  const foods = foodsData.map((food) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mg-feed__food";
    button.dataset.label = food.label;
    button.innerHTML = `<i class="fa-solid fa-${food.icon ?? "fish"}" aria-hidden="true"></i><span>${food.label}</span>`;
    button.addEventListener("pointerdown", (event) => onDown(event, button));
    button.addEventListener("click", () => feed(button));
    foodTray.append(button);
    return button;
  });
  foods.forEach(() => hearts.append(el("span", "mg-feed__heart")));
  stage.append(cat, bowl, foodTray, hearts);
  const hint = el("p", "interaction__hint", "one at a time.");
  root.append(stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let score = 0;
  let dragged: HTMLButtonElement | null = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let lastFeed = 0;

  const finish = () => {
    if (done) return;
    done = true;
    cat.classList.add("is-full");
    hint.textContent = str(ctx.content, "full", "full. happy. still judging you.");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "full", "full. happy. still judging you."));
    gsap.to(cat, { scale: 1.12, rotate: -3, duration: 0.4, ease: "back.out(1.6)" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 400 : 950);
  };

  const feed = (button: HTMLButtonElement) => {
    if (!alive || done || button.dataset.used === "1") return;
    const now = performance.now();
    if (now - lastFeed < 220) return;
    lastFeed = now;
    button.dataset.used = "1";
    button.classList.add("is-used");
    score += 1;
    cat.classList.remove("is-fed-1", "is-fed-2", "is-fed-3");
    void cat.offsetWidth;
    cat.classList.add(`is-fed-${Math.min(3, score)}`);
    hearts.children[score - 1]?.classList.add("is-full");
    ctx.cue("boop");
    hint.textContent = score >= foods.length ? str(ctx.content, "full", "full.") : "nom.";
    gsap.fromTo(cat, { scale: 1 }, { scale: 1.08, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.inOut" });
    if (score >= foods.length) finish();
  };

  function onDown(event: PointerEvent, button: HTMLButtonElement): void {
    if (!alive || done || button.dataset.used === "1") return;
    dragged = button;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    try { button.setPointerCapture(event.pointerId); } catch { /* fine */ }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function onMove(event: PointerEvent): void {
    if (!dragged) return;
    const x = event.clientX - startX;
    const y = event.clientY - startY;
    if (Math.hypot(x, y) > 6) moved = true;
    gsap.set(dragged, { x, y });
  }

  function onUp(event: PointerEvent): void {
    window.removeEventListener("pointermove", onMove);
    if (!dragged) return;
    const button = dragged;
    dragged = null;
    const catRect = cat.getBoundingClientRect();
    const near = event.clientX > catRect.left - 60 && event.clientX < catRect.right + 60 && event.clientY > catRect.top - 60 && event.clientY < catRect.bottom + 60;
    if (near) {
      gsap.to(button, { x: 0, y: 0, scale: 0.2, opacity: 0.35, duration: 0.35, ease: "power2.in" });
      feed(button);
    } else {
      gsap.to(button, { x: 0, y: 0, duration: 0.4, ease: "back.out(2)" });
      if (!moved) feed(button);
    }
  }

  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    window.removeEventListener("pointermove", onMove);
    gsap.killTweensOf([cat, ...foods]);
  };
};

/* 18. Spin the little wheel --------------------------------------------- */

const mountWheel: GameMount = (container, ctx) => {
  const { root } = gameShell("mg-wheel", str(ctx.content, "prompt", "spin it. whatever it lands on is true."));
  const segments = list<string>(ctx.content, "segments");
  const labels = segments.length ? segments : ["both", "both", "obviously"];
  const count = labels.length;
  const step = 360 / count;
  const stage = el("div", "mg-wheel__stage");
  const disc = el("div", "mg-wheel__disc");
  const colors = [ctx.theme.colors.primary, ctx.theme.colors.secondary, ctx.theme.colors.accent];
  disc.style.background = `conic-gradient(${labels.map((_, index) => `${colors[index % colors.length]} ${index * step}deg ${(index + 1) * step}deg`).join(", ")})`;
  labels.forEach((label, index) => {
    const node = el("span", "mg-wheel__label", label);
    node.style.transform = `rotate(${index * step + step / 2}deg) translateY(-31%)`;
    disc.append(node);
  });
  const pointer = el("span", "mg-wheel__pointer");
  const hub = el("span", "mg-wheel__hub");
  stage.append(disc, pointer, hub);
  const result = el("p", "mg-wheel__result", "");
  const tap = el("button", "soft-btn mg-wheel__tap", "spin");
  tap.type = "button";
  const hint = el("p", "interaction__hint", "swipe the wheel or tap spin.");
  root.append(stage, result, tap, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let spinning = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  const finish = (index: number) => {
    if (done) return;
    done = true;
    const label = labels[index] ?? str(ctx.content, "result", "both.");
    result.textContent = label;
    result.classList.add("is-visible");
    hint.textContent = str(ctx.content, "result", label);
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "result", label));
    window.setTimeout(() => { if (alive) ctx.complete(); }, ctx.reduced ? 450 : 1200);
  };

  const spin = () => {
    if (done || spinning || !alive) return;
    spinning = true;
    tap.disabled = true;
    const index = Math.floor(Math.random() * count);
    const current = Number(gsap.getProperty(disc, "rotation")) || 0;
    const currentMod = ((current % 360) + 360) % 360;
    const targetAngle = (360 - (index + 0.5) * step) % 360;
    let delta = targetAngle - currentMod;
    if (delta < 0) delta += 360;
    const finalRotation = current + (ctx.reduced ? 360 : 1080) + delta;
    ctx.cue("boop");
    hint.textContent = "round and round.";
    gsap.to(disc, {
      rotation: finalRotation,
      duration: ctx.reduced ? 0.7 : 2.5,
      ease: "power4.out",
      onComplete: () => finish(index),
    });
  };

  const onDown = (event: PointerEvent) => {
    if (done) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    try { stage.setPointerCapture(event.pointerId); } catch { /* fine */ }
  };
  const onUp = (event: PointerEvent) => {
    if (!dragging || done) return;
    dragging = false;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 18) spin();
  };

  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointerup", onUp);
  tap.addEventListener("click", spin);
  gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  return () => {
    alive = false;
    done = true;
    spinning = true;
    gsap.killTweensOf(disc);
  };
};

/* Registration --------------------------------------------------------- */

mounts.scratch_card = mountScratch;
mounts.camera_selfie = mountCamera;
mounts.catch_object = mountCatch;
mounts.drag_to_target = mountDrag;
mounts.tilt_pour = mountTilt;
mounts.hold_fill = mountHold;
mounts.sort_bins = mountSort;
mounts.pet_character = mountPet;
mounts.wipe_fog = mountWipe;
mounts.memory_match = mountMemory;
mounts.choose_item = mountChoose;
mounts.pull_thread = mountPull;
mounts.blow_reveal = mountBlow;
mounts.rhythm_tap = mountRhythm;
mounts.trace_line = mountTrace;
mounts.shake_reveal = mountShake;
mounts.feed_cat = mountFeed;
mounts.spin_wheel = mountWheel;
