import { gsap } from "gsap";
import type { Theme } from "../lib/types";
import {
  EASE,
  blinkEyes,
  notePaperEntrance,
  prepareNoteLines,
  prepareNoteWords,
  revealNoteLines,
  revealNoteWords,
  wait,
} from "./animations";

export interface EndingContext {
  root: HTMLElement;
  note: string;
  signature: string;
  reduced: boolean;
  theme: Theme;
}

type EndingPlayer = (ctx: EndingContext) => Promise<void>;

function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function fillNote(ctx: EndingContext, mode: "words" | "lines" = "words") {
  const paper = qs(ctx.root, "[data-note-paper]");
  const text = qs(ctx.root, "[data-note-text]");
  const sign = qs(ctx.root, "[data-note-sign]");
  if (!paper || !text || !sign) return null;
  text.textContent = ctx.note;
  sign.textContent = ctx.signature;
  const prepared = mode === "lines" ? prepareNoteLines(text, ctx.note, 30) : prepareNoteWords(text, ctx.note);
  gsap.set(paper, { autoAlpha: 0 });
  gsap.set(sign, { autoAlpha: 0 });
  return { paper, text, sign, prepared };
}

function revealSign(sign: HTMLElement, delay: number, reduced: boolean): void {
  gsap.to(sign, {
    autoAlpha: 1,
    duration: reduced ? 0.3 : 0.7,
    delay,
    ease: EASE.hush,
  });
}

function setEyes(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-eye]").forEach((eye) => {
    gsap.set(eye, { transformOrigin: "50% 50%" });
  });
}

function finish(total: number): Promise<void> {
  return wait(total);
}

const playKitten: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const kitten = qs(ctx.root, "[data-kitten]");
  const head = qs(ctx.root, "[data-head]");
  const glow = qs(ctx.root, "[data-glow]");
  const beam = qs(ctx.root, "[data-beam]");
  if (!note || !kitten) return;

  setEyes(ctx.root);
  const reduced = ctx.reduced;

  gsap.set(kitten, { x: reduced ? 0 : -Math.min(window.innerWidth * 0.6, 520), y: 16, opacity: 0 });
  gsap.set([glow, beam], { autoAlpha: 0 });

  if (reduced) {
    gsap.to(kitten, { opacity: 1, duration: 0.4 });
  } else {
    gsap
      .timeline()
      .to(kitten, {
        x: 0,
        y: 0,
        opacity: 1,
        duration: 2.1,
        ease: EASE.hush,
      })
      .to(kitten, { y: -5, duration: 0.28, repeat: 3, yoyo: true, ease: "sine.inOut" }, 0.2)
      .to(kitten, { scaleY: 0.94, scaleX: 1.02, duration: 0.5, ease: EASE.pillow }, 2.1);
  }

  if (head) {
    gsap.to(head, { rotation: -8, y: -4, duration: 0.9, delay: reduced ? 0.2 : 2.3, ease: EASE.pillow });
  }

  gsap.to(glow, { autoAlpha: 1, duration: 1.6, delay: reduced ? 0.1 : 2, ease: EASE.hush });
  gsap.to(beam, { autoAlpha: 0.5, duration: 1.8, delay: reduced ? 0.1 : 2.3, ease: EASE.hush });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 2.1 });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.05 });
  revealSign(note.sign, reduced ? 0.5 : 1.4, reduced);
  await finish(reduced ? 1.6 : 5.6);
};

