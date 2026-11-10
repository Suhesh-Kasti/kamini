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

function qsa<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function fillNote(ctx: EndingContext, mode: "words" | "lines" = "words") {
  const paper = qs(ctx.root, "[data-note-paper]");
  const text = qs(ctx.root, "[data-note-text]");
  const sign = qs(ctx.root, "[data-note-sign]");
  if (!paper || !text || !sign) return null;
  text.textContent = ctx.note;
  sign.textContent = ctx.signature;
  const prepared =
    mode === "lines" ? prepareNoteLines(text, ctx.note, 30) : prepareNoteWords(text, ctx.note);
  gsap.set(paper, { autoAlpha: 0 });
  gsap.set(sign, { autoAlpha: 0 });
  return { paper, text, sign, prepared };
}

function revealSign(sign: HTMLElement, delay: number, reduced: boolean): void {
  gsap.to(sign, {
    autoAlpha: 1,
    duration: reduced ? 0.3 : 0.65,
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
  const claws = qs(ctx.root, ".ending-claws");
  const coffee = qs(ctx.root, ".ending-coffee");
  if (!note || !kitten) return;
  setEyes(ctx.root);
  const reduced = ctx.reduced;

  gsap.set(kitten, { x: reduced ? 0 : -Math.min(window.innerWidth * 0.6, 520), y: 14, opacity: 0 });
  gsap.set([glow, claws], { autoAlpha: 0 });
  gsap.set(coffee, { autoAlpha: 0 });

  if (reduced) {
    gsap.to(kitten, { opacity: 1, duration: 0.35 });
    gsap.to([glow, claws, coffee], { autoAlpha: 1, duration: 0.4 });
  } else {
    gsap
      .timeline()
      .to(kitten, { x: 0, y: 0, opacity: 1, duration: 1.9, ease: EASE.hush })
      .to(kitten, { y: -5, duration: 0.26, repeat: 3, yoyo: true, ease: "sine.inOut" }, 0.2)
      .to(kitten, { scaleY: 0.94, scaleX: 1.02, duration: 0.5, ease: EASE.pillow }, 1.95)
      .to(glow, { autoAlpha: 1, duration: 1.5, ease: EASE.hush }, 1.5)
      .to(claws, { autoAlpha: 0.55, duration: 0.5, ease: EASE.snap }, 0.9)
      .to(coffee, { autoAlpha: 1, duration: 1, ease: EASE.hush }, 1.2);
  }

  if (head) gsap.to(head, { rotation: -8, y: -4, duration: 0.9, delay: reduced ? 0.2 : 2.1, ease: EASE.pillow });
  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.9 });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.045 });
  revealSign(note.sign, reduced ? 0.4 : 1.3, reduced);
  await finish(reduced ? 1.1 : 3.0);
};

