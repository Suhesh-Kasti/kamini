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
}

export const EASE = {
  pillow: "pillow",
  hush: "hush",
  lift: "lift",
  unfurl: "unfurl",
  breath: "breath",
} as const;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function reduced(override?: boolean): boolean {
  return override ?? prefersReducedMotion();
}

/** Turn text into inline word spans without ever injecting HTML. */
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

/** Word spans safe inside the note paper, without line boxes. */
export function prepareNoteWords(el: HTMLElement, text: string): HTMLElement[] {
  return splitWords(el, text);
}

/** Balanced lines for the yarn ending, each in its own overflow mask. */
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
  timeline.fromTo(
    nodes,
    { opacity: 0, y: options.y ?? 12, filter: "blur(6px)" },
    {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
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
  options: { reduced?: boolean } = {}
): gsap.core.Timeline {
  const eyebrow = root.querySelector<HTMLElement>("[data-eyebrow]");
  const words = root.querySelectorAll<HTMLElement>(".question .word");
  const answers = root.querySelectorAll<HTMLElement>(".answer");
  const whisper = root.querySelector<HTMLElement>("[data-whisper]");
  const timeline = gsap.timeline();

  if (options.reduced) {
    timeline
      .fromTo([eyebrow, words, answers], { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.01 })
      .set(whisper, { opacity: 0 });
    return timeline;
  }

  timeline
    .fromTo(eyebrow, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.8, ease: EASE.hush }, 0)
    .fromTo(
      words,
      { opacity: 0, y: 26, filter: "blur(10px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.9,
        stagger: 0.06,
        ease: EASE.pillow,
      },
      0.1
    )
    .fromTo(
      answers,
      { opacity: 0, y: 24, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.75,
        stagger: 0.09,
        ease: EASE.lift,
      },
      0.42
    )
    .fromTo(whisper, { opacity: 0 }, { opacity: 0, duration: 0.1 }, 0.5);
  return timeline;
}

export function sceneExit(
  root: HTMLElement,
  kind = "fade_soft",
  isReduced = false
): Promise<void> {
  const words = root.querySelectorAll<HTMLElement>(".question .word");
  const answers = root.querySelectorAll<HTMLElement>(".answer");
  const eyebrow = root.querySelector<HTMLElement>("[data-eyebrow]");
  const whisper = root.querySelector<HTMLElement>("[data-whisper]");

  return new Promise((resolve) => {
    if (isReduced) {
      gsap.to([eyebrow, words, answers, whisper], {
        opacity: 0,
        duration: 0.16,
        onComplete: resolve,
      });
      return;
    }

    if (kind === "bounce_warm") {
      gsap
        .timeline({ onComplete: resolve })
        .to(answers, { scale: 0.96, opacity: 0, duration: 0.22, stagger: 0.03, ease: "power2.in" })
        .to(words, { y: -12, opacity: 0, duration: 0.32, ease: "power2.in" }, 0.05)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.24 }, 0);
      return;
    }

    if (kind === "thread_pull") {
      gsap
        .timeline({ onComplete: resolve })
        .to(words, { x: 30, scaleX: 1.12, opacity: 0, duration: 0.42, ease: EASE.hush, stagger: 0.02 })
        .to(answers, { scaleY: 0.4, opacity: 0, duration: 0.36, ease: "power2.in" }, 0.06)
        .to([eyebrow, whisper], { opacity: 0, duration: 0.24 }, 0);
      return;
    }

    if (kind === "ending_glow") {
      gsap
        .timeline({ onComplete: resolve })
        .to(root, { filter: "blur(12px)", opacity: 0.2, duration: 0.7, ease: EASE.hush })
        .to(words, { scale: 1.06, opacity: 0, duration: 0.7, ease: EASE.hush }, 0)
        .set(root, { clearProps: "filter,opacity" });
      return;
    }

    gsap
      .timeline({ onComplete: resolve })
      .to(words, { y: 18, opacity: 0, filter: "blur(8px)", duration: 0.4, stagger: 0.02, ease: "power2.in" })
      .to(answers, { y: 16, opacity: 0, duration: 0.3, stagger: 0.02, ease: "power2.in" }, 0.08)
      .to([eyebrow, whisper], { opacity: 0, duration: 0.2 }, 0);
  });
}

export function notePaperEntrance(
  paper: HTMLElement,
  isReduced = false,
  options: { fromScale?: number; delay?: number } = {}
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
      { autoAlpha: 0, y: 26, scale: options.fromScale ?? 0.94, rotate: -2.2 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotate: -1.1,
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
      .to(el, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.45)" });
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

export function floatForever(
  el: HTMLElement,
  options: { y?: number; x?: number; duration?: number; delay?: number; rotate?: number } = {}
): gsap.core.Tween {
  return gsap.to(el, {
    y: options.y ?? -10,
    x: options.x ?? 0,
    rotate: options.rotate ?? 2,
    duration: options.duration ?? 3.4,
    delay: options.delay ?? 0,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });
}

export function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    gsap.delayedCall(seconds, resolve);
  });
}
