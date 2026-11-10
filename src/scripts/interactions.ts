import { gsap } from "gsap";
import type {
  CatchInteraction,
  DragInteraction,
  Question,
  ScratchInteraction,
  Theme,
} from "../lib/types";

export interface InteractionContext {
  canInteract: () => boolean;
  complete: (next?: string) => void;
  whisper: (text: string) => void;
  reduced: boolean;
  theme: Theme;
}

export type InteractionCleanup = () => void;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function nextOf(interaction: { next?: string }): string | undefined {
  return interaction.next;
}

/* Catch ---------------------------------------------------------------- */

function mountCatch(
  _question: Question,
  container: HTMLElement,
  ctx: InteractionContext,
  config: CatchInteraction
): InteractionCleanup {
  const root = element("div", "interaction interaction--catch");
  const prompt = element("p", "interaction__prompt", "catch the little camera before it gets away");
  const stage = element("div", "catch-stage");
  const target = document.createElement("button");
  target.type = "button";
  target.className = "catch-target";
  target.setAttribute("aria-label", `catch ${config.target}`);
  target.innerHTML = '<i class="fa-solid fa-camera-retro" aria-hidden="true"></i>';
  stage.append(target);
  const hint = element("p", "interaction__hint is-concealed", config.hint);
  hint.setAttribute("aria-live", "polite");
  root.append(prompt, stage, hint);
  container.append(root);

  let alive = true;
  let caught = false;
  let driftTween: gsap.core.Tween | null = null;

  const drift = () => {
    if (!alive || caught) return;
    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(12, (rect.width - 84) / 2);
    const maxY = Math.max(10, (rect.height - 84) / 2);
    driftTween = gsap.to(target, {
      x: gsap.utils.random(-maxX, maxX),
      y: gsap.utils.random(-maxY, maxY),
      rotate: gsap.utils.random(-8, 8),
      duration: ctx.reduced ? 2.6 : gsap.utils.random(1.4, 2.4),
      ease: "sine.inOut",
      onComplete: drift,
    });
  };

  const catchIt = () => {
    if (caught || !alive || !ctx.canInteract()) return;
    caught = true;
    driftTween?.kill();
    hint.classList.remove("is-concealed");
    hint.classList.add("is-visible");
    target.classList.add("is-caught");
    stage.classList.add("is-caught");
    ctx.whisper(config.hint);
    gsap.to(target, {
      x: 0,
      y: 0,
      rotate: 0,
      scale: ctx.reduced ? 1 : 1.12,
      duration: ctx.reduced ? 0.1 : 0.45,
      ease: "back.out(2)",
    });
    const ring = element("span", "catch-ring");
    stage.append(ring);
    gsap.fromTo(
      ring,
      { scale: 0.3, opacity: 0.9 },
      { scale: 1.6, opacity: 0, duration: ctx.reduced ? 0.2 : 0.7, ease: "power2.out" }
    );
    window.setTimeout(() => {
      if (!alive) return;
      ctx.complete(nextOf(config));
    }, ctx.reduced ? 350 : 1050);
  };

  target.addEventListener("click", catchIt);
  target.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    catchIt();
  });
  stage.addEventListener("pointerdown", (event) => {
    if (event.target === target || !alive || caught || !ctx.canInteract()) return;
    if (ctx.reduced) {
      ctx.whisper("right there. no rush.");
      return;
    }
    ctx.whisper("too slow. it is over there now.");
    drift();
  });

  if (!ctx.reduced) drift();

  return () => {
    alive = false;
    driftTween?.kill();
    gsap.killTweensOf([target, stage.querySelector(".catch-ring")]);
  };
}

/* Drag ---------------------------------------------------------------- */

