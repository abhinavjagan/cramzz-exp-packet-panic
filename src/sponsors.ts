import rawSponsorConfig from "../sponsors.json";
import type { NodeId } from "./types";

const SPONSORABLE_NODES = new Set<NodeId>(["edge", "cache", "core", "relay", "transit", "pop", "gateway"]);
const MAX_PLACEMENTS = 20;
const MAX_CONCURRENT_PLACEMENTS = SPONSORABLE_NODES.size;
const MAX_WINDOW_DAYS = 30;

export interface SponsorPlacement {
  id: string;
  nodeId: Exclude<NodeId, "src" | "trap" | "dst">;
  brandName: string;
  destinationUrl: string;
  logoPath?: string;
  startsOn: string;
  endsOn: string;
  reviewed: true;
  paymentStatus: "captured";
}

export function validateSponsorPlacements(input: unknown): SponsorPlacement[] {
  if (!input || typeof input !== "object") throw new Error("Sponsor config must be an object");
  const config = input as { version?: unknown; placements?: unknown };
  rejectUnknownKeys(config, new Set(["$schema", "version", "placements"]), "Sponsor config");
  if (config.version !== 1 || !Array.isArray(config.placements)) throw new Error("Sponsor config version must be 1");
  if (config.placements.length > MAX_PLACEMENTS) throw new Error("Sponsor inventory exceeds 20 total Founding Node bookings");

  const placementIds = new Set<string>();
  const placements = config.placements.map<SponsorPlacement>((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Sponsor placement ${index} must be an object`);
    const placement = value as Partial<SponsorPlacement>;
    const prefix = `Sponsor placement ${index}`;
    rejectUnknownKeys(
      placement,
      new Set(["id", "nodeId", "brandName", "destinationUrl", "logoPath", "startsOn", "endsOn", "reviewed", "paymentStatus"]),
      prefix,
    );
    if (typeof placement.id !== "string" || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(placement.id)) {
      throw new Error(`${prefix} has an invalid id`);
    }
    if (placementIds.has(placement.id)) throw new Error(`${prefix} duplicates placement id ${placement.id}`);
    placementIds.add(placement.id);

    if (!SPONSORABLE_NODES.has(placement.nodeId as NodeId)) throw new Error(`${prefix} targets a non-sponsorable node`);

    if (typeof placement.brandName !== "string" || placement.brandName.trim().length < 1 || placement.brandName.length > 40) {
      throw new Error(`${prefix} has an invalid brand name`);
    }
    validateHttpsDestination(placement.destinationUrl, prefix);
    if (placement.logoPath !== undefined
      && (typeof placement.logoPath !== "string" || !/^sponsors\/[A-Za-z0-9_-]+\.(?:png|webp)$/.test(placement.logoPath))) {
      throw new Error(`${prefix} logo must be a local sponsors/*.png or sponsors/*.webp asset`);
    }
    if (!isCalendarDate(placement.startsOn) || !isCalendarDate(placement.endsOn)) {
      throw new Error(`${prefix} has an invalid date window`);
    }
    const duration = Math.floor((Date.parse(`${placement.endsOn}T00:00:00Z`) - Date.parse(`${placement.startsOn}T00:00:00Z`)) / 86_400_000) + 1;
    if (duration !== MAX_WINDOW_DAYS) throw new Error(`${prefix} must run for exactly 30 inclusive days`);
    if (placement.reviewed !== true) throw new Error(`${prefix} has not passed creative review`);
    if (placement.paymentStatus !== "captured") throw new Error(`${prefix} does not have a manually verified captured payment`);

    return {
      id: placement.id,
      nodeId: placement.nodeId as SponsorPlacement["nodeId"],
      brandName: placement.brandName.trim(),
      destinationUrl: placement.destinationUrl as string,
      ...(placement.logoPath ? { logoPath: placement.logoPath } : {}),
      startsOn: placement.startsOn,
      endsOn: placement.endsOn,
      reviewed: true,
      paymentStatus: "captured",
    };
  });

  for (let index = 0; index < placements.length; index += 1) {
    for (let comparison = index + 1; comparison < placements.length; comparison += 1) {
      const first = placements[index];
      const second = placements[comparison];
      const windowsOverlap = first.startsOn <= second.endsOn && second.startsOn <= first.endsOn;
      if (first.nodeId === second.nodeId && windowsOverlap) {
        throw new Error(`Sponsor placements ${first.id} and ${second.id} overlap on node ${first.nodeId}`);
      }
    }
  }

  for (const date of new Set(placements.map((placement) => placement.startsOn))) {
    const concurrent = placements.filter((placement) => placement.startsOn <= date && date <= placement.endsOn).length;
    if (concurrent > MAX_CONCURRENT_PLACEMENTS) {
      throw new Error(`Sponsor inventory exceeds ${MAX_CONCURRENT_PLACEMENTS} concurrent Founding Node bookings on ${date}`);
    }
  }

  return placements;
}

export function activeSponsorPlacements(placements: SponsorPlacement[], currentDate: string): SponsorPlacement[] {
  if (!isCalendarDate(currentDate)) throw new Error("Current sponsor date is invalid");
  const active = placements.filter((placement) => placement.startsOn <= currentDate && currentDate <= placement.endsOn);
  if (active.length > MAX_CONCURRENT_PLACEMENTS) {
    throw new Error(`Sponsor inventory exceeds ${MAX_CONCURRENT_PLACEMENTS} concurrent Founding Node bookings on ${currentDate}`);
  }
  return active;
}

export function sponsorAriaDescription(placement: SponsorPlacement): string {
  return `Sponsored by ${placement.brandName}. Sponsorship does not affect routing or scoring.`;
}

export function resolveSponsorFormDestination(configured: string | undefined, siteOrigin: string): { url: string; opensForm: boolean } {
  const fallback = new URL("/sponsor-policy", siteOrigin).toString();
  if (!configured?.trim()) return { url: fallback, opensForm: false };
  try {
    const candidate = new URL(configured.trim());
    if (candidate.origin === "https://tally.so" && !candidate.username && !candidate.password) {
      return { url: candidate.toString(), opensForm: true };
    }
  } catch {
    // Invalid configuration falls back to the sponsor policy.
  }
  return { url: fallback, opensForm: false };
}

export const SPONSOR_PLACEMENTS = validateSponsorPlacements(rawSponsorConfig);

function validateHttpsDestination(value: unknown, prefix: string): void {
  if (typeof value !== "string") throw new Error(`${prefix} destination must be HTTPS`);
  try {
    const destination = new URL(value);
    if (destination.protocol !== "https:" || destination.username || destination.password) throw new Error("unsafe");
  } catch {
    throw new Error(`${prefix} destination must be an HTTPS URL without embedded credentials`);
  }
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function rejectUnknownKeys(value: object, allowed: Set<string>, prefix: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${prefix} contains unknown field ${unknown[0]}`);
}