const playClouds: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const left = qs(ctx.root, "[data-cloud-left]");
  const right = qs(ctx.root, "[data-cloud-right]");
  const low = qs(ctx.root, "[data-cloud-low]");
  const beam = qs(ctx.root, "[data-beam]");
  const glow = qs(ctx.root, "[data-glow]");
  const cat = qs(ctx.root, "[data-cat]");
  const head = qs(ctx.root, "[data-head]");
  const flowers = Array.from(ctx.root.querySelectorAll<HTMLElement>("[data-flower]"));
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set([beam, glow], { autoAlpha: 0 });
  gsap.set(flowers, { scale: 0, opacity: 0, transformOrigin: "50% 100%" });
  if (cat) gsap.set(cat, { opacity: 0.85 });

  if (reduced) {
    gsap.set([left, right], { autoAlpha: 0 });
    gsap.set(low, { autoAlpha: 0 });
    gsap.to([beam, glow], { autoAlpha: 1, duration: 0.5 });
    gsap.set(flowers, { scale: 1, opacity: 1 });
  } else {
    gsap.to(cat, { scaleY: 1.08, scaleX: 0.96, duration: 0.8, delay: 0.2, yoyo: true, repeat: 1, ease: EASE.hush });
    gsap.to(head, { rotation: 7, y: 2, duration: 0.7, delay: 0.4, yoyo: true, repeat: 1, ease: EASE.pillow });
    gsap
      .timeline({ delay: 1.2 })
      .to(left, { x: -Math.min(window.innerWidth * 0.7, 620), autoAlpha: 0, duration: 2.2, ease: EASE.hush })
      .to(right, { x: Math.min(window.innerWidth * 0.7, 620), autoAlpha: 0, duration: 2.2, ease: EASE.hush }, 0)
      .to(low, { autoAlpha: 0, duration: 1.4 }, 0.4)
      .to(beam, { autoAlpha: 0.7, duration: 2 }, 0.9)
      .to(glow, { autoAlpha: 1, duration: 2 }, 1.1)
      .to(
        flowers,
        { scale: 1, opacity: 1, duration: 1.1, stagger: 0.13, ease: EASE.pillow },
        1.4
      );
  }

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 2.6 });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.25, reduced, stagger: 0.045 });
  revealSign(note.sign, reduced ? 0.4 : 1.3, reduced);
  await finish(reduced ? 1.5 : 6);
};

const playPuppy: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const dog = qs(ctx.root, "[data-dog]");
  const envelope = qs(ctx.root, "[data-envelope]");
  const head = qs(ctx.root, "[data-head]");
  const glow = qs(ctx.root, "[data-glow]");
  const hearts = Array.from(ctx.root.querySelectorAll<HTMLElement>("[data-heart]"));
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.set(hearts, { y: 0, opacity: 0 });
  gsap.set(hearts, { opacity: 0 });
  hearts.forEach((heart, index) => {
    gsap.set(heart, {
      left: `${20 + index * 13}%`,
      bottom: "16%",
      scale: 0.6 + (index % 3) * 0.2,
    });
  });

  if (dog) {
    gsap.set(dog, { x: reduced ? 0 : -Math.min(window.innerWidth * 0.5, 500), opacity: 0 });
    gsap.to(dog, {
      x: 0,
      opacity: 1,
      duration: reduced ? 0.3 : 1.5,
      ease: EASE.hush,
    });
  }
  if (envelope) {
    gsap.set(envelope, { x: reduced ? 0 : -Math.min(window.innerWidth * 0.3, 320), y: -10, opacity: 0, scale: 0.9 });
    gsap.to(envelope, {
      x: 0,
      opacity: 1,
      duration: reduced ? 0.3 : 1.6,
      delay: reduced ? 0 : 0.35,
      ease: EASE.hush,
    });
  }

  await wait(reduced ? 0.4 : 1.8);

  if (!reduced) {
    gsap.to(envelope, { y: 12, rotation: 4, duration: 0.5, ease: "power2.in" });
    gsap.to(envelope, { y: 0, rotation: 0, duration: 0.5, ease: EASE.pillow });
    gsap.to(envelope, { "--flap": "180deg", duration: 0.8, delay: 0.4, ease: EASE.pillow });
  } else {
    gsap.set(envelope, { "--flap": "180deg" });
  }

  gsap.to(glow, { autoAlpha: 1, duration: 1.4, delay: reduced ? 0.1 : 1.4 });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.5, fromScale: 0.5 });

  hearts.forEach((heart, index) => {
    gsap
      .timeline({ delay: reduced ? 0.1 : 1.7 + index * 0.12 })
      .to(heart, { opacity: 0.9, duration: 0.4 })
      .to(
        heart,
        {
          y: reduced ? -20 : -220 - index * 14,
          x: (index - 2) * 16,
          rotation: index % 2 === 0 ? -12 : 12,
          opacity: 0,
          duration: reduced ? 0.8 : 3.4,
          ease: "sine.inOut",
        },
        0.1
      );
  });

  if (head) gsap.to(head, { rotation: -6, duration: 0.8, delay: reduced ? 0.2 : 2.1, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.04 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.5 : 5.8);
};

