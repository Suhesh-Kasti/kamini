import { gsap } from "gsap";
import type { PersonalityId } from "../lib/types";

export const PERSONALITY_IDS: PersonalityId[] = [
  "scaredy",
  "sleepy",
  "showoff",
  "clumsy",
  "sassy",
  "confused",
  "hungry",
  "shy",
  "hyper",
  "proud",
  "sneaky",
  "peekaboo",
];

type Step = (ctx: PersonalityContext, beat: number) => Promise<void>;

interface Personality {
  labels: string[];
  lines: string[];
  character: string;
  step: Step;
}

export interface PersonalityContext {
  btn: HTMLButtonElement;
  other?: HTMLButtonElement;
  reduced: boolean;
  whisper: (text: string) => void;
  cue?: (kind: "wrong" | "boop") => void;
}

function play(build: (timeline: gsap.core.Timeline) => void): Promise<void> {
  return new Promise((resolve) => {
    const timeline = gsap.timeline({ onComplete: resolve });
    build(timeline);
  });
}

function labelEl(btn: HTMLButtonElement): HTMLElement {
  return btn.querySelector<HTMLElement>(".answer__label") ?? btn;
}

function reset(btn: HTMLButtonElement): void {
  gsap.set(btn, { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 });
}

function reaction(icon: string, btn: HTMLButtonElement): void {
  const rect = btn.getBoundingClientRect();
  const node = document.createElement("span");
  node.className = "personality-reaction";
  node.innerHTML = `<i class="fa-solid fa-${icon}" aria-hidden="true"></i>`;
  node.style.left = `${rect.left + rect.width / 2}px`;
  node.style.top = `${rect.top - 8}px`;
  document.body.append(node);
  gsap.fromTo(
    node,
    { y: 8, scale: 0.4, opacity: 0 },
    {
      y: -22,
      scale: 1,
      opacity: 1,
      duration: 0.35,
      ease: "back.out(2)",
      onComplete: () => {
        gsap.to(node, {
          y: -42,
          opacity: 0,
          duration: 0.35,
          ease: "power2.in",
          onComplete: () => node.remove(),
        });
      },
    }
  );
}