const playSad: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const left = qs(ctx.root, "[data-cloud-left]");
  const right = qs(ctx.root, "[data-cloud-right]");
  const low = qs(ctx.root, "[data-cloud-low]");
  const beam = qs(ctx.root, "[data-beam]");
  const glow = qs(ctx.root, "[data-glow]");
  const cat = qs(ctx.root, "[data-cat]");
  const head = qs(ctx.root, "[data-head]");
  const flowers = qsa(ctx.root, "[data-flower]");
  const rain = qsa(ctx.root, "[data-ending-rain] i");
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set([beam, glow], { autoAlpha: 0 });
  gsap.set(flowers, { scale: 0, opacity: 0, transformOrigin: "50% 100%" });
  gsap.set(rain, { y: -16, opacity: 0 });
  if (cat) gsap.set(cat, { opacity: 0.86 });

  if (reduced) {
    gsap.set([left, right, low], { autoAlpha: 0 });
    gsap.to([beam, glow], { autoAlpha: 1, duration: 0.5 });
    gsap.set(flowers, { scale: 1, opacity: 1 });
    gsap.set(rain, { opacity: 0.2 });
  } else {
    gsap.to(rain, { opacity: 0.5, y: 0, duration: 0.9, stagger: 0.08, ease: EASE.hush });
    gsap.to(cat, { scaleY: 1.08, scaleX: 0.96, duration: 0.8, delay: 0.2, yoyo: true, repeat: 1, ease: EASE.hush });
    gsap.to(head, { rotation: 7, y: 2, duration: 0.7, delay: 0.4, yoyo: true, repeat: 1, ease: EASE.pillow });
    gsap
      .timeline({ delay: 1.1 })
      .to(left, { x: -Math.min(window.innerWidth * 0.72, 620), autoAlpha: 0, duration: 2.2, ease: EASE.hush })
      .to(right, { x: Math.min(window.innerWidth * 0.72, 620), autoAlpha: 0, duration: 2.2, ease: EASE.hush }, 0)
      .to(low, { autoAlpha: 0.1, duration: 1.6 }, 0.4)
      .to(beam, { autoAlpha: 0.72, duration: 2 }, 0.9)
      .to(glow, { autoAlpha: 1, duration: 2 }, 1.1)
      .to(rain, { opacity: 0, y: 14, duration: 1.4, stagger: 0.06, ease: EASE.hush }, 1.8)
      .to(flowers, { scale: 1, opacity: 1, duration: 1.1, stagger: 0.12, ease: EASE.pillow }, 1.35);
  }

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 2.4 });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.04 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.1 : 3.0);
};

const playSweet: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const bar = qs(ctx.root, "[data-choco-bar]");
  const left = qs(ctx.root, "[data-choco-left]");
  const right = qs(ctx.root, "[data-choco-right]");
  const foil = qs(ctx.root, "[data-foil]");
  const gleam = qs(ctx.root, "[data-gleam]");
  const glow = qs(ctx.root, "[data-glow]");
  const caption = qs(ctx.root, "[data-choco-caption]");
  const dust = qsa(ctx.root, ".choco-dust i");
  if (!note || !bar) return;
  const reduced = ctx.reduced;

  gsap.set(bar, { y: reduced ? 0 : 70, scale: reduced ? 1 : 0.86, opacity: 0 });
  gsap.set([glow, caption], { autoAlpha: 0 });
  gsap.set(dust, { opacity: 0, y: 0 });
  gsap.set(foil, { scaleY: 1, transformOrigin: "50% 100%" });

  if (reduced) {
    gsap.to(bar, { opacity: 1, duration: 0.35 });
    gsap.to([glow, caption], { autoAlpha: 1, duration: 0.4 });
  } else {
    gsap
      .timeline()
      .to(bar, { y: 0, scale: 1, opacity: 1, duration: 1.1, ease: EASE.pillow })
      .to(gleam, { opacity: 0.85, duration: 0.5, ease: EASE.snap }, 0.7)
      .to(gleam, { opacity: 0, duration: 0.6, ease: EASE.hush }, 1.2)
      .to(glow, { autoAlpha: 1, duration: 1.1, ease: EASE.hush }, 0.9)
      .to(foil, { scaleY: 0.1, y: -50, rotation: 8, opacity: 0, duration: 0.8, ease: EASE.snap }, 1.5)
      .to(left, { x: -70, rotation: -10, y: 24, duration: 1.1, ease: EASE.pillow }, 1.7)
      .to(right, { x: 70, rotation: 10, y: 24, duration: 1.1, ease: EASE.pillow }, 1.7)
      .to(bar, { opacity: 0.15, duration: 0.8 }, 2.2)
      .to(caption, { autoAlpha: 1, duration: 0.8, ease: EASE.hush }, 2.2)
      .to(dust, { opacity: 0.7, y: -40, duration: 1.3, stagger: 0.04, ease: EASE.hush }, 1.9);
  }

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.9, fromScale: 0.7 });
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.04 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.1 : 3.0);
};

