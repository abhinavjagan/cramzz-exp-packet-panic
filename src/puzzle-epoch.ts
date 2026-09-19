export const DEFAULT_PREVIEW_PUZZLE_EPOCH = "2026-09-20";

export interface PuzzleEpochConfig {
  launchDate: string | null;
  puzzleEpoch: string;
  mode: "configured" | "preview";
}

export function resolvePuzzleEpoch(
  launchDate: unknown,
  previewEpoch: string | undefined = DEFAULT_PREVIEW_PUZZLE_EPOCH,
): PuzzleEpochConfig {
  if (launchDate !== null && !isCalendarDate(launchDate)) {
    throw new Error("Packet Panic launchDate must be a real ISO calendar date or null");
  }
  if (launchDate !== null) {
    return { launchDate, puzzleEpoch: launchDate, mode: "configured" };
  }

  const fallback = previewEpoch?.trim() || DEFAULT_PREVIEW_PUZZLE_EPOCH;
  if (!isCalendarDate(fallback)) {
    throw new Error("VITE_PREVIEW_PUZZLE_EPOCH must be a real ISO calendar date");
  }
  return { launchDate: null, puzzleEpoch: fallback, mode: "preview" };
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
