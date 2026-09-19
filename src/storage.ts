import { PUZZLE_EPOCH_CONFIG } from "./game";
import type { PuzzleEpochConfig } from "./puzzle-epoch";
import type { CompletionRecord, PlayerProgress } from "./types";

const STORAGE_KEY = progressStorageKey(PUZZLE_EPOCH_CONFIG);

export const EMPTY_PROGRESS: PlayerProgress = {
  version: 1,
  streak: 0,
  lastWinDate: null,
  completions: {},
};

function cloneEmptyProgress(): PlayerProgress {
  return { ...EMPTY_PROGRESS, completions: {} };
}

export function progressStorageKey(config: Pick<PuzzleEpochConfig, "mode" | "puzzleEpoch">): string {
  return `cramzz:packet-panic:progress:v2:${config.mode}:${config.puzzleEpoch}`;
}

export function loadProgress(
  storage: Pick<Storage, "getItem"> = localStorage,
  storageKey = STORAGE_KEY,
): PlayerProgress {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return cloneEmptyProgress();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    if (parsed.version !== 1 || typeof parsed.completions !== "object" || parsed.completions === null) {
      return cloneEmptyProgress();
    }
    const completions = Object.fromEntries(Object.entries(parsed.completions)
      .filter((entry): entry is [string, CompletionRecord] => isCompletionRecord(entry[0], entry[1])));
    const summary = summarizeWins(completions);
    return {
      version: 1,
      ...summary,
      completions,
    };
  } catch {
    return cloneEmptyProgress();
  }
}

export function recordCompletion(
  progress: PlayerProgress,
  completion: CompletionRecord,
): PlayerProgress {
  const existing = progress.completions[completion.puzzleId];
  if (existing?.won || (existing && !completion.won)) return progress;

  const completions = { ...progress.completions, [completion.puzzleId]: completion };
  const summary = summarizeWins(completions);

  return {
    version: 1,
    ...summary,
    completions,
  };
}

function summarizeWins(completions: Record<string, CompletionRecord>): Pick<PlayerProgress, "streak" | "lastWinDate"> {
  const winningDates = Object.values(completions)
    .filter((record) => record.won && isCalendarDate(record.puzzleId))
    .map((record) => record.puzzleId)
    .sort((left, right) => right.localeCompare(left));
  const lastWinDate = winningDates[0] ?? null;
  let streak = lastWinDate ? 1 : 0;
  for (let index = 1; index < winningDates.length; index += 1) {
    const newer = Date.parse(`${winningDates[index - 1]}T00:00:00Z`);
    const older = Date.parse(`${winningDates[index]}T00:00:00Z`);
    if (newer - older !== 86_400_000) break;
    streak += 1;
  }
  return { streak, lastWinDate };
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function isCompletionRecord(key: string, value: unknown): value is CompletionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CompletionRecord>;
  return record.puzzleId === key
    && isCalendarDate(record.puzzleId)
    && typeof record.won === "boolean"
    && typeof record.score === "number"
    && Number.isFinite(record.score)
    && record.score >= 0
    && record.score <= 1_000
    && ["S", "A", "B", "C", "D"].includes(record.grade ?? "")
    && typeof record.hops === "number"
    && Number.isInteger(record.hops)
    && record.hops >= 0
    && record.hops <= 6
    && typeof record.completedAt === "string"
    && !Number.isNaN(Date.parse(record.completedAt));
}

export function saveProgress(
  progress: PlayerProgress,
  storage: Pick<Storage, "setItem"> = localStorage,
  storageKey = STORAGE_KEY,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(progress));
  } catch {
    // The game remains fully playable when storage is blocked or full.
  }
}

export function hasPlayedBefore(progress: PlayerProgress): boolean {
  return Object.keys(progress.completions).length > 0;
}