const playShopping: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const panelLeft = qs(ctx.root, "[data-mag-left]");
  const panelRight = qs(ctx.root, "[data-mag-right]");
  const cover = qs(ctx.root, "[data-mag-cover]");
  const gleam = qs(ctx.root, "[data-gleam]");
  const caption = qs(ctx.root, "[data-mag-caption]");
  if (!note || !cover) return;
  const reduced = ctx.reduced;

  gsap.set([panelLeft, panelRight], { scaleX: 0, autoAlpha: 0 });
  gsap.set(cover, { y: reduced ? 0 : 40, opacity: 0, scale: reduced ? 1 : 0.9 });
  gsap.set(caption, { autoAlpha: 0 });

  if (reduced) {
    gsap.set([panelLeft, panelRight], { scaleX: 1, autoAlpha: 1 });
    gsap.to(cover, { opacity: 1, duration: 0.35 });
  } else {
    gsap
      .timeline()
      .to([panelLeft, panelRight], { scaleX: 1, autoAlpha: 1, duration: 0.9, ease: EASE.hush })
      .to(cover, { y: 0, opacity: 1, scale: 1, duration: 1, ease: EASE.pillow }, 0.3)
      .to(gleam, { opacity: 0.75, duration: 0.5 }, 1.1)
      .to(gleam, { opacity: 0, duration: 0.7 }, 1.6)
      .to(cover, { y: -110, opacity: 0, scale: 0.94, duration: 1.1, ease: EASE.hush }, 2.2)
      .to(caption, { autoAlpha: 1, duration: 0.8 }, 2.8);
  }

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 2.6 });
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.04 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.1 : 3.0);
};

const playSaving: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const pig = qs(ctx.root, "[data-pig]");
  const head = qs(ctx.root, "[data-head]");
  const coin = qs(ctx.root, "[data-drop-coin]");
  const spark = qs(ctx.root, "[data-coin-spark]");
  const flower = qs(ctx.root, "[data-flower]");
  const glow = qs(ctx.root, "[data-glow]");
  const tick = qs(ctx.root, "[data-counter-tick]");
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set([glow, tick], { autoAlpha: 0 });
  gsap.set(flower, { scale: 0, opacity: 0, transformOrigin: "50% 100%" });
  if (coin) gsap.set(coin, { y: reduced ? 0 : -200, opacity: reduced ? 1 : 0 });
  if (spark) gsap.set(spark, { scale: 0.2, opacity: 0 });

  if (!reduced && coin) {
    gsap
      .timeline()
      .to(coin, { opacity: 1, duration: 0.2 })
      .to(coin, { y: 0, duration: 0.75, ease: "power2.in" })
      .to(pig, { rotation: -2, scaleX: 1.04, duration: 0.15, yoyo: true, repeat: 1, ease: EASE.pillow }, "-=0.1")
      .to(coin, { opacity: 0, duration: 0.2 }, "-=0.05")
      .to(spark, { scale: 1.7, opacity: 0.8, duration: 0.3, ease: EASE.snap }, 0.8)
      .to(spark, { scale: 2.4, opacity: 0, duration: 0.5, ease: EASE.hush }, 1.05)
      .to(tick, { autoAlpha: 1, duration: 0.4 }, 0.95)
      .to(tick, { autoAlpha: 0, duration: 0.6 }, 2.4);
  }

  gsap.to(glow, { autoAlpha: 1, duration: 1.4, delay: reduced ? 0.1 : 1.1, ease: EASE.hush });
  gsap.to(flower, { scale: 1, opacity: 1, duration: reduced ? 0.4 : 1.4, delay: reduced ? 0.1 : 1.4, ease: EASE.pillow });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.8 });
  if (head) gsap.to(head, { rotation: -5, duration: 0.8, delay: reduced ? 0.1 : 0.7, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.04 });
  revealSign(note.sign, reduced ? 0.4 : 1.1, reduced);
  await finish(reduced ? 1.1 : 3.2);
};

