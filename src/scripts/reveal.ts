import { gsap } from "gsap";
import type { Theme } from "../lib/types";

function familyName(value: string): string {
  return value.split(",")[0].replace(/["']/g, "").trim();
}

function timer(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Gate every first reveal on the fonts the scene actually uses. This prevents
 * the fallback-font paint, then web-font repaint, from colliding with GSAP.
 */
export async function waitForFonts(theme?: Theme, timeout = 1800): Promise<void> {
  if (!("fonts" in document)) return;
  const jobs: Promise<unknown>[] = [document.fonts.ready];
  if (theme) {
    const families: Array<[string, number]> = [
      [theme.type.display, theme.type.display_weight],
      [theme.type.hand, theme.type.hand_weight],
      [theme.type.body, theme.type.body_weight],
    ];
    for (const [value, weight] of families) {
      const name = familyName(value);
      if (!name) continue;
      jobs.push(document.fonts.load(`${weight} 1em "${name}"`));
      jobs.push(document.fonts.load(`1em "${name}"`));
    }
  }
  await Promise.race([Promise.all(jobs), timer(timeout)]);
}


/** Warm the theme fonts while the settings panel is open, before a switch. */
export function preloadThemeFonts(themes: Theme[]): void {
  if (!("fonts" in document)) return;
  const seen = new Set<string>();
  for (const theme of themes) {
    const families: Array<[string, number]> = [
      [theme.type.display, theme.type.display_weight],
      [theme.type.hand, theme.type.hand_weight],
      [theme.type.body, theme.type.body_weight],
    ];
    for (const [value, weight] of families) {
      const name = familyName(value);
      if (!name || seen.has(`${name}:${weight}`)) continue;
      seen.add(`${name}:${weight}`);
      try {
        void document.fonts.load(`${weight} 1em "${name}"`).catch(() => undefined);
        void document.fonts.load(`1em "${name}"`).catch(() => undefined);
      } catch {
        // A malformed local font name must never block the panel.
      }
    }
  }
}

/**
 * Single reveal helper for text outside the main question timeline.
 * Elements are already hidden by `.will-reveal` in CSS.
 */
export async function revealText(
  elements: Element[],
  options: { y?: number; duration?: number; stagger?: number; ease?: string; theme?: Theme; reduced?: boolean } = {}
): Promise<gsap.core.Timeline> {
  await waitForFonts(options.theme);
  const nodes = elements.filter(Boolean);
  const timeline = gsap.timeline();
  if (!nodes.length) return timeline;
  gsap.set(nodes, { visibility: "visible", opacity: 0 });
  if (options.reduced) {
    timeline.to(nodes, { opacity: 1, duration: 0.2, stagger: 0.01 });
    return timeline;
  }
  timeline.fromTo(
    nodes,
    { opacity: 0, y: options.y ?? 12 },
    {
      opacity: 1,
      y: 0,
      duration: options.duration ?? 0.55,
      stagger: options.stagger ?? 0.035,
      ease: options.ease ?? "power3.out",
    }
  );
  return timeline;
}
