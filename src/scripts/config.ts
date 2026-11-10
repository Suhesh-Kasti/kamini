import type { SiteConfig, Theme } from "../lib/types";

declare global {
  interface Window {
    POCKET_MOOD_CONFIG?: SiteConfig;
  }
}

let cached: SiteConfig | null = null;

/**
 * Build time by default. The config arrives as JSON in the page, which means
 * a later runtime swap only needs a JSON URL instead of the embedded tag.
 * The rest of the app never reads config.yaml directly.
 */
export function getConfig(): SiteConfig {
  if (cached) return cached;
  if (window.POCKET_MOOD_CONFIG) {
    cached = window.POCKET_MOOD_CONFIG;
    return cached;
  }
  const tag = document.getElementById("pocket-mood-config");
  if (!tag?.textContent) throw new Error("Pocket Mood config is missing from the page.");
  cached = JSON.parse(tag.textContent) as SiteConfig;
  return cached;
}

/**
 * Runtime ready. Pass a URL to a JSON config produced from config.yaml and
 * the experience will boot from it instead. No other refactor needed.
 */
export async function loadConfig(url?: string): Promise<SiteConfig> {
  if (!url) return getConfig();
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Could not load runtime config.");
  cached = (await response.json()) as SiteConfig;
  return cached;
}

export function themeFor(config: SiteConfig, id: string | undefined): Theme {
  if (id && config.themes[id]) return config.themes[id];
  return Object.values(config.themes)[0];
}
