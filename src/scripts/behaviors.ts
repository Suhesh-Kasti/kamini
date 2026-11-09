import { gsap } from "gsap";
import type { BehaviorResult, Question, QuestionButton } from "../lib/types";
import { EASE, shake, pulse } from "./animations";

export type BehaviorPhase = "hover" | "tap" | "click";

export interface BehaviorContext {
  btn: HTMLButtonElement;
  def: QuestionButton;
  buttons: HTMLButtonElement[];
  question: Question;
  reduced: boolean;
  phase: BehaviorPhase;
  whisper: (text: string) => void;
  lines?: Record<string, string[]>;
}

function pickLine(ctx: BehaviorContext, key: string, fallback: string): string {
  const pool = ctx.lines?.[key];
  if (!pool || pool.length === 0) return fallback;
  return pool[Math.floor(Math.random() * pool.length)];
}

type Behavior = (ctx: BehaviorContext) => Promise<BehaviorResult>;

function labelEl(btn: HTMLButtonElement): HTMLElement {
  return (btn.querySelector(".answer__label") as HTMLElement) ?? btn;
}

function otherButton(btn: HTMLButtonElement, buttons: HTMLButtonElement[]): HTMLButtonElement | undefined {
  return buttons.find((candidate) => candidate !== btn);
}

function labelOf(btn: HTMLButtonElement): string {
  return labelEl(btn).textContent ?? "";
}

function setLabel(btn: HTMLButtonElement, text: string): void {
  labelEl(btn).textContent = text;
}

function safeOffset(btn: HTMLButtonElement, maxX = 90, maxY = 56): { x: number; y: number } {
  const rect = btn.getBoundingClientRect();
  const pad = 14;
  const lowX = Math.max(-maxX, pad - rect.left);
  const highX = Math.min(maxX, window.innerWidth - pad - rect.right);
  const lowY = Math.max(-maxY, pad - rect.top);
  const highY = Math.min(maxY, window.innerHeight - pad - rect.bottom);
  const pick = (low: number, high: number) =>
    high <= low ? 0 : low + Math.random() * (high - low);
  return { x: pick(lowX, highX), y: pick(lowY, highY) };
}

function killTransforms(btn: HTMLButtonElement): void {
  gsap.killTweensOf(btn);
  btn.classList.remove("answer--glow", "answer--ghost", "answer--puddle");
}

function tweenTo(btn: HTMLElement, vars: gsap.TweenVars): Promise<void> {
  return new Promise((resolve) => {
    gsap.to(btn, { ...vars, onComplete: resolve });
  });
}

function timelineTo(build: (timeline: gsap.core.Timeline) => void): Promise<void> {
  return new Promise((resolve) => {
    const timeline = gsap.timeline({ onComplete: resolve });
    build(timeline);
  });
}

export function cycleLabel(btn: HTMLButtonElement, labels: string[] | undefined): boolean {
  if (!labels || labels.length === 0) return false;
  const index = Number(btn.dataset.labelIndex ?? 0);
  const next = (index + 1) % labels.length;
  btn.dataset.labelIndex = String(next);
  btn.dataset.lastCycle = String(performance.now());
  const el = labelEl(btn);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = labels[next];
    return true;
  }
  gsap
    .timeline()
    .to(el, { y: -6, opacity: 0, duration: 0.1, ease: "power2.in" })
    .add(() => {
      el.textContent = labels[next];
    })
    .fromTo(el, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: EASE.pillow });
  return true;
}