const playShopping: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const cat = qs(ctx.root, "[data-cat]");
  const bag = qs(ctx.root, "[data-bag]");
  const head = qs(ctx.root, "[data-head]");
  const glow = qs(ctx.root, "[data-glow]");
  const coins = Array.from(ctx.root.querySelectorAll<HTMLElement>("[data-coin]"));
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.set(note.paper, { autoAlpha: 0, y: 120 });
  coins.forEach((coin, index) => {
    gsap.set(coin, {
      left: `${22 + index * 4}%`,
      bottom: "22%",
      opacity: 0,
      scale: 0.8 + (index % 3) * 0.15,
    });
  });

  if (!reduced) {
    gsap.to(cat, { rotation: -10, x: -8, duration: 0.35, delay: 0.3, ease: EASE.lift });
    gsap.to(cat, { rotation: 0, x: 0, duration: 0.6, delay: 0.7, ease: EASE.pillow });
    gsap.to(bag, { rotation: -18, x: -12, duration: 0.35, delay: 0.32, ease: EASE.lift });
    gsap.to(bag, {
      x: Math.min(window.innerWidth * 0.5, 420),
      rotation: -34,
      duration: 1.5,
      delay: 0.7,
      ease: EASE.hush,
    });
  }

  coins.forEach((coin, index) => {
    if (reduced) {
      gsap.set(coin, { opacity: 1 });
      return;
    }
    const spread = (index - 2.5) * (window.innerWidth * 0.09);
    gsap
      .timeline({ delay: 0.9 + index * 0.1 })
      .to(coin, { opacity: 1, duration: 0.15 })
      .to(
        coin,
        {
          x: spread,
          y: -160 - (index % 3) * 46,
          rotation: 180 + index * 40,
          duration: 0.85,
          ease: "power2.out",
        },
        0
      )
      .to(coin, {
        y: 0,
        x: spread * 1.25,
        rotation: 300 + index * 30,
        duration: 1.5,
        ease: "bounce.out",
      })
      .to(coin, { opacity: 0.85, duration: 0.4 }, "-=0.8");
  });

  gsap.to(glow, { autoAlpha: 1, duration: 1.6, delay: 0.6, ease: EASE.hush });

  await wait(reduced ? 0.3 : 1.4);
  await notePaperEntrance(note.paper, reduced, { delay: 0.1 });

  if (head) gsap.to(head, { rotation: 6, duration: 0.7, delay: reduced ? 0.1 : 0.8, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 1);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.045 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.4 : 5.4);
};

const playPiggy: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const pig = qs(ctx.root, "[data-pig]");
  const head = qs(ctx.root, "[data-head]");
  const coin = qs(ctx.root, "[data-drop-coin]");
  const flower = qs(ctx.root, "[data-flower]");
  const glow = qs(ctx.root, "[data-glow]");
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.set(flower, { scale: 0, opacity: 0, transformOrigin: "50% 100%" });
  if (coin) gsap.set(coin, { y: reduced ? 0 : -190, opacity: reduced ? 1 : 0 });

  if (!reduced && coin) {
    gsap
      .timeline()
      .to(coin, { opacity: 1, duration: 0.2 })
      .to(coin, { y: 0, duration: 0.8, ease: "power2.in" })
      .to(pig, { rotation: -2, scaleX: 1.04, duration: 0.16, yoyo: true, repeat: 1, ease: EASE.pillow }, "-=0.1")
      .to(coin, { opacity: 0, duration: 0.2 }, "-=0.05");
  }

  if (!reduced && pig) {
    gsap
      .timeline({ delay: 1 })
      .to(pig, { rotation: -3, x: -3, duration: 0.18, ease: EASE.lift })
      .to(pig, { rotation: 3, x: 3, duration: 0.22, ease: "power1.inOut" })
      .to(pig, { rotation: 0, x: 0, duration: 0.6, ease: EASE.pillow });
  }

  gsap.to(glow, { autoAlpha: 1, duration: 1.6, delay: reduced ? 0.1 : 1.2, ease: EASE.hush });
  gsap.to(flower, {
    scale: 1,
    opacity: 1,
    duration: reduced ? 0.4 : 1.5,
    delay: reduced ? 0.1 : 1.5,
    ease: EASE.pillow,
  });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.9 });
  if (head) gsap.to(head, { rotation: -5, duration: 0.8, delay: reduced ? 0.1 : 0.8, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.045 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.4 : 5.4);
};

