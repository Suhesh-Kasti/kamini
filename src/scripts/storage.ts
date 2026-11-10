export interface LocalPrefs {
  theme?: string;
  volume?: number;
  muted?: boolean;
  reducedMotion?: boolean;
  installDismissed?: boolean;
  lastEndingTheme?: string;
}

const KEY = "pocket-mood.prefs.v1";

export function readPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LocalPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writePrefs(prefs: LocalPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // A private window can refuse storage. The experience keeps working.
  }
}

export function patchPrefs(patch: Partial<LocalPrefs>): LocalPrefs {
  const next = { ...readPrefs(), ...patch };
  writePrefs(next);
  return next;
}
