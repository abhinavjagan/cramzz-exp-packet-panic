export type NodeId =
  | "src"
  | "edge"
  | "cache"
  | "core"
  | "relay"
  | "transit"
  | "pop"
  | "gateway"
  | "trap"
  | "dst";

export type NodeKind = "source" | "router" | "trap" | "destination";

export interface NetworkNode {
  id: NodeId;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  kind: NodeKind;
}

export interface NetworkEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  latency: number;
  reliability: number;
  congested: boolean;
  broken: boolean;
}

export interface Puzzle {
  id: string;
  number: number;
  maxHops: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  guaranteedRoute: NodeId[];
  trapRoute: NodeId[];
}

export interface RouteMetrics {
  latency: number;
  reliability: number;
  hops: number;
  delivered: boolean;
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
}

export type GameStatus = "routing" | "delivered" | "dropped";

export interface CompletionRecord {
  puzzleId: string;
  won: boolean;
  score: number;
  grade: RouteMetrics["grade"];
  hops: number;
  completedAt: string;
}

export interface PlayerProgress {
  version: 1;
  streak: number;
  lastWinDate: string | null;
  completions: Record<string, CompletionRecord>;
}
