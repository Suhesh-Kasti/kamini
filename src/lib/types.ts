export type ButtonRole = "correct" | "wrong" | "trick" | "neutral";

export type PersonalityId =
  | "scaredy"
  | "sleepy"
  | "showoff"
  | "clumsy"
  | "sassy"
  | "confused"
  | "hungry"
  | "shy"
  | "hyper"
  | "proud"
  | "sneaky"
  | "peekaboo";

export interface QuestionButton {
  label: string;
  role: ButtonRole;
  personality?: PersonalityId;
  on_hover?: string;
  on_tap?: string;
  on_click?: string;
  next?: string;
  note?: string;
}

export type DeviceSupport =
  | "touch"
  | "mouse"
  | "sensor_gyro"
  | "sensor_accel"
  | "camera"
  | "mic"
  | "keyboard";

export type PermissionKind = "camera" | "mic" | "motion" | "none";

export interface MinigameConfig {
  id: string;
  name: string;
  description: string;
  device_support: DeviceSupport[];
  permissions: PermissionKind[];
  fallback_game_id: string;
  enabled_by_default: boolean;
  status?: "ready" | "coming_soon";
  required_theme_affinity?: string[];
  content?: Record<string, unknown>;
}

export interface QuestionVariant {
  id: string;
  text?: string;
  buttons?: QuestionButton[];
  minigame_pool?: string[];
  microcopy?: string[];
  animation?: string;
  music_override?: string | null;
}

export interface Question {
  id: string;
  sequence_index?: number;
  variants?: QuestionVariant[];
  eyebrow?: string;
  text?: string;
  music_override?: string | null;
  whispers?: string[];
  buttons?: QuestionButton[];
  next?: string;
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
  notes?: string[];
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
  print_caption?: string;
  print_signature?: string;
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
  themes: Record<string, Theme>;
  questions: Question[];
  ending: { replay_label: string; restart_label: string; skip_label: string };
  easter_egg: EasterEggConfig;
  install: InstallConfig;
  minigames?: MinigameConfig[];
  ending_notes?: Record<string, string[]>;
}

export type BehaviorResult = "consume" | "pass" | "advance";