const playYarn: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx, "lines");
  const yarn = qs(ctx.root, "[data-yarn]");
  const thread = qs(ctx.root, "[data-yarn-thread]");
  const cat = qs(ctx.root, "[data-cat]");
  const head = qs(ctx.root, "[data-head]");
  const blanket = qs(ctx.root, "[data-blanket]");
  const glow = qs(ctx.root, "[data-glow]");
  const stitch = qs(ctx.root, "[data-stitch-finish]");
  const paths = qsa<SVGPathElement>(ctx.root, ".weave-path");
  if (!note) return;
  const reduced = ctx.reduced;

  setEyes(ctx.root);
  gsap.set(glow, { autoAlpha: 0 });
  gsap.set(blanket, { yPercent: 102 });
  gsap.set(stitch, { autoAlpha: 0 });

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
    gsap.to(path, { strokeDashoffset: 0, duration: 1.3, delay: 0.5 + index * 0.34, ease: "power1.inOut" });
  });

  gsap.to(glow, { autoAlpha: 1, duration: 1.8, delay: reduced ? 0.1 : 1.1, ease: EASE.hush });

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.4 });
  if (note.prepared.length) {
    revealNoteLines(note.prepared as HTMLElement[], { delay: 0.15, reduced, stagger: 0.22 });
  }

  if (!reduced) {
    gsap.to(blanket, { yPercent: 0, duration: 1.4, delay: 1.5, ease: EASE.hush });
    gsap.to(stitch, { autoAlpha: 1, duration: 0.6, delay: 3.2 });
  } else {
    gsap.set(blanket, { yPercent: 0 });
    gsap.set(stitch, { autoAlpha: 1 });
  }
  if (cat) gsap.to(cat, { y: -4, duration: 0.8, delay: reduced ? 0.1 : 1.4, yoyo: true, repeat: 1, ease: "sine.inOut" });
  if (head) gsap.to(head, { rotation: 9, duration: 1.1, delay: reduced ? 0.1 : 1.8, ease: EASE.pillow });
  blinkEyes(ctx.root.querySelectorAll("[data-eye]"), 2);
  revealSign(note.sign, reduced ? 0.4 : 1.7, reduced);
  await finish(reduced ? 1.1 : 3.6);
};

const playFun: EndingPlayer = async (ctx) => {
  const note = fillNote(ctx);
  const scrap = qs(ctx.root, "[data-scrap-page]");
  if (!note) return;
  const reduced = ctx.reduced;

  gsap.set(scrap, { autoAlpha: 0, rotate: -4, scale: 0.96 });
  if (reduced) {
    gsap.to(scrap, { autoAlpha: 1, rotate: -1.4, scale: 1, duration: 0.35 });
  } else {
    gsap.to(scrap, { autoAlpha: 1, rotate: -1.4, scale: 1, duration: 1, ease: EASE.pillow });
  }

  await notePaperEntrance(note.paper, reduced, { delay: reduced ? 0.1 : 1.2 });
  revealNoteWords(note.text, { delay: 0.2, reduced, stagger: 0.045 });
  revealSign(note.sign, reduced ? 0.4 : 1.2, reduced);
  await finish(reduced ? 1.1 : 3.2);
};

const players: Record<string, EndingPlayer> = {
  kitten_apology: playKitten,
  clouds_part_bloom: playSad,
  chocolate_snap: playSweet,
  magazine_reveal: playShopping,
  piggy_bank_bloom: playSaving,
  yarn_weave_note: playYarn,
  sticker_drop: playFun,
};

export async function playEnding(name: string, ctx: EndingContext): Promise<void> {
  const player = players[name] ?? players.sticker_drop;
  await player(ctx);
}

export function hasEnding(name: string): boolean {
  return Boolean(players[name]);
}
