import assert from "node:assert/strict";
import {
  availableEdges,
  calculateMetrics,
  generatePuzzle,
  hasPlausibleTrap,
  hasValidRoute,
  PUZZLE_EPOCH,
  todayPuzzleId,
} from "../src/game";

const days = Number.parseInt(process.env.AUDIT_DAYS ?? "10000", 10);
assert(Number.isSafeInteger(days) && days > 0 && days <= 100_000, "AUDIT_DAYS must be between 1 and 100000");

const grades: Record<string, number> = {};
let minimumWinningScore = Number.POSITIVE_INFINITY;
let maximumWinningScore = Number.NEGATIVE_INFINITY;
let congestedEdges = 0;
let brokenEdges = 0;
const epochTime = Date.parse(`${PUZZLE_EPOCH}T00:00:00Z`);

for (let offset = 0; offset < days; offset += 1) {
  const id = todayPuzzleId(new Date(epochTime + offset * 86_400_000));
  const puzzle = generatePuzzle(id);
  assert.deepEqual(puzzle, generatePuzzle(id), `${id}: puzzle is not deterministic`);
  assert(hasValidRoute(puzzle), `${id}: no winning route`);
  assert(hasPlausibleTrap(puzzle), `${id}: no plausible losing route`);
  assert.equal(puzzle.edges.filter((edge) => edge.broken).length, 2, `${id}: broken-link count changed`);

  const win = calculateMetrics(puzzle, puzzle.guaranteedRoute);
  const trap = calculateMetrics(puzzle, puzzle.trapRoute);
  assert(win.delivered && win.hops <= puzzle.maxHops, `${id}: guaranteed route does not win within TTL`);
  assert(!trap.delivered && availableEdges(puzzle, puzzle.trapRoute).length === 0, `${id}: trap route is not terminal`);
  assert(win.score >= 0 && win.score <= 1_000, `${id}: score is outside bounds`);
  assert(win.reliability > 0 && win.reliability <= 1, `${id}: reliability is outside bounds`);

  grades[win.grade] = (grades[win.grade] ?? 0) + 1;
  minimumWinningScore = Math.min(minimumWinningScore, win.score);
  maximumWinningScore = Math.max(maximumWinningScore, win.score);
  congestedEdges += puzzle.edges.filter((edge) => edge.congested).length;
  brokenEdges += puzzle.edges.filter((edge) => edge.broken).length;
}

console.log(JSON.stringify({
  days,
  firstPuzzle: PUZZLE_EPOCH,
  lastPuzzle: todayPuzzleId(new Date(epochTime + (days - 1) * 86_400_000)),
  validWinningRoutes: days,
  validTrapRoutes: days,
  minimumWinningScore,
  maximumWinningScore,
  grades,
  averageCongestedEdges: Number((congestedEdges / days).toFixed(3)),
  averageBrokenEdges: Number((brokenEdges / days).toFixed(3)),
}, null, 2));
