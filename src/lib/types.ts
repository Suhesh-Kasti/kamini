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
  paper: string;
  highlight: string;
  background_gradient: [string, string, string];
}

export interface ThemeType {
  display: string;
  display_weight: number;
  hand: string;
  hand_weight: number;
  body: string;
  body_weight: number;
}

export interface ThemeEnding {
  animation: string;
  photo_index?: number;
  photo_indices?: number[];
  photo_caption?: string;
  note: string;
  signature: string;
  hand_letter: string;
}

export interface Theme {
  label: string;
  mood: string;
  colors: ThemeColors;
  type: ThemeType;
  layout: string;
  decor: string;
  motion: string;
  material: string;
  scene: string;
  signature_moment: string;
  music: string | null;
  ending: ThemeEnding;
  microcopy_flavor: string;
}

export interface IntroConfig {
  line: string;
  subline: string;
  duration: number;
}

export interface PhotoEntry {
  src: string;
  alt?: string;
  caption?: string;
}

export interface GlobalConfig {
  her_name: string;
  her_photo?: string | null;
  her_photo_alt?: string;
  her_photo_caption?: string;
  her_photos?: PhotoEntry[];
  music?: string | null;
  show_her_name: "always" | "rarely" | "never";
  music_volume: number;
  reduced_motion_fallback: boolean;
  easter_egg_enabled: boolean;
  install_prompt: boolean;
  max_pixel_ratio: number;
  max_pixel_ratio_mobile: number;
  preload_scene: boolean;
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
  whispers: string[];
  behavior_lines?: Record<string, string[]>;
  themes: Record<string, Theme>;
  questions: Question[];
  ending: { replay_label: string; restart_label: string; skip_label: string };
  easter_egg: EasterEggConfig;
  install: InstallConfig;
}

export type BehaviorResult = "consume" | "pass" | "advance";
