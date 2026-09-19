import { edgeQuality, getEdge } from "./game";
import type { NodeId, Puzzle, RouteMetrics } from "./types";

function routeGrid(puzzle: Puzzle, route: NodeId[]): string {
  return route.slice(0, -1).map((node, index) => {
    const edge = getEdge(puzzle, node, route[index + 1]);
    if (!edge) return "⚫";
    const quality = edgeQuality(edge);
    return quality === "fast" ? "🟢" : quality === "risky" ? "🟡" : "🟠";
  }).join("");
}

export function challengeUrl(
  puzzleId: string,
  location: Pick<Location, "origin"> = window.location,
  basePath: string = import.meta.env.BASE_URL,
): string {
  const base = new URL(basePath, location.origin);
  base.searchParams.set("p", puzzleId);
  base.searchParams.set("source", "share");
  return base.toString();
}

export function shareText(puzzle: Puzzle, route: NodeId[], metrics: RouteMetrics): string {
  const result = metrics.delivered ? `${metrics.hops}/${puzzle.maxHops}` : `X/${puzzle.maxHops}`;
  return [
    `Packet Panic #${puzzle.number} ${result}`,
    routeGrid(puzzle, route),
    metrics.delivered
      ? `⚡ ${metrics.latency}ms · 🛡 ${Math.round(metrics.reliability * 100)}% · ${metrics.grade}`
      : "💥 Packet dropped. The TTL won this round.",
    "",
    challengeUrl(puzzle.id),
  ].join("\n");
}
