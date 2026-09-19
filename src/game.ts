import experimentManifest from "../experiment.json" with { type: "json" };
import type { NetworkEdge, NetworkNode, NodeId, Puzzle, RouteMetrics } from "./types";
import { resolvePuzzleEpoch } from "./puzzle-epoch";

export const PUZZLE_EPOCH_CONFIG = resolvePuzzleEpoch(
  experimentManifest.launchDate,
  import.meta.env?.VITE_PREVIEW_PUZZLE_EPOCH,
);
export const PUZZLE_EPOCH = PUZZLE_EPOCH_CONFIG.puzzleEpoch;
const MAX_HOPS = 6;

const NODES: NetworkNode[] = [
  { id: "src", label: "Origin", shortLabel: "IN", x: 7, y: 50, kind: "source" },
  { id: "edge", label: "Edge router", shortLabel: "E1", x: 25, y: 20, kind: "router" },
  { id: "cache", label: "Cache router", shortLabel: "C1", x: 25, y: 80, kind: "router" },
  { id: "core", label: "Core router", shortLabel: "R1", x: 47, y: 11, kind: "router" },
  { id: "relay", label: "Relay router", shortLabel: "R2", x: 47, y: 47, kind: "router" },
  { id: "transit", label: "Transit router", shortLabel: "T1", x: 47, y: 84, kind: "router" },
  { id: "pop", label: "Regional point of presence", shortLabel: "P1", x: 71, y: 20, kind: "router" },
  { id: "gateway", label: "Gateway router", shortLabel: "G1", x: 71, y: 62, kind: "router" },
  { id: "trap", label: "Exchange router", shortLabel: "X", x: 71, y: 85, kind: "trap" },
  { id: "dst", label: "Destination", shortLabel: "OUT", x: 94, y: 43, kind: "destination" },
];

const EDGE_PAIRS: Array<[NodeId, NodeId]> = [
  ["src", "edge"],
  ["src", "cache"],
  ["edge", "core"],
  ["edge", "relay"],
  ["cache", "relay"],
  ["cache", "transit"],
  ["core", "pop"],
  ["core", "relay"],
  ["relay", "pop"],
  ["relay", "gateway"],
  ["transit", "gateway"],
  ["transit", "trap"],
  ["pop", "dst"],
  ["gateway", "dst"],
  ["pop", "gateway"],
];

const SAFE_ROUTES: NodeId[][] = [
  ["src", "edge", "core", "pop", "dst"],
  ["src", "edge", "relay", "gateway", "dst"],
  ["src", "cache", "relay", "pop", "dst"],
  ["src", "cache", "transit", "gateway", "dst"],
];

const TRAP_ROUTE: NodeId[] = ["src", "cache", "transit", "trap"];

