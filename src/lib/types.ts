export type ButtonRole = "correct" | "wrong" | "trick" | "neutral";

export interface QuestionButton {
  label: string;
  role: ButtonRole;
  on_hover?: string;
  on_tap?: string;
  on_click?: string;
  labels_cycle?: string[];
  next?: string;
  note?: string;
}

export interface Question {
  id: string;
  eyebrow?: string;
  text: string;
  text_by_theme?: Record<string, string>;
  theme_override?: string;
  music_override?: string | null;
  whispers?: string[];
  buttons: QuestionButton[];
  transition_out?: string;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  soft: string;
  background_gradient: [string, string, string];
}

export interface ThreeFlags {
  clouds?: boolean;
  cat?: boolean;
  dog?: boolean;
  particles?: boolean;
  yarn_balls?: boolean;
  crochet_hook?: boolean;
  piggy_bank?: boolean;
  shopping_bag?: boolean;
  coins?: boolean;
  envelope?: boolean;
  hearts?: boolean;
  flower?: boolean;
}

export interface Theme {
  label: string;
  mood: string;
  colors: ThemeColors;
  three_d: ThreeFlags;
  music: string | null;
  ending: {
    animation: string;
    note: string;
    signature: string;
  };
  microcopy_flavor: string;
}

export interface IntroConfig {
  line: string;
  subline: string;
  duration: number;
}

export interface GlobalConfig {
  her_name: string;
  show_her_name: "always" | "rarely" | "never";
  music_volume: number;
  reduced_motion_fallback: boolean;
  easter_egg_enabled: boolean;
  install_prompt: boolean;
  max_pixel_ratio: number;
  secret_taps: number;
}

export interface EasterEggConfig {
  trigger: string;
  unlock_after_taps: number;
  panel_title: string;
  panel_subtitle: string;
  hint_after_seconds: number;
  settings: Record<string, boolean>;
}

export interface InstallConfig {
  title: string;
  body: string;
  button: string;
  dismiss: string;
}

export interface SiteConfig {
  active_theme: string;
  global: GlobalConfig;
  intro: IntroConfig;
  fonts: { heading: string; subheading: string; body: string };
  whispers: string[];
  behavior_lines?: Record<string, string[]>;
  themes: Record<string, Theme>;
  questions: Question[];
  ending: { replay_label: string; restart_label: string; skip_label: string };
  easter_egg: EasterEggConfig;
  install: InstallConfig;
}

export type BehaviorResult = "consume" | "pass" | "advance";
