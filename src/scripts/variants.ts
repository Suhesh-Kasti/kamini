import type { MinigameConfig, Question, QuestionButton, QuestionVariant } from "../lib/types";
import type { DeviceCaps } from "./device";
import { isTouchFirst, permissionFor, supportsGame } from "./device";
import { PERSONALITY_IDS } from "./personalities";

const SEEN_KEY = "pocket-mood.seen.v1";

export interface PlannedQuestion {
  questionId: string;
  variantId: string;
  gameId: string;
  buttons: QuestionButton[];
  text: string;
  microcopy: string[];
  animation?: string;
  music?: string | null;
}

export interface SessionPlan {
  questions: Record<string, PlannedQuestion>;
  newVariants: boolean;
}

export interface PlanOptions {
  caps: DeviceCaps;
  themeId: string;
  enabled: (id: string) => boolean;
  permission: (kind: "camera" | "mic" | "motion") => "granted" | "denied" | undefined;
  record?: boolean;
}

type SeenLog = Record<string, Record<string, number>>;

export function readSeen(): SeenLog {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as SeenLog) : {};
  } catch {
    return {};
  }
}

function writeSeen(log: SeenLog): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(log));
  } catch {
    // Ignore private-mode storage failures.
  }
}

export function clearSeen(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Ignore.
  }
}

function weightedPick<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map((item) => Math.max(0.0001, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

function variantSeen(log: SeenLog, questionId: string, variantId: string): number {
  return log[questionId]?.[variantId] ?? 0;
}

function pickVariant(question: Question, log: SeenLog): QuestionVariant {
  const variants: QuestionVariant[] = question.variants?.length
    ? question.variants
    : [{
        id: `${question.id}_base`,
        text: question.text,
        buttons: question.buttons,
        minigame_pool: question.buttons ? ["buttons"] : ["choose_item"],
        microcopy: question.whispers,
      }];
  return weightedPick(variants, (variant) => 1 / (1 + variantSeen(log, question.id, variant.id)));
}

export function gameAvailable(
  game: MinigameConfig | undefined,
  options: PlanOptions
): boolean {
  if (!game || game.status !== "ready") return false;
  if (!options.enabled(game.id)) return false;
  if (!supportsGame(game, options.caps)) return false;
  const permission = permissionFor(game, options.caps);
  if (permission && options.permission(permission) === "denied") return false;
  return true;
}

function gameWeight(
  id: string,
  games: Map<string, MinigameConfig>,
  options: PlanOptions
): number {
  if (id === "buttons") return 1.2;
  const game = games.get(id);
  if (!game) return 0.1;
  let weight = 1;
  if (game.required_theme_affinity?.includes(options.themeId)) weight += 1.4;
  const touchFirst = isTouchFirst(options.caps);
  if (touchFirst && game.device_support.some((support) => support === "touch" || support.startsWith("sensor") || support === "camera")) {
    weight += 0.8;
  }
  if (!touchFirst && game.device_support.includes("mouse")) weight += 0.8;
  return weight;
}

function pickGame(
  variant: QuestionVariant,
  games: Map<string, MinigameConfig>,
  options: PlanOptions,
  usedGames: Set<string>
): string {
  const pool = variant.minigame_pool?.length
    ? variant.minigame_pool
    : variant.buttons
      ? ["buttons"]
      : ["choose_item"];
  const candidates = pool.filter((id) => {
    if (id === "buttons") return Boolean(variant.buttons?.length);
    if (usedGames.has(id)) return false;
    return gameAvailable(games.get(id), options);
  });
  if (candidates.length) {
    return weightedPick(candidates, (id) => gameWeight(id, games, options));
  }
  if (variant.buttons?.length) return "buttons";
  // The pool may be exhausted by earlier beats. Prefer any unused, playable
  // game over showing the same one twice in a session.
  const unused = Array.from(games.values()).filter(
    (game) => !usedGames.has(game.id) && gameAvailable(game, options)
  );
  if (unused.length) {
    return weightedPick(unused, (game) => gameWeight(game.id, games, options)).id;
  }
  return "tap_continue";
}

function assignPersonalities(buttons: QuestionButton[], used: Set<string>): QuestionButton[] {
  let cursor = 0;
  return buttons.map((button) => {
    if (button.role === "correct") return { ...button };
    let personality = button.personality;
    if (!personality || used.has(personality)) {
      while (cursor < PERSONALITY_IDS.length && used.has(PERSONALITY_IDS[cursor])) cursor += 1;
      personality = PERSONALITY_IDS[cursor % PERSONALITY_IDS.length];
      cursor += 1;
    }
    used.add(personality);
    return { ...button, personality };
  });
}

export function buildPlan(
  questions: Question[],
  games: MinigameConfig[],
  options: PlanOptions
): SessionPlan {
  const log = readSeen();
  const gameMap = new Map(games.map((game) => [game.id, game]));
  const before = questions.some((question) =>
    (question.variants ?? []).some((variant) => variantSeen(log, question.id, variant.id) === 0)
  );
  const planned: Record<string, PlannedQuestion> = {};
  const usedPersonalities = new Set<string>();
  const usedGames = new Set<string>();

  for (const question of questions) {
    const variant = pickVariant(question, log);
    if (options.record !== false) {
      log[question.id] = log[question.id] ?? {};
      log[question.id][variant.id] = (log[question.id][variant.id] ?? 0) + 1;
    }
    const gameId = pickGame(variant, gameMap, options, usedGames);
    if (gameId !== "buttons" && gameId !== "tap_continue") usedGames.add(gameId);
    const buttons = gameId === "buttons" ? assignPersonalities(variant.buttons ?? [], usedPersonalities) : [];
    planned[question.id] = {
      questionId: question.id,
      variantId: variant.id,
      gameId,
      buttons,
      text: variant.text ?? question.text ?? "",
      microcopy: variant.microcopy ?? question.whispers ?? [],
      animation: variant.animation,
      music: variant.music_override,
    };
  }
  if (options.record !== false) writeSeen(log);
  return { questions: planned, newVariants: before };
}

export function rerollPlan(
  questions: Question[],
  games: MinigameConfig[],
  options: PlanOptions
): SessionPlan {
  clearSeen();
  return buildPlan(questions, games, options);
}
