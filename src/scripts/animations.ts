import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

export function initEases(): void {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(CustomEase);
  CustomEase.create("pillow", "M0,0 C0.16,1 0.3,1 1,1");
  CustomEase.create("hush", "M0,0 C0.37,0 0.28,1 1,1");
  CustomEase.create("lift", "M0,0 C0.22,0.9 0.24,1 1,1");
  CustomEase.create("unfurl", "M0,0 C0.2,0.7 0.1,1 1,1");
  CustomEase.create("breath", "M0,0 C0.6,0 0.3,1 1,1");
  CustomEase.create("snap", "M0,0 C0.2,0 0,1 1,1");
  CustomEase.create("drift", "M0,0 C0.24,0.05 0.2,1 1,1");
  CustomEase.create("shimmer", "M0,0 C0.4,0 0.15,1 1,1");
  CustomEase.create("shutter", "M0,0 C0.72,0 0.24,1 1,1");
  CustomEase.create("spring", "M0,0 C0.34,1.56 0.64,1 1,1");
  CustomEase.create("stitch", "M0,0 L0.18,0.12 L0.2,0.3 L0.38,0.28 L0.4,0.52 L0.58,0.48 L0.6,0.72 L0.78,0.68 L0.8,0.9 L1,1");
  CustomEase.create("scrap", "M0,0 C0.28,1.2 0.5,1 1,1");
}

export const EASE = {
  pillow: "pillow",
  hush: "hush",
  lift: "lift",
  unfurl: "unfurl",
  breath: "breath",
  snap: "snap",
  drift: "drift",
  shimmer: "shimmer",
  shutter: "shutter",
  spring: "spring",
  stitch: "stitch",
  scrap: "scrap",
} as const;

export function motionEase(motion: string | undefined): string {
  switch (motion) {
    case "snap":
      return EASE.snap;
    case "drift":
      return EASE.drift;
    case "shimmer":
      return EASE.shimmer;
    case "shutter":
      return EASE.shutter;
    case "spring":
      return EASE.spring;
    case "stitch":
      return EASE.stitch;
    case "bounce":
      return EASE.scrap;
    default:
      return EASE.pillow;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function splitWords(el: HTMLElement, text: string): HTMLElement[] {
  el.textContent = "";
  const words = text.split(/\s+/).filter(Boolean);
  const nodes: HTMLElement[] = [];
  words.forEach((word, index) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = word;
    el.append(span);
    if (index < words.length - 1) el.append(document.createTextNode(" "));
    nodes.push(span);
  });
  return nodes;
}

export function prepareNoteWords(el: HTMLElement, text: string): HTMLElement[] {
  return splitWords(el, text);
}

export function prepareNoteLines(el: HTMLElement, text: string, maxChars = 34): HTMLElement[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  el.textContent = "";
  const inners: HTMLElement[] = [];
  for (const line of lines) {
    const lineEl = document.createElement("span");
    lineEl.className = "note-line";
    const inner = document.createElement("span");
    inner.textContent = line;
    lineEl.append(inner);
    el.append(lineEl);
    inners.push(inner);
  }
  return inners;
}

export function canBlur(): boolean {
  return !window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
}

export function revealNoteWords(
  el: HTMLElement,
  options: { delay?: number; duration?: number; stagger?: number; y?: number; reduced?: boolean } = {}
): gsap.core.Timeline {
  const nodes = el.querySelectorAll(".word");
  const timeline = gsap.timeline({ delay: options.delay ?? 0 });
  if (options.reduced) {
    timeline.fromTo(nodes, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.01 });
    return timeline;
  }
  const blur = canBlur();
  timeline.fromTo(
    nodes,
    { opacity: 0, y: options.y ?? 12, ...(blur ? { filter: "blur(6px)" } : {}) },
    {
      opacity: 1,
      y: 0,
      ...(blur ? { filter: "blur(0px)" } : {}),
      duration: options.duration ?? 0.55,
      stagger: options.stagger ?? 0.035,
      ease: EASE.pillow,
    }
  );
  return timeline;
}

export function revealNoteLines(
  lines: HTMLElement[],
  options: { delay?: number; duration?: number; stagger?: number; reduced?: boolean } = {}
): gsap.core.Timeline {
  const timeline = gsap.timeline({ delay: options.delay ?? 0 });
  if (options.reduced) {
    timeline.fromTo(lines, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.02 });
    return timeline;
  }
  timeline.fromTo(
    lines,
    { yPercent: 110, opacity: 0 },
    {
      yPercent: 0,
      opacity: 1,
      duration: options.duration ?? 0.8,
      stagger: options.stagger ?? 0.22,
      ease: EASE.unfurl,
    }
  );
  return timeline;
}