function edgeId(from: NodeId, to: NodeId): string {
  return `${from}-${to}`;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function routeEdgeIds(route: NodeId[]): string[] {
  return route.slice(0, -1).map((node, index) => edgeId(node, route[index + 1]));
}

function dayNumber(id: string): number {
  const launch = Date.parse(`${PUZZLE_EPOCH}T00:00:00Z`);
  const selected = Date.parse(`${id}T00:00:00Z`);
  return Math.max(1, Math.floor((selected - launch) / 86_400_000) + 1);
}

export function isPuzzleId(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

export function todayPuzzleId(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function currentPuzzleId(date = new Date()): string {
  const today = todayPuzzleId(date);
  return today < PUZZLE_EPOCH ? PUZZLE_EPOCH : today;
}

export function isPlayablePuzzleId(value: string | null, current = currentPuzzleId()): value is string {
  return isPuzzleId(value) && value >= PUZZLE_EPOCH && value <= current;
}

export function millisecondsUntilNextUtcDay(date = new Date()): number {
  const nextUtcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(1, nextUtcDay - date.valueOf());
}

export function generatePuzzle(id: string): Puzzle {
  if (!isPuzzleId(id)) throw new Error(`Invalid puzzle id: ${id}`);

  const random = seededRandom(hashSeed(`packet-panic:${id}:v1`));
  const guaranteedRoute = [...SAFE_ROUTES[Math.floor(random() * SAFE_ROUTES.length)]];
  const protectedEdges = new Set([...routeEdgeIds(guaranteedRoute), ...routeEdgeIds(TRAP_ROUTE)]);
  const breakableEdges = EDGE_PAIRS
    .map(([from, to]) => edgeId(from, to))
    .filter((id) => !protectedEdges.has(id));
  const brokenEdges = new Set<string>();

  while (brokenEdges.size < 2 && brokenEdges.size < breakableEdges.length) {
    brokenEdges.add(breakableEdges[Math.floor(random() * breakableEdges.length)]);
  }

  const edges: NetworkEdge[] = EDGE_PAIRS.map(([from, to]) => {
    const id = edgeId(from, to);
    const congested = !brokenEdges.has(id) && random() < 0.28;
    return {
      id,
      from,
      to,
      latency: 12 + Math.floor(random() * 37),
      reliability: Number((90 + random() * 9.7).toFixed(1)),
      congested,
      broken: brokenEdges.has(id),
    };
  });

  return {
    id,
    number: dayNumber(id),
    maxHops: MAX_HOPS,
    nodes: NODES.map((node) => ({ ...node })),
    edges,
    guaranteedRoute,
    trapRoute: [...TRAP_ROUTE],
  };
}

export function getNode(puzzle: Puzzle, id: NodeId): NetworkNode {
  const node = puzzle.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown node: ${id}`);
  return node;
}

export function getEdge(puzzle: Puzzle, from: NodeId, to: NodeId): NetworkEdge | undefined {
  return puzzle.edges.find((edge) => edge.from === from && edge.to === to);
}

export function availableEdges(puzzle: Puzzle, route: NodeId[]): NetworkEdge[] {
  const current = route.at(-1) ?? "src";
  const visited = new Set(route);
  return puzzle.edges.filter((edge) => edge.from === current && !edge.broken && !visited.has(edge.to));
}

export function calculateMetrics(puzzle: Puzzle, route: NodeId[]): RouteMetrics {
  const traversed = route.slice(0, -1).map((node, index) => {
    const edge = getEdge(puzzle, node, route[index + 1]);
    if (!edge || edge.broken) throw new Error(`Route uses an unavailable edge: ${node}-${route[index + 1]}`);
    return edge;
  });
  const latency = traversed.reduce((total, edge) => total + Math.round(edge.latency * (edge.congested ? 1.65 : 1)), 0);
  const reliability = Number(
    traversed.reduce((total, edge) => total * (edge.reliability / 100), 1).toFixed(3),
  );
  const hops = traversed.length;
  const delivered = route.at(-1) === "dst" && hops <= puzzle.maxHops;
  const rawScore = delivered
    ? 900 - latency * 1.6 - hops * 30 + reliability * 250
    : Math.max(0, 160 - hops * 20);
  const score = Math.max(0, Math.min(1_000, Math.round(rawScore)));
  const grade: RouteMetrics["grade"] = score >= 850 ? "S" : score >= 700 ? "A" : score >= 550 ? "B" : score >= 350 ? "C" : "D";

  return { latency, reliability, hops, delivered, score, grade };
}

export function hasValidRoute(puzzle: Puzzle): boolean {
  const queue: Array<{ node: NodeId; visited: NodeId[] }> = [{ node: "src", visited: ["src"] }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.node === "dst") return current.visited.length - 1 <= puzzle.maxHops;
    if (current.visited.length - 1 >= puzzle.maxHops) continue;
    for (const edge of puzzle.edges) {
      if (edge.from !== current.node || edge.broken || current.visited.includes(edge.to)) continue;
      queue.push({ node: edge.to, visited: [...current.visited, edge.to] });
    }
  }
  return false;
}

export function hasPlausibleTrap(puzzle: Puzzle): boolean {
  const trapEdges = routeEdgeIds(puzzle.trapRoute);
  const routeIsOpen = trapEdges.every((id) => puzzle.edges.some((edge) => edge.id === id && !edge.broken));
  const trap = puzzle.trapRoute.at(-1);
  const trapHasExit = puzzle.edges.some((edge) => edge.from === trap && !edge.broken);
  return routeIsOpen && !trapHasExit;
}

export function edgeQuality(edge: NetworkEdge): "fast" | "risky" | "congested" {
  if (edge.congested) return "congested";
  if (edge.reliability < 94.5) return "risky";
  return "fast";
}