const PERSONALITIES: Record<PersonalityId, Personality> = {
  scaredy: {
    labels: ["no no no", "please stop", "not today"],
    lines: ["no no no", "please stop", "I am not built for this"],
    character: "cat",
    async step(ctx, beat) {
      if (ctx.reduced) {
        await play((timeline) => timeline.to(ctx.btn, { x: 4, duration: 0.08, yoyo: true, repeat: 1 }));
        return;
      }
      if (beat === 1) {
        await play((timeline) => timeline
          .to(ctx.btn, { x: -9, duration: 0.1, ease: "power2.out" })
          .to(ctx.btn, { x: 0, duration: 0.28, ease: "elastic.out(1, 0.4)" }));
      } else if (beat === 2) {
        await play((timeline) => timeline
          .to(ctx.btn, { x: 18, y: -8, duration: 0.18, ease: "power2.out" })
          .to(ctx.btn, { x: 0, y: 0, duration: 0.35, ease: "back.out(1.8)" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { x: -28, y: 10, rotate: -4, opacity: 0.2, duration: 0.2, ease: "power2.in" })
          .to(ctx.btn, { x: -28, y: 10, rotate: -4, opacity: 0.2, duration: 0.5 })
          .to(ctx.btn, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }));
      }
    },
  },
  sleepy: {
    labels: ["five more minutes", "so sleepy", "zzz"],
    lines: ["five more minutes", "so sleepy", "I am asleep now. still wrong."],
    character: "moon",
    async step(ctx, beat) {
      if (ctx.reduced) {
        await play((timeline) => timeline.to(ctx.btn, { opacity: 0.7, duration: 0.2 }));
        return;
      }
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { rotate: 2, y: 4, duration: 0.35, ease: "power1.inOut" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { rotate: 4, y: 9, scaleY: 0.95, duration: 0.4, ease: "power2.inOut" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { rotate: 5, y: 10, scaleY: 0.9, opacity: 0.65, duration: 0.5, ease: "power2.inOut" })
          .to(ctx.btn, { opacity: 0.45, duration: 0.4 }));
      }
    },
  },
  showoff: {
    labels: ["watch this", "I am the answer", "okay but watch"],
    lines: ["watch this", "I am the real answer", "okay but watch this one"],
    character: "star",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline
          .to(ctx.btn, { scale: 1.08, duration: 0.16, ease: "power2.out" })
          .to(ctx.btn, { scale: 1, duration: 0.35, ease: "elastic.out(1, 0.4)" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { rotate: 360, duration: 0.7, ease: "power2.inOut" }));
        reset(ctx.btn);
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { rotate: 520, x: 16, duration: 0.7, ease: "power2.inOut" })
          .to(ctx.btn, { rotate: 0, x: 0, duration: 0.4, ease: "back.out(1.6)" }));
      }
    },
  },
  clumsy: {
    labels: ["oops", "wait", "I got this"],
    lines: ["oops", "wait, I got this", "that was not part of the trick"],
    character: "feather",
    async step(ctx, beat) {
      if (ctx.reduced) {
        await play((timeline) => timeline.to(ctx.btn, { y: 2, duration: 0.1, yoyo: true, repeat: 1 }));
        return;
      }
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { y: 10, duration: 0.2, ease: "bounce.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline
          .to(ctx.btn, { y: 12, rotate: -8, x: -8, duration: 0.3, ease: "bounce.out" })
          .to(ctx.btn, { y: 0, rotate: 0, x: 0, duration: 0.35, ease: "back.out(1.8)" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { x: 18, y: 6, duration: 0.2, ease: "power2.out" })
          .to(ctx.btn, { x: 0, y: 0, duration: 0.4, ease: "elastic.out(1, 0.4)" }));
      }
    },
  },
  sassy: {
    labels: ["hm", "rude", "try the other one then"],
    lines: ["hm", "rude", "try the other one then"],
    character: "comments",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { scaleX: 1.06, scaleY: 0.94, duration: 0.2, ease: "power2.out" })
          .to(ctx.btn, { scaleX: 1, scaleY: 1, duration: 0.3, ease: "back.out(1.6)" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { rotate: 5, x: 12, duration: 0.3, ease: "power2.out" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { rotate: -5, x: 10, duration: 0.25, ease: "power2.out" })
          .to(ctx.btn, { rotate: 0, x: 0, duration: 0.35, ease: "back.out(1.6)" }));
      }
    },
  },
  confused: {
    labels: ["wait what", "am I the answer?", "no idea"],
    lines: ["wait what", "am I the answer?", "I have no idea what is happening"],
    character: "question",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { rotate: 4, duration: 0.25, ease: "power1.inOut" }));
      } else if (beat === 2) {
        await play((timeline) => timeline
          .to(ctx.btn, { rotate: -6, duration: 0.25, ease: "power1.inOut" })
          .to(ctx.btn, { rotate: 0, duration: 0.3, ease: "power1.inOut" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { y: -26, opacity: 0.15, duration: 0.4, ease: "power2.in" })
          .to(ctx.btn, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }));
      }
    },
  },
  hungry: {
    labels: ["is that food?", "just one bite", "I am full now"],
    lines: ["is that food?", "just one bite", "I am full now. still wrong."],
    character: "cookie-bite",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { scale: 1.04, y: 2, duration: 0.2, ease: "power2.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline
          .to(ctx.btn, { x: 12, scale: 1.08, duration: 0.25, ease: "power2.out" })
          .to(ctx.btn, { x: 0, scale: 1, duration: 0.3, ease: "power2.out" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { scaleX: 1.08, scaleY: 0.94, y: 3, duration: 0.3, ease: "power2.inOut" })
          .to(ctx.btn, { scaleX: 1, scaleY: 1, y: 0, duration: 0.35, ease: "power2.out" }));
      }
    },
  },
  shy: {
    labels: ["oh", "hi", "sorry"],
    lines: ["oh", "hi", "sorry, I will just be over here"],
    character: "heart",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { scale: 0.94, duration: 0.22, ease: "power2.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { x: 16, scale: 0.9, duration: 0.3, ease: "power2.out" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { x: 14, scale: 0.88, opacity: 0.6, duration: 0.3, ease: "power2.out" })
          .to(ctx.btn, { x: 0, scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.6)" }));
      }
    },
  },
  hyper: {
    labels: ["yes", "wheee", "again again"],
    lines: ["yes", "wheee", "again again again"],
    character: "paw",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      const height = beat === 1 ? 10 : beat === 2 ? 20 : 32;
      await play((timeline) => timeline
        .to(ctx.btn, { y: -height, duration: 0.18, ease: "power2.out" })
        .to(ctx.btn, { y: 0, duration: 0.4, ease: "bounce.out" }));
    },
  },
  proud: {
    labels: ["I am the answer", "obviously", "wait..."],
    lines: ["I am the answer", "obviously", "wait, that was too much"],
    character: "crown",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { scale: 1.1, duration: 0.2, ease: "power2.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { scale: 1.2, duration: 0.25, ease: "power2.out" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { scale: 0.9, duration: 0.18, ease: "power2.in" })
          .to(ctx.btn, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.4)" }));
      }
    },
  },
  sneaky: {
    labels: ["over here", "not here", "look again"],
    lines: ["over here", "not here", "look again"],
    character: "eye",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { x: 18, duration: 0.25, ease: "power2.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline.to(ctx.btn, { x: -18, duration: 0.25, ease: "power2.out" }));
      } else {
        if (ctx.other) gsap.to(ctx.other, { opacity: 0.2, duration: 0.2 });
        await play((timeline) => timeline
          .to(ctx.btn, { x: 12, duration: 0.25, ease: "power2.out" })
          .to(ctx.btn, { x: 0, duration: 0.3, ease: "power2.out" }));
        if (ctx.other) gsap.to(ctx.other, { opacity: 1, duration: 0.25 });
      }
    },
  },
  peekaboo: {
    labels: ["found me?", "nope", "guess again"],
    lines: ["found me?", "nope", "guess again"],
    character: "paw",
    async step(ctx, beat) {
      if (ctx.reduced) return;
      if (beat === 1) {
        await play((timeline) => timeline.to(ctx.btn, { opacity: 0.3, scale: 0.9, duration: 0.22, ease: "power2.out" }));
      } else if (beat === 2) {
        await play((timeline) => timeline
          .to(ctx.btn, { opacity: 0.15, scale: 0.84, duration: 0.2, ease: "power2.out" })
          .to(ctx.btn, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.8)" }));
      } else {
        await play((timeline) => timeline
          .to(ctx.btn, { opacity: 0.05, duration: 0.2, ease: "power2.in" })
          .to(ctx.btn, { opacity: 0.05, duration: 0.55 })
          .to(ctx.btn, { opacity: 1, duration: 0.3, ease: "power2.out" }));
      }
    },
  },
};