export function questionEntrance(
  root: HTMLElement,
  options: { reduced?: boolean; motion?: string } = {}
): gsap.core.Timeline {
  const eyebrow = root.querySelector<HTMLElement>("[data-eyebrow]");
  const words = root.querySelectorAll<HTMLElement>(".question .word");
  const answers = root.querySelectorAll<HTMLElement>(".answer, .interaction");
  const whisper = root.querySelector<HTMLElement>("[data-whisper]");
  const sheet = root.querySelector<HTMLElement>("[data-sheet]");
  if (sheet) gsap.set(sheet, { clearProps: "transform,opacity", scaleY: 1, opacity: 1, visibility: "visible" });
  const motion = options.motion ?? "pillow";
  const ease = motionEase(motion);
  const timeline = gsap.timeline();

  if (options.reduced) {
    timeline
      .fromTo([eyebrow, words, answers], { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.01 })
      .set(whisper, { opacity: 0 });
    return timeline;
  }

  const blurAllowed = canBlur() && !options.reduced;
  const wordsFrom: gsap.TweenVars = { opacity: 0, y: 22 };
  const wordsTo: gsap.TweenVars = { opacity: 1, y: 0, duration: 0.8, stagger: 0.055, ease };
  if (blurAllowed) {
    wordsFrom.filter = "blur(8px)";
    wordsTo.filter = "blur(0px)";
  }
  const answersFrom: gsap.TweenVars = { opacity: 0, y: 18, scale: 0.97 };
  const answersTo: gsap.TweenVars = { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.07, ease };
  const eyebrowFrom: gsap.TweenVars = { opacity: 0, y: 8 };
  const eyebrowTo: gsap.TweenVars = { opacity: 1, y: 0, duration: 0.6, ease: EASE.hush };

  if (motion === "snap") {
    wordsFrom.x = -18;
    wordsFrom.rotate = -1.5;
    wordsTo.x = 0;
    wordsTo.rotate = 0;
    answersFrom.x = -12;
    answersFrom.rotate = -1;
    answersTo.x = 0;
    answersTo.rotate = 0;
  } else if (motion === "drift") {
    wordsFrom.y = 32;
    wordsFrom.filter = "blur(10px)";
    wordsTo.duration = 1.1;
    wordsTo.stagger = 0.07;
    answersFrom.y = 24;
    answersTo.duration = 0.95;
  } else if (motion === "shimmer") {
    wordsFrom.y = 16;
    wordsFrom.filter = "blur(6px)";
    wordsTo.duration = 0.9;
    wordsTo.stagger = 0.06;
    answersFrom.y = 10;
  } else if (motion === "shutter") {
    wordsFrom.y = 20;
    wordsFrom.scaleY = 0.8;
    wordsTo.scaleY = 1;
    wordsTo.duration = 0.8;
    answersFrom.x = 16;
    answersTo.x = 0;
  } else if (motion === "spring") {
    wordsFrom.y = 26;
    wordsFrom.scale = 0.94;
    wordsTo.scale = 1;
    wordsTo.ease = "back.out(1.7)";
    answersFrom.y = 22;
    answersFrom.scale = 0.92;
    answersTo.scale = 1;
    answersTo.ease = "back.out(1.7)";
  } else if (motion === "stitch") {
    wordsFrom.y = 18;
    wordsFrom.clipPath = "inset(0 0 100% 0)";
    wordsTo.clipPath = "inset(0 0 0% 0)";
    wordsTo.duration = 0.9;
    wordsTo.stagger = 0.07;
    answersFrom.clipPath = "inset(0 100% 0 0)";
    answersTo.clipPath = "inset(0 0% 0 0)";
  } else if (motion === "bounce") {
    wordsFrom.y = 24;
    wordsFrom.scale = 0.9;
    wordsFrom.rotate = -1;
    wordsTo.scale = 1;
    wordsTo.rotate = 0;
    wordsTo.ease = "back.out(1.8)";
    answersFrom.y = 22;
    answersFrom.rotate = -1.5;
    answersTo.rotate = 0;
    answersTo.ease = "back.out(1.8)";
  }

  if (!blurAllowed) {
    delete wordsFrom.filter;
    delete wordsTo.filter;
  }

  if (motion === "shimmer") {
    document.documentElement.classList.add("is-shimmer");
    gsap.delayedCall(1.2, () => document.documentElement.classList.remove("is-shimmer"));
  }

  timeline
    .fromTo(eyebrow, eyebrowFrom, eyebrowTo, 0)
    .fromTo(words, wordsFrom, wordsTo, 0.08)
    .fromTo(answers, answersFrom, answersTo, 0.38)
    .fromTo(whisper, { opacity: 0 }, { opacity: 0, duration: 0.1 }, 0.4);

  if (sheet && motion === "snap") {
    timeline.fromTo(sheet, { rotate: -1.6 }, { rotate: -1.1, duration: 0.8, ease: EASE.pillow }, 0);
  }

  return timeline;
}