function startDodge(btn: HTMLButtonElement, ctx: BehaviorContext): Promise<void> {
  const now = performance.now();
  const last = Number(btn.dataset.lastDodge ?? 0);
  if (now - last < 550) return Promise.resolve();
  btn.dataset.lastDodge = String(now);

  if (ctx.reduced) {
    return tweenTo(btn, { x: 8, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" });
  }

  const offset = safeOffset(btn, 100, 64);
  return new Promise((resolve) => {
    gsap
      .timeline({ onComplete: resolve })
      .to(btn, {
        x: offset.x,
        y: offset.y,
        rotate: gsap.utils.random(-5, 5),
        duration: 0.5,
        ease: EASE.pillow,
      })
      .to(btn, { x: 0, y: 0, rotate: 0, duration: 0.9, ease: EASE.pillow }, "+=1.1");
  });
}

const behaviors: Record<string, Behavior> = {
  async runaway(ctx) {
    await startDodge(ctx.btn, ctx);
    return "consume";
  },

  async shrink(ctx) {
    if (ctx.phase === "hover") {
      await tweenTo(ctx.btn, { scale: 0.88, duration: 0.35, ease: EASE.lift });
    } else {
      await timelineTo((timeline) => {
        timeline
          .to(ctx.btn, { scale: 0.9, duration: 0.16, ease: "power2.in" })
          .to(ctx.btn, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.5)" });
      });
    }
    return "pass";
  },

  async grow(ctx) {
    if (ctx.phase === "hover") {
      await tweenTo(ctx.btn, { scale: 1.1, duration: 0.35, ease: EASE.lift });
    } else {
      await pulse(ctx.btn, ctx.reduced);
    }
    return "pass";
  },

  async swap_label(ctx) {
    cycleLabel(ctx.btn, ctx.def.labels_cycle);
    return "consume";
  },

  async swap_roles(ctx) {
    const other = otherButton(ctx.btn, ctx.buttons);
    if (!other) return "pass";
    const mine = labelOf(ctx.btn);
    const theirs = labelOf(other);

    if (ctx.btn.dataset.role === "correct") {
      setLabel(ctx.btn, theirs);
      setLabel(other, mine);
      await timelineTo((timeline) => {
        timeline
          .to(ctx.btn, { scale: 1.08, duration: 0.16, ease: EASE.lift })
          .to(ctx.btn, { scale: 1, duration: 0.45, ease: "elastic.out(1, 0.4)" });
      });
      setLabel(ctx.btn, mine);
      setLabel(other, theirs);
      ctx.whisper(pickLine(ctx, "swap_roles_correct", "okay okay, you win"));
      return "pass";
    }

    ctx.btn.dataset.role = other.dataset.role;
    other.dataset.role = "wrong";
    setLabel(ctx.btn, theirs);
    setLabel(other, mine);
    ctx.whisper(pickLine(ctx, "swap_roles_wrong", "hm. that is not what you meant"));
    await timelineTo((timeline) => {
      timeline
        .to(ctx.btn, { scale: 1.1, rotate: -2, duration: 0.2, ease: EASE.lift })
        .to(ctx.btn, { scale: 1, rotate: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
    });
    return "consume";
  },

  async dodge_then_accept(ctx) {
    const attempts = Number(ctx.btn.dataset.attempts ?? 0) + 1;
    ctx.btn.dataset.attempts = String(attempts);
    if (attempts < 3) {
      await startDodge(ctx.btn, ctx);
      return "consume";
    }
    await shake(ctx.btn, 4);
    ctx.whisper(pickLine(ctx, "dodge_accept", "fine. you win this one"));
    return "advance";
  },

  async ghost(ctx) {
    const offset = safeOffset(ctx.btn, 80, 50);
    await tweenTo(ctx.btn, {
      opacity: 0.15,
      x: offset.x,
      y: offset.y,
      duration: ctx.reduced ? 0.12 : 0.5,
      ease: EASE.hush,
    });
    gsap.delayedCall(1.2, () => {
      gsap.to(ctx.btn, { opacity: 1, x: 0, y: 0, duration: 0.7, ease: EASE.pillow });
    });
    return "consume";
  },

  async morph(ctx) {
    const other = otherButton(ctx.btn, ctx.buttons);
    const mine = labelOf(ctx.btn);
    const theirs = other ? labelOf(other) : mine;
    await timelineTo((timeline) => {
      timeline
        .to(ctx.btn, { scaleX: 0.55, filter: "blur(2px)", duration: 0.22, ease: "power2.in" })
        .add(() => setLabel(ctx.btn, theirs))
        .to(ctx.btn, { scaleX: 1, filter: "blur(0px)", duration: 0.5, ease: "elastic.out(1, 0.45)" })
        .add(() => setLabel(ctx.btn, mine));
    });
    return "consume";
  },

  async disabled_polite(ctx) {
    await shake(ctx.btn, 4);
    ctx.whisper(pickLine(ctx, "disabled_polite", "not this one, love"));
    return "consume";
  },

  async multi_stage() {
    return "advance";
  },

  async escape_forever(ctx) {
    const attempts = Number(ctx.btn.dataset.attempts ?? 0) + 1;
    ctx.btn.dataset.attempts = String(attempts);
    if (attempts >= 3) {
      ctx.btn.dataset.state = "escaping";
      const direction = Math.random() > 0.5 ? 1 : -1;
      await tweenTo(ctx.btn, {
        x: direction * (window.innerWidth + 200),
        y: -80,
        rotate: direction * 20,
        opacity: 0,
        duration: ctx.reduced ? 0.3 : 1.1,
        ease: "power2.in",
      });
      ctx.btn.disabled = true;
      ctx.btn.dataset.state = "gone";
      ctx.whisper(pickLine(ctx, "escape", "gone. it could not take the pressure"));
      return "consume";
    }
    await startDodge(ctx.btn, ctx);
    return "consume";
  },

  async mirror(ctx) {
    const other = otherButton(ctx.btn, ctx.buttons);
    if (!other) return "consume";
    const offset = safeOffset(ctx.btn, 40, 24);
    await tweenTo(other, { x: -offset.x, y: offset.y * 0.6, duration: 0.45, ease: EASE.pillow });
    gsap.delayedCall(0.9, () => {
      gsap.to(other, { x: 0, y: 0, duration: 0.7, ease: EASE.pillow });
    });
    return "consume";
  },

  async peek_a_boo(ctx) {
    const other = otherButton(ctx.btn, ctx.buttons);
    const attempts = Number(ctx.btn.dataset.attempts ?? 0) + 1;
    ctx.btn.dataset.attempts = String(attempts);
    if (!other) {
      await startDodge(ctx.btn, ctx);
      return "consume";
    }
    const target = other.getBoundingClientRect();
    const mine = ctx.btn.getBoundingClientRect();
    const x = target.left + target.width / 2 - (mine.left + mine.width / 2);
    const y = target.top + target.height / 2 - (mine.top + mine.height / 2);
    await tweenTo(ctx.btn, {
      x,
      y,
      scale: 0.55,
      opacity: 0.6,
      duration: ctx.reduced ? 0.15 : 0.45,
      ease: EASE.hush,
    });
    gsap.delayedCall(attempts > 1 ? 1.4 : 0.7, () => {
      gsap.to(ctx.btn, {
        y: y - 14,
        scale: 0.8,
        opacity: 0.92,
        duration: 0.6,
        ease: EASE.pillow,
      });
    });
    return "consume";
  },

  async jelly(ctx) {
    await timelineTo((timeline) => {
      if (ctx.reduced) {
        timeline.to(ctx.btn, { scale: 0.97, duration: 0.12, yoyo: true, repeat: 1 });
        return;
      }
      timeline
        .to(ctx.btn, { scaleX: 1.12, scaleY: 0.9, rotate: -1.5, duration: 0.12, ease: "power2.out" })
        .to(ctx.btn, { scaleX: 0.94, scaleY: 1.08, rotate: 1.2, duration: 0.14, ease: "power2.inOut" })
        .to(ctx.btn, { scaleX: 1.04, scaleY: 0.97, rotate: -0.6, duration: 0.16, ease: "power2.inOut" })
        .to(ctx.btn, { scaleX: 1, scaleY: 1, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.35)" });
    });
    return "pass";
  },

  async sneeze(ctx) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    await timelineTo((timeline) => {
      timeline.to(ctx.btn, { rotate: -6, scale: 0.94, duration: 0.12, ease: "power2.in" });
      timeline.to(ctx.btn, { rotate: 5, scale: 0.9, duration: 0.08, ease: "power2.inOut" });
      timeline.to(
        ctx.btn,
        {
          x: direction * (window.innerWidth * 0.75),
          y: -140,
          rotate: direction * 42,
          opacity: 0,
          duration: ctx.reduced ? 0.15 : 0.55,
          ease: "power3.out",
        },
        "+=0.05"
      );
    });
    ctx.whisper(pickLine(ctx, "sneeze", "achoo"));
    gsap.delayedCall(1.35, () => {
      gsap.set(ctx.btn, { x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 });
      if (ctx.def.labels_cycle) cycleLabel(ctx.btn, ctx.def.labels_cycle);
    });
    return "consume";
  },

  async hide_behind(ctx) {
    return behaviors.peek_a_boo(ctx);
  },

  async puddle(ctx) {
    if (ctx.reduced) {
      await tweenTo(ctx.btn, { opacity: 0.5, duration: 0.2 });
      gsap.to(ctx.btn, { opacity: 1, duration: 0.3 });
      return "consume";
    }
    const offset = safeOffset(ctx.btn, 70, 36);
    await timelineTo((timeline) => {
      timeline
        .to(ctx.btn, {
          scaleY: 0.2,
          scaleX: 1.25,
          y: offset.y + 14,
          x: offset.x,
          borderRadius: "50%",
          filter: "blur(1px)",
          duration: 0.5,
          ease: "power2.in",
        })
        .to(ctx.btn, { opacity: 0.5, duration: 0.2 }, "-=0.1")
        .to(ctx.btn, {
          scaleY: 1,
          scaleX: 1,
          y: 0,
          x: 0,
          opacity: 1,
          borderRadius: "999px",
          filter: "blur(0px)",
          duration: 0.8,
          ease: EASE.pillow,
        });
    });
    return "consume";
  },

  async spin_away(ctx) {
    const offset = safeOffset(ctx.btn, 90, 40);
    await tweenTo(ctx.btn, {
      rotate: 360,
      x: offset.x,
      y: offset.y,
      duration: ctx.reduced ? 0.2 : 0.75,
      ease: EASE.pillow,
    });
    gsap.to(ctx.btn, { rotate: 12, duration: 0.4, ease: "power2.out" });
    if (ctx.def.labels_cycle) cycleLabel(ctx.btn, ctx.def.labels_cycle);
    return "consume";
  },

  async unravel(ctx) {
    if (ctx.reduced) {
      await tweenTo(ctx.btn, { opacity: 0.4, duration: 0.2 });
      gsap.to(ctx.btn, { opacity: 1, duration: 0.25 });
      return "consume";
    }
    const offset = safeOffset(ctx.btn, 70, 30);
    await timelineTo((timeline) => {
      timeline
        .to(ctx.btn, { scaleY: 0.55, skewX: 14, rotate: -4, y: 18, duration: 0.35, ease: "power2.in" })
        .to(ctx.btn, { opacity: 0.45, filter: "blur(1px)", duration: 0.2 }, "-=0.1")
        .to(ctx.btn, {
          scaleY: 1,
          skewX: 0,
          rotate: 0,
          y: 0,
          x: offset.x,
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.8,
          ease: EASE.unfurl,
        });
    });
    return "consume";
  },

  async chase(ctx) {
    const wrong = ctx.buttons.filter((b) => b.dataset.role === "wrong");
    wrong.forEach((btn, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      gsap.to(btn, {
        x: direction * (window.innerWidth * 0.6),
        y: -60,
        opacity: 0,
        rotate: direction * 14,
        duration: ctx.reduced ? 0.2 : 0.9,
        ease: "power2.in",
        delay: index * 0.08,
      });
    });
    return "pass";
  },

  async sleepy(ctx) {
    ctx.btn.dataset.state = "asleep";
    await tweenTo(ctx.btn, {
      rotate: -4,
      scaleY: 0.86,
      y: 6,
      duration: ctx.reduced ? 0.15 : 0.7,
      ease: EASE.pillow,
    });
    ctx.whisper(pickLine(ctx, "sleepy", "it fell asleep. let it rest"));
    return ctx.btn.dataset.role === "correct" ? "pass" : "consume";
  },

  async pop_up(ctx) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = gsap.utils.random(-width * 0.22, width * 0.22);
    const y = gsap.utils.random(-height * 0.18, height * 0.1);
    ctx.btn.classList.add("answer--glow");
    await tweenTo(ctx.btn, {
      x,
      y,
      scale: 1.05,
      duration: ctx.reduced ? 0.15 : 0.55,
      ease: EASE.pillow,
    });
    gsap.delayedCall(1.2, () => {
      ctx.btn.classList.remove("answer--glow");
    });
    return "pass";
  },

  async thread_reel(ctx) {
    const rect = ctx.btn.getBoundingClientRect();
    const line = document.createElement("div");
    line.className = "thread-line";
    line.style.left = `${rect.left + rect.width / 2}px`;
    line.style.top = `${rect.top + rect.height / 2}px`;
    line.style.width = "0px";
    document.body.append(line);

    const direction = Math.random() > 0.5 ? 1 : -1;
    const targetX = direction * window.innerWidth * 0.6;

    if (!ctx.reduced) {
      gsap.to(line, {
        width: Math.abs(targetX),
        marginLeft: direction < 0 ? -Math.abs(targetX) : 0,
        duration: 0.6,
        ease: "power2.in",
      });
    }

    await tweenTo(ctx.btn, {
      x: targetX,
      y: 24,
      scale: 0.6,
      rotate: direction * 10,
      opacity: 0,
      duration: ctx.reduced ? 0.2 : 0.65,
      ease: "power2.in",
    });

    gsap.to(line, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => line.remove(),
    });

    gsap.delayedCall(1.3, () => {
      gsap.set(ctx.btn, { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 });
    });
    return "consume";
  },
};

const RESETS_TRANSFORM = new Set([
  "runaway",
  "shrink",
  "grow",
  "swap_roles",
  "dodge_then_accept",
  "ghost",
  "morph",
  "disabled_polite",
  "escape_forever",
  "mirror",
  "peek_a_boo",
  "jelly",
  "sneeze",
  "hide_behind",
  "puddle",
  "spin_away",
  "unravel",
  "chase",
  "sleepy",
  "pop_up",
  "thread_reel",
]);

export async function runBehavior(
  name: string | undefined,
  ctx: BehaviorContext
): Promise<BehaviorResult> {
  if (!name) return "pass";
  const behavior = behaviors[name];
  if (!behavior) return "pass";
  if (RESETS_TRANSFORM.has(name)) killTransforms(ctx.btn);
  try {
    return await behavior(ctx);
  } catch {
    return "pass";
  }
}

export function resetHover(btn: HTMLButtonElement): void {
  if (btn.dataset.state === "asleep" || btn.dataset.state === "gone" || btn.dataset.state === "escaping") {
    return;
  }
  gsap.to(btn, { scale: 1, duration: 0.42, ease: EASE.pillow, overwrite: "auto" });
}