export async function runPersonality(
  id: PersonalityId,
  ctx: PersonalityContext
): Promise<void> {
  const personality = PERSONALITIES[id] ?? PERSONALITIES.scaredy;
  const previous = Number(ctx.btn.dataset.personalityStep ?? 0);
  const step = previous + 1;
  const beat = Math.min(step, 3);
  ctx.btn.dataset.personalityStep = String(step);
  ctx.btn.classList.add("is-personality-reacting");
  ctx.cue?.("wrong");
  try {
    await personality.step(ctx, beat);
    if (!ctx.reduced) reset(ctx.btn);
    if (step > 3 && !ctx.reduced) {
      const direction = step % 2 === 0 ? 1 : -1;
      await play((timeline) => timeline
        .to(ctx.btn, { x: 6 * direction, rotate: 2 * direction, duration: 0.12, ease: "sine.inOut" })
        .to(ctx.btn, { x: 0, rotate: 0, duration: 0.18, ease: "sine.inOut" }));
    }
  } catch {
    reset(ctx.btn);
  }
  const label = personality.labels[Math.min(step - 1, personality.labels.length - 1)];
  const el = labelEl(ctx.btn);
  const tl = gsap.timeline();
  tl.to(el, { y: -4, opacity: 0, duration: 0.1, ease: "power2.in" })
    .add(() => { el.textContent = label; })
    .fromTo(el, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, ease: "back.out(1.8)" });
  ctx.whisper(personality.lines[Math.min(step - 1, personality.lines.length - 1)]);
  reaction(personality.character, ctx.btn);
  ctx.btn.classList.remove("is-personality-reacting");
}
