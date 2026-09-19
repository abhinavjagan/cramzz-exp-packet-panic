import { describe, expect, it } from "vitest";
import {
  availableEdges,
  calculateMetrics,
  currentPuzzleId,
  generatePuzzle,
  hasPlausibleTrap,
  hasValidRoute,
  isPlayablePuzzleId,
  isPuzzleId,
  millisecondsUntilNextUtcDay,
  PUZZLE_EPOCH,
  PUZZLE_EPOCH_CONFIG,
  todayPuzzleId,
} from "../src/game";
import { resolvePuzzleEpoch } from "../src/puzzle-epoch";
import { challengeUrl, shareText } from "../src/share";

describe("daily puzzle generator", () => {
  it("uses an explicit preview epoch while launchDate is null", () => {
    expect(resolvePuzzleEpoch(null, "2027-01-15")).toEqual({
      launchDate: null,
      puzzleEpoch: "2027-01-15",
      mode: "preview",
    });
    expect(PUZZLE_EPOCH_CONFIG.mode).toBe("preview");
  });

  it("uses the public launch date as the puzzle epoch once configured", () => {
    expect(resolvePuzzleEpoch("2027-02-03", "2026-09-20")).toEqual({
      launchDate: "2027-02-03",
      puzzleEpoch: "2027-02-03",
      mode: "configured",
    });
    expect(() => resolvePuzzleEpoch("2027-02-30", "2026-09-20")).toThrow(/launchDate/);
  });

  it("is deterministic for a given UTC day", () => {
    expect(generatePuzzle(PUZZLE_EPOCH)).toEqual(generatePuzzle(PUZZLE_EPOCH));
    expect(generatePuzzle(PUZZLE_EPOCH)).not.toEqual(generatePuzzle(offsetDate(PUZZLE_EPOCH, 1)));
  });

  it("guarantees a scored win and a playable dead end across 10,000 daily seeds", () => {
    for (let offset = 0; offset < 10_000; offset += 1) {
      const date = new Date(Date.parse(`${PUZZLE_EPOCH}T00:00:00Z`) + offset * 86_400_000);
      const puzzle = generatePuzzle(todayPuzzleId(date));
      expect(hasValidRoute(puzzle), puzzle.id).toBe(true);
      expect(hasPlausibleTrap(puzzle), puzzle.id).toBe(true);
      expect(puzzle.edges.filter((edge) => edge.broken), puzzle.id).toHaveLength(2);
      expect(puzzle.guaranteedRoute.length - 1, puzzle.id).toBeLessThanOrEqual(puzzle.maxHops);
      expect(calculateMetrics(puzzle, puzzle.guaranteedRoute).delivered, puzzle.id).toBe(true);
      expect(calculateMetrics(puzzle, puzzle.trapRoute).delivered, puzzle.id).toBe(false);
      expect(availableEdges(puzzle, puzzle.trapRoute), puzzle.id).toHaveLength(0);
    }
  });

  it("scores a guaranteed route as delivered", () => {
    const puzzle = generatePuzzle("2026-10-01");
    const metrics = calculateMetrics(puzzle, puzzle.guaranteedRoute);

    expect(metrics.delivered).toBe(true);
    expect(metrics.hops).toBe(puzzle.guaranteedRoute.length - 1);
    expect(metrics.latency).toBeGreaterThan(0);
    expect(metrics.reliability).toBeGreaterThan(0);
    expect(metrics.reliability).toBeLessThanOrEqual(1);
    expect(metrics.score).toBeGreaterThan(0);
  });

  it("exposes only live, unvisited outgoing edges", () => {
    const puzzle = generatePuzzle("2026-10-12");
    const route = puzzle.guaranteedRoute.slice(0, 2);
    const edges = availableEdges(puzzle, route);

    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((edge) => !edge.broken && edge.from === route.at(-1))).toBe(true);
    expect(edges.every((edge) => !route.includes(edge.to))).toBe(true);
  });

  it("validates real calendar dates only", () => {
    expect(isPuzzleId("2026-09-20")).toBe(true);
    expect(isPuzzleId("2026-02-30")).toBe(false);
    expect(isPuzzleId("20-09-2026")).toBe(false);
    expect(isPuzzleId(null)).toBe(false);
  });

  it("accepts challenges only between the configured puzzle epoch and today", () => {
    expect(isPlayablePuzzleId(PUZZLE_EPOCH, PUZZLE_EPOCH)).toBe(true);
    expect(isPlayablePuzzleId(offsetDate(PUZZLE_EPOCH, -1), PUZZLE_EPOCH)).toBe(false);
    expect(isPlayablePuzzleId(offsetDate(PUZZLE_EPOCH, 1), PUZZLE_EPOCH)).toBe(false);
    expect(isPlayablePuzzleId("not-a-date", PUZZLE_EPOCH)).toBe(false);
  });

  it("rolls the daily ID at UTC midnight and computes a safe refresh delay", () => {
    const beforeMidnight = new Date("2026-09-20T23:59:59.999Z");
    const midnight = new Date("2026-09-21T00:00:00.000Z");
    expect(todayPuzzleId(beforeMidnight)).toBe("2026-09-20");
    expect(todayPuzzleId(midnight)).toBe("2026-09-21");
    expect(currentPuzzleId(new Date(`${offsetDate(PUZZLE_EPOCH, -1)}T12:00:00Z`))).toBe(PUZZLE_EPOCH);
    expect(currentPuzzleId(new Date(`${offsetDate(PUZZLE_EPOCH, 1)}T00:00:00Z`))).toBe(offsetDate(PUZZLE_EPOCH, 1));
    expect(millisecondsUntilNextUtcDay(beforeMidnight)).toBe(1);
    expect(millisecondsUntilNextUtcDay(midnight)).toBe(86_400_000);
  });

  it("accepts delivery on hop six, rejects it after the configured TTL, and rewards quality", () => {
    const base = generatePuzzle("2026-10-01");
    const route = ["src", "edge", "core", "relay", "pop", "gateway", "dst"] as const;
    const open = { ...base, edges: base.edges.map((edge) => ({ ...edge, broken: false })) };
    expect(calculateMetrics(open, [...route])).toMatchObject({ delivered: true, hops: 6 });
    expect(calculateMetrics({ ...open, maxHops: 5 }, [...route])).toMatchObject({ delivered: false, hops: 6 });

    const routeEdges = new Set(base.guaranteedRoute.slice(0, -1).map((node, index) => `${node}-${base.guaranteedRoute[index + 1]}`));
    const fast = {
      ...base,
      edges: base.edges.map((edge) => routeEdges.has(edge.id)
        ? { ...edge, latency: 12, reliability: 99.7, congested: false, broken: false }
        : edge),
    };
    const slow = {
      ...base,
      edges: base.edges.map((edge) => routeEdges.has(edge.id)
        ? { ...edge, latency: 48, reliability: 90, congested: true, broken: false }
        : edge),
    };
    expect(calculateMetrics(fast, fast.guaranteedRoute).score)
      .toBeGreaterThan(calculateMetrics(slow, slow.guaranteedRoute).score);
  });

  it("builds a base-aware challenge URL and a compact non-identifying share result", () => {
    const puzzle = generatePuzzle("2026-09-20");
    const metrics = calculateMetrics(puzzle, puzzle.guaranteedRoute);
    const challenge = new URL(challengeUrl(puzzle.id, { origin: "https://cramzz.space" }, "/e/packet-panic/"));
    const shared = shareText(puzzle, puzzle.guaranteedRoute, metrics);

    expect(challenge.origin).toBe("https://cramzz.space");
    expect(challenge.pathname).toBe("/e/packet-panic/");
    expect(challenge.searchParams.get("p")).toBe(puzzle.id);
    expect(challenge.searchParams.get("source")).toBe("share");
    expect(shared).toContain(`Packet Panic #${puzzle.number}`);
    expect(shared).not.toMatch(/Origin|router|Destination/);
  });
});

function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