export function sceneExit(
  root: HTMLElement,
  motion = "pillow",
  isReduced = false
): Promise<void> {
  const words = root.querySelectorAll<HTMLElement>(".question .word");
  const answers = root.querySelectorAll<HTMLElement>(".answer, .interaction");
  const eyebrow = root.querySelector<HTMLElement>("[data-eyebrow]");
  const whisper = root.querySelector<HTMLElement>("[data-whisper]");
  const sheet = root.querySelector<HTMLElement>("[data-sheet]");
  const ease = motionEase(motion);
  const blurAllowed = canBlur() && !isReduced;

  return new Promise((resolve) => {
    if (isReduced) {
      gsap.to([eyebrow, words, answers, whisper], { opacity: 0, duration: 0.16, onComplete: resolve });
      return;
    }

    const timeline = gsap.timeline({ onComplete: resolve });
    if (motion === "drift") {
      timeline
        .to(words, { y: -22, opacity: 0, ...(blurAllowed ? { filter: "blur(10px)" } : {}), duration: 0.85, stagger: 0.025, ease })
        .to(answers, { y: -12, opacity: 0, duration: 0.6 }, 0.15)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.35 }, 0);
    } else if (motion === "shutter") {
      timeline
        .to(sheet, { scaleY: 0.08, opacity: 0, transformOrigin: "50% 0%", duration: 0.55, ease })
        .to([eyebrow, whisper], { opacity: 0, duration: 0.25 }, 0);
    } else if (motion === "shimmer") {
      document.documentElement.classList.add("is-shimmer");
      timeline
        .to(words, { y: -14, opacity: 0, ...(blurAllowed ? { filter: "blur(6px)" } : {}), duration: 0.55, ease })
        .to(answers, { y: -10, opacity: 0, duration: 0.45 }, 0.05)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.25 }, 0)
        .add(() => document.documentElement.classList.remove("is-shimmer"), 0.65);
    } else if (motion === "spring") {
      timeline
        .to(answers, { scale: 0.9, y: 20, opacity: 0, duration: 0.4, ease: "back.in(1.5)" })
        .to(words, { y: 16, opacity: 0, duration: 0.45, ease }, 0.05)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.25 }, 0);
    } else if (motion === "stitch") {
      timeline
        .to(words, { clipPath: "inset(0 0 0 100%)", opacity: 0, duration: 0.6, stagger: 0.03, ease })
        .to(answers, { clipPath: "inset(0 0 0 100%)", opacity: 0, duration: 0.45 }, 0.1)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.25 }, 0);
    } else if (motion === "bounce") {
      timeline
        .to(answers, { y: 28, rotate: 3, opacity: 0, duration: 0.4, ease: "back.in(1.6)", stagger: 0.03 })
        .to(words, { y: 20, scale: 0.96, opacity: 0, duration: 0.45, ease }, 0.04)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.24 }, 0);
    } else {
      timeline
        .to(words, { x: 26, opacity: 0, ...(blurAllowed ? { filter: "blur(6px)" } : {}), duration: 0.42, stagger: 0.025, ease })
        .to(answers, { x: 18, opacity: 0, duration: 0.34, stagger: 0.02, ease }, 0.05)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.24 }, 0);
    }
  });
}

export function notePaperEntrance(
  paper: HTMLElement,
  isReduced = false,
  options: { fromScale?: number; delay?: number; rotate?: number } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (isReduced) {
      gsap.fromTo(
        paper,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.3, delay: options.delay ?? 0, onComplete: resolve }
      );
      return;
    }
    gsap.fromTo(
      paper,
      { autoAlpha: 0, y: 26, scale: options.fromScale ?? 0.94, rotate: options.rotate ?? -2.2 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotate: options.rotate ?? -1.1,
        duration: 1.05,
        delay: options.delay ?? 0,
        ease: EASE.pillow,
        onComplete: resolve,
      }
    );
  });
}

export function shake(el: HTMLElement, strength = 6): Promise<void> {
  return new Promise((resolve) => {
    gsap
      .timeline({ onComplete: resolve })
      .to(el, { x: strength, duration: 0.06, ease: "power1.inOut" })
      .to(el, { x: -strength, duration: 0.08, ease: "power1.inOut" })
      .to(el, { x: strength * 0.6, duration: 0.07, ease: "power1.inOut" })
      .to(el, { x: 0, duration: 0.1, ease: EASE.pillow });
  });
}

export function pulse(el: HTMLElement, isReduced = false): Promise<void> {
  return new Promise((resolve) => {
    if (isReduced) {
      gsap.fromTo(el, { opacity: 0.7 }, { opacity: 1, duration: 0.2, onComplete: resolve });
      return;
    }
    gsap
      .timeline({ onComplete: resolve })
      .to(el, { scale: 1.06, duration: 0.16, ease: EASE.lift })
      .to(el, { scale: 1, duration: 0.4, ease: EASE.pillow });
  });
}

export function blinkEyes(eyes: NodeListOf<HTMLElement> | HTMLElement[], times = 1): void {
  const list = Array.from(eyes);
  if (!list.length) return;
  const timeline = gsap.timeline();
  for (let index = 0; index < times; index += 1) {
    timeline
      .to(list, { scaleY: 0.08, duration: 0.09, ease: "power2.in" })
      .to(list, { scaleY: 1, duration: 0.14, ease: "power2.out" });
    if (index < times - 1) timeline.to({}, { duration: 0.22 });
  }
}

export function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    gsap.delayedCall(seconds, resolve);
  });
}
