import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, loadProgress, progressStorageKey, recordCompletion, saveProgress } from "../src/storage";
import type { CompletionRecord } from "../src/types";

function completion(puzzleId: string, won = true): CompletionRecord {
  return { puzzleId, won, score: won ? 800 : 0, grade: won ? "A" : "D", hops: 4, completedAt: `${puzzleId}T10:00:00Z` };
}

describe("local player progress", () => {
  it("increments consecutive UTC-day wins", () => {
    const first = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-20"));
    const second = recordCompletion(first, completion("2026-09-21"));

    expect(first.streak).toBe(1);
    expect(second.streak).toBe(2);
    expect(second.lastWinDate).toBe("2026-09-21");
  });

  it("does not count a replay twice", () => {
    const first = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-20"));
    expect(recordCompletion(first, completion("2026-09-20"))).toBe(first);
  });

  it("does not give losses a streak", () => {
    const result = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-20", false));
    expect(result.streak).toBe(0);
    expect(result.lastWinDate).toBeNull();
  });

  it("upgrades a failed attempt when a retry wins", () => {
    const loss = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-20", false));
    const win = recordCompletion(loss, completion("2026-09-20", true));

    expect(win.completions["2026-09-20"].won).toBe(true);
    expect(win.streak).toBe(1);
    expect(win.lastWinDate).toBe("2026-09-20");
  });

  it("does not move a newer streak backward when an old challenge is completed", () => {
    const day21 = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-21"));
    const day22 = recordCompletion(day21, completion("2026-09-22"));
    const historical = recordCompletion(day22, completion("2026-09-20"));

    expect(historical.lastWinDate).toBe("2026-09-22");
    expect(historical.streak).toBe(3);
  });

  it("survives blocked or corrupt storage", () => {
    expect(loadProgress({ getItem: () => "not-json" })).toEqual(EMPTY_PROGRESS);
    expect(loadProgress({ getItem: () => JSON.stringify({
      version: 1,
      streak: 999,
      lastWinDate: "private garbage",
      completions: { bad: null, alsoBad: { won: true } },
    }) })).toEqual(EMPTY_PROGRESS);
    expect(() => saveProgress(EMPTY_PROGRESS, { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("keeps preview completions out of the configured launch namespace", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const previewKey = progressStorageKey({ mode: "preview", puzzleEpoch: "2026-09-20" });
    const launchKey = progressStorageKey({ mode: "configured", puzzleEpoch: "2026-09-20" });
    const previewProgress = recordCompletion({ ...EMPTY_PROGRESS, completions: {} }, completion("2026-09-20"));

    saveProgress(previewProgress, storage, previewKey);
    expect(loadProgress(storage, previewKey).streak).toBe(1);
    expect(loadProgress(storage, launchKey)).toEqual(EMPTY_PROGRESS);
    expect(previewKey).not.toBe(launchKey);
  });
});