const playYarn: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx, "lines");
  const yarn = qs(ctx.root, "[data-yarn]");
  const thread = qs(ctx.root, "[data-yarn-thread]");
  const cat = qs(ctx.root, "[data-cat]");
  const head = qs(ctx.root, "[data-head]");
  const blanket = qs(ctx.root, "[data-blanket]");
  const glow = qs(ctx.root, "[data-glow]");
  const paths = Array.from(ctx.root.querySelectorAll<SVGPathElement>(".weave-path"));
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.set(blanket, { yPercent: 102 });

  paths.forEach((path) => {
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.9 });
  });

  if (!reduced) {
    gsap.to(yarn, { rotation: -18, y: -8, duration: 1.2, ease: EASE.hush });
    gsap.to(yarn, { rotation: 0, y: 0, duration: 1.4, delay: 1.2, ease: EASE.pillow });
    if (thread) {
      gsap.set(thread, { opacity: 0 });
      gsap.to(thread, { opacity: 0.8, duration: 0.5, delay: 0.6 });
    }
  }

  paths.forEach((path, index) => {
    if (reduced) {
      gsap.set(path, { strokeDashoffset: 0 });
      return;
    }
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 1.3,
      delay: 0.5 + index * 0.35,
      ease: "power1.inOut",
    });
  });

  gsap.to(glow, { autoAlpha: 1, duration: 1.8, delay: reduced ? 0.1 : 1.2, ease: EASE.hush });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.4 });
  if (note.prepared.length) {
    revealNoteLines(note.prepared as HTMLElement[], {
      delay: 0.15,
      reduced,
      stagger: 0.24,
    });
  }

  if (!reduced) {
    gsap.to(blanket, { yPercent: 0, duration: 1.4, delay: 1.6, ease: EASE.hush });
  } else {
    gsap.set(blanket, { yPercent: 0 });
  }
  if (cat) gsap.to(cat, { y: -4, duration: 0.8, delay: reduced ? 0.1 : 1.5, yoyo: true, repeat: 1, ease: "sine.inOut" });
  if (head) gsap.to(head, { rotation: 9, duration: 1.1, delay: reduced ? 0.1 : 1.9, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealSign(note.sign, reduced ? 0.4 : 1.8, reduced);
  await finish(reduced ? 1.5 : 6.2);
};

const playChaos: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const cat = qs(ctx.root, "[data-cat]");
  const dog = qs(ctx.root, "[data-dog]");
  const catHead = cat ? qs(cat, "[data-head]") : null;
  const dogHead = dog ? qs(dog, "[data-head]") : null;
  const knick = qs(ctx.root, "[data-knick]");
  const shelf = qs(ctx.root, "[data-shelf]");
  const glow = qs(ctx.root, "[data-glow]");
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.to(shelf, { autoAlpha: 0, duration: reduced ? 0.2 : 0.9, delay: reduced ? 0.1 : 1.5, ease: EASE.hush });

  if (!reduced) {
    gsap.to(cat, { x: 12, y: -18, duration: 0.3, delay: 0.35, ease: "power2.out" });
    gsap.to(cat, { x: 0, y: 0, duration: 0.6, delay: 0.65, ease: EASE.pillow });
    if (knick) {
      gsap.set(knick, { transformOrigin: "50% 100%" });
      gsap.to(knick, {
        x: 110,
        y: 220,
        rotation: 320,
        duration: 1.1,
        delay: 0.5,
        ease: "power2.in",
      });
    }
    gsap.to(dog, { x: -40, y: -16, duration: 0.6, delay: 1.1, ease: EASE.hush });
    gsap.to(dog, { x: 0, y: 0, duration: 0.7, delay: 1.7, ease: EASE.pillow });
    if (knick) {
      gsap.to(knick, { x: 70, y: 40, opacity: 0, scale: 0.4, duration: 0.3, delay: 1.3, ease: EASE.pillow });
    }
    gsap.to([cat, dog], {
      scale: 1.06,
      rotation: 0,
      duration: 0.7,
      delay: 2,
      ease: EASE.pillow,
    });
  }

  gsap.to(glow, { autoAlpha: 1, duration: 1.6, delay: reduced ? 0.1 : 1.8, ease: EASE.hush });
  if (catHead) gsap.to(catHead, { rotation: -7, duration: 0.7, delay: reduced ? 0.1 : 2.1, ease: EASE.pillow });
  if (dogHead) gsap.to(dogHead, { rotation: 7, duration: 0.7, delay: reduced ? 0.1 : 2.1, ease: EASE.pillow });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 2.2 });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.05 });
  revealSign(note.sign, reduced ? 0.4 : 1.3, reduced);
  await finish(reduced ? 1.5 : 5.8);
};

const players: Record<string, EndingPlayer> = {
  kitten_apology: playKitten,
  clouds_part_bloom: playClouds,
  puppy_envelope: playPuppy,
  cat_shopping_bag: playShopping,
  piggy_bank_bloom: playPiggy,
  yarn_weave_note: playYarn,
  cat_dog_chaos: playChaos,
};

export async function playEnding(name: string, ctx: EndingContext): Promise<void> {
  const player = players[name] ?? players.cat_dog_chaos;
  gsap.killTweensOf(ctx.root.querySelectorAll("*"));
  await player(ctx);
}

export function hasEnding(name: string): boolean {
  return Boolean(players[name]);
}