function mountDrag(
  _question: Question,
  container: HTMLElement,
  ctx: InteractionContext,
  config: DragInteraction
): InteractionCleanup {
  const root = element("div", "interaction interaction--drag");
  const prompt = element("p", "interaction__prompt", "drag the right yarn into the basket");
  const stage = element("div", "drag-stage");
  const basket = element("div", "drag-basket");
  const basketLabel = element("span", "drag-basket__label", config.target);
  basket.append(element("span", "drag-basket__rim"), basketLabel);
  const items = element("div", "drag-items");
  const hint = element("p", "interaction__hint", config.hint ?? "");
  hint.setAttribute("aria-live", "polite");
  stage.append(basket, items);
  root.append(prompt, stage, hint);
  container.append(root);

  let alive = true;
  let done = false;
  let active: HTMLButtonElement | null = null;
  let startX = 0;
  let startY = 0;
  let moved = false;

  const balls = config.items.map((entry) => {
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

  function onDown(event: PointerEvent, item: HTMLButtonElement): void {
    if (done || active || !alive || !ctx.canInteract()) return;
    event.preventDefault();
    active = item;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    item.classList.add("is-dragging");
    try {
      item.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers and some browsers refuse capture. The drag still works.
    }
    gsap.to(item, { scale: ctx.reduced ? 1 : 1.08, duration: 0.18, ease: "power2.out" });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
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
    cleanupListeners();
  }

  function cleanupListeners(): void {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  function reset(item: HTMLButtonElement): void {
    gsap.to(item, {
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      duration: ctx.reduced ? 0.08 : 0.5,
      ease: "back.out(2)",
    });
    item.classList.remove("is-dragging");
    active = null;
  }

  function onUp(): void {
    if (!active || done) {
      cleanupListeners();
      return;
    }
    const item = active;
    const itemRect = item.getBoundingClientRect();
    const basketRect = basket.getBoundingClientRect();
    const distance = Math.hypot(
      itemRect.left + itemRect.width / 2 - (basketRect.left + basketRect.width / 2),
      itemRect.top + itemRect.height / 2 - (basketRect.top + basketRect.height / 2)
    );
    const correct = item.dataset.correct === "true";
    cleanupListeners();

    if (correct && (distance < 118 || !moved)) {
      done = true;
      active = null;
      item.classList.remove("is-dragging");
      item.classList.add("is-placed");
      basket.classList.add("is-fed");
      const x = Number(gsap.getProperty(item, "x"));
      const y = Number(gsap.getProperty(item, "y"));
      const dx = basketRect.left + basketRect.width / 2 - (itemRect.left + itemRect.width / 2);
      const dy = basketRect.top + basketRect.height * 0.22 - (itemRect.top + itemRect.height / 2);
      ctx.whisper(config.success ?? "that is the one.");
      hint.textContent = config.success ?? "that is the one.";
      gsap.to(item, {
        x: x + dx,
        y: y + dy,
        scale: 0.52,
        opacity: 0.75,
        rotate: -8,
        duration: ctx.reduced ? 0.1 : 0.5,
        ease: "power3.inOut",
      });
      const ring = element("span", "drag-ring");
      basket.append(ring);
      gsap.fromTo(
        ring,
        { scale: 0.4, opacity: 0.8 },
        { scale: 1.7, opacity: 0, duration: ctx.reduced ? 0.2 : 0.75, ease: "power2.out" }
      );
      window.setTimeout(() => {
        if (alive) ctx.complete(nextOf(config));
      }, ctx.reduced ? 400 : 1150);
      return;
    }

    reset(item);
    if (!moved) {
      ctx.whisper(correct ? "pick it up and bring it here." : config.hint ?? "not that one. try the warm one.");
    } else {
      ctx.whisper(config.hint ?? "not that one. try the warm one.");
    }
  }

  return () => {
    alive = false;
    done = true;
    cleanupListeners();
    gsap.killTweensOf([...balls, basket]);
  };
}

/* Scratch -------------------------------------------------------------- */

function mountScratch(
  _question: Question,
  container: HTMLElement,
  ctx: InteractionContext,
  config: ScratchInteraction
): InteractionCleanup {
  const root = element("div", "interaction interaction--scratch");
  const prompt = element("p", "interaction__prompt", "scratch the card. it will not bite.");
  const card = element("div", "scratch-card");
  const under = element("div", "scratch-under");
  if (config.image) {
    const img = document.createElement("img");
    img.src = new URL(config.image, document.baseURI).href;
    img.alt = config.caption ?? "the photo under the scratch card";
    img.loading = "eager";
    img.draggable = false;
    under.append(img);
  }
  const caption = element("p", "scratch-under__caption", config.caption ?? config.reveal);
  under.append(caption);
  const canvas = document.createElement("canvas");
  canvas.className = "scratch-canvas";
  const label = element("span", "scratch-label", "scratch here");
  card.append(under, canvas, label);
  const hint = element("p", "interaction__hint is-concealed", config.reveal);
  hint.setAttribute("aria-live", "polite");
  const revealButton = element("button", "soft-btn scratch-skip", "reveal it");
  revealButton.type = "button";
  root.append(prompt, card, hint, revealButton);
  container.append(root);

  let alive = true;
  let done = false;
  let scratching = false;
  let context: CanvasRenderingContext2D | null = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let lastX = 0;
  let lastY = 0;
  let cleared = 0;

  const finish = () => {
    if (done || !alive) return;
    done = true;
    scratching = false;
    card.classList.add("is-open");
    label.classList.add("is-gone");
    hint.classList.remove("is-concealed");
    hint.classList.add("is-visible");
    ctx.whisper(config.reveal);
    gsap.to(canvas, {
      opacity: 0,
      duration: ctx.reduced ? 0.12 : 0.5,
      ease: "power2.out",
      onComplete: () => {
        canvas.style.pointerEvents = "none";
      },
    });
    window.setTimeout(() => {
      if (alive) ctx.complete(nextOf(config));
    }, ctx.reduced ? 400 : 1450);
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
    gradient.addColorStop(0.5, accent);
    gradient.addColorStop(1, paper);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.22;
    context.fillStyle = ink;
    for (let index = 0; index < 46; index += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      context.beginPath();
      context.arc(x, y, Math.random() * 2.4 + 0.6, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.strokeStyle = "rgba(255,255,255,0.38)";
    context.lineWidth = 1;
    for (let index = 0; index < 8; index += 1) {
      context.beginPath();
      context.moveTo(0, (height / 8) * index + 12);
      context.lineTo(width, (height / 8) * index - 12);
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
    }
    cleared = Math.min(width * height, cleared + Math.PI * radius * radius + distance * radius * 1.7);
    lastX = x;
    lastY = y;
  };

  const percentCleared = () => (width && height ? cleared / (width * height) : 0);

  const pointer = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onDown = (event: PointerEvent) => {
    if (!alive || done || !ctx.canInteract()) return;
    event.preventDefault();
    scratching = true;
    const point = pointer(event);
    lastX = point.x;
    lastY = point.y;
    brush(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  };

  const onMove = (event: PointerEvent) => {
    if (!scratching || done) return;
    const point = pointer(event);
    brush(point.x, point.y);
    if (percentCleared() > 0.42) finish();
  };

  const onUp = () => {
    scratching = false;
    if (!done && percentCleared() > 0.3) finish();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", () => {
    scratching = false;
  });
  revealButton.addEventListener("click", finish);

  requestAnimationFrame(() => {
    sizeCanvas();
  });

  return () => {
    alive = false;
    done = true;
    scratching = false;
    gsap.killTweensOf(canvas);
  };
}

export function mountInteraction(
  question: Question,
  container: HTMLElement,
  ctx: InteractionContext
): InteractionCleanup {
  if (question.type === "catch" && question.interaction) {
    return mountCatch(question, container, ctx, question.interaction as CatchInteraction);
  }
  if (question.type === "drag" && question.interaction) {
    return mountDrag(question, container, ctx, question.interaction as DragInteraction);
  }
  if (question.type === "scratch" && question.interaction) {
    return mountScratch(question, container, ctx, question.interaction as ScratchInteraction);
  }
  return () => undefined;
}
