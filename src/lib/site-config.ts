import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { SiteConfig, Theme } from "./types";

const configPath = path.resolve(process.cwd(), "config.yaml");

const parsed = yaml.load(fs.readFileSync(configPath, "utf8")) as SiteConfig;

if (!parsed || !parsed.themes || !parsed.questions) {
  throw new Error("config.yaml is missing themes or questions.");
}

export const siteConfig: SiteConfig = parsed;

export function themeOrFallback(id: string | undefined): Theme {
  if (id && parsed.themes[id]) return parsed.themes[id];
  const first = Object.values(parsed.themes)[0];
  return first;
}
