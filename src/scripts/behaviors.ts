import { gsap } from "gsap";
import type { BehaviorResult, Question, QuestionButton } from "../lib/types";
import { EASE, pulse } from "./animations";

export type BehaviorPhase = "hover" | "tap" | "click";

export interface BehaviorContext {
  btn: HTMLButtonElement;
  def: QuestionButton;
  buttons: HTMLButtonElement[];
  question: Question;
  reduced: boolean;
  phase: BehaviorPhase;
  whisper: (text: string) => void;
}

/**
 * The personality system owns wrong buttons. Only the correct-button growth
 * beat remains here.
 */
export async function runBehavior(
  name: string | undefined,
  ctx: BehaviorContext
): Promise<BehaviorResult> {
  if (name !== "grow") return "pass";
  if (ctx.phase === "hover") {
    await new Promise<void>((resolve) => {
      gsap.to(ctx.btn, { scale: 1.1, duration: 0.35, ease: EASE.lift, onComplete: resolve });
    });
  } else {
    await pulse(ctx.btn, ctx.reduced);
  }
  return "pass";
}

export function resetHover(btn: HTMLButtonElement): void {
  if (btn.dataset.state === "asleep" || btn.dataset.state === "gone" || btn.dataset.state === "escaping") {
    return;
  }
  btn.classList.remove("answer--glow");
  gsap.to(btn, { scale: 1, duration: 0.42, ease: EASE.pillow, overwrite: "auto" });
}
