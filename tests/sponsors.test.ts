import { describe, expect, it } from "vitest";
import { calculateMetrics, generatePuzzle } from "../src/game";
import {
  activeSponsorPlacements,
  resolveSponsorFormDestination,
  SPONSOR_PLACEMENTS,
  sponsorAriaDescription,
  validateSponsorPlacements,
} from "../src/sponsors";

const validPlacement = {
  id: "founding-acme",
  nodeId: "edge",
  brandName: "Acme Networks",
  destinationUrl: "https://example.com/packet-panic",
  logoPath: "sponsors/acme.png",
  startsOn: "2026-09-20",
  endsOn: "2026-10-19",
  reviewed: true,
  paymentStatus: "captured",
};

describe("Founding Node sponsor contract", () => {
  it("ships with no active placement before a captured payment is manually verified", () => {
    expect(SPONSOR_PLACEMENTS).toEqual([]);
  });

  it("activates a reviewed, captured placement only inside its inclusive 30-day window", () => {
    const placements = validateSponsorPlacements({ version: 1, placements: [validPlacement] });
    expect(activeSponsorPlacements(placements, "2026-09-19")).toEqual([]);
    expect(activeSponsorPlacements(placements, "2026-09-20")).toHaveLength(1);
    expect(activeSponsorPlacements(placements, "2026-10-19")).toHaveLength(1);
    expect(activeSponsorPlacements(placements, "2026-10-20")).toEqual([]);
    expect(sponsorAriaDescription(placements[0])).toContain("Sponsored by Acme Networks");
  });

  it.each([
    ["uncaptured payment", { paymentStatus: "created" }],
    ["unreviewed creative", { reviewed: false }],
    ["HTTP destination", { destinationUrl: "http://example.com" }],
    ["credentialed destination", { destinationUrl: "https://user:pass@example.com" }],
    ["remote logo", { logoPath: "https://example.com/logo.png" }],
    ["SVG logo", { logoPath: "sponsors/acme.svg" }],
    ["path-traversal logo", { logoPath: "sponsors/../acme.png" }],
    ["29-day window", { endsOn: "2026-10-18" }],
    ["31-day window", { endsOn: "2026-10-20" }],
    ["trap-node placement", { nodeId: "trap" }],
  ])("rejects %s", (_label, change) => {
    expect(() => validateSponsorPlacements({ version: 1, placements: [{ ...validPlacement, ...change }] })).toThrow();
  });

  it("rejects unknown fields so private sponsor data cannot silently enter the public config", () => {
    expect(() => validateSponsorPlacements({
      version: 1,
      placements: [validPlacement],
      privateReviewNote: "do not publish",
    })).toThrow(/unknown field privateReviewNote/);
    expect(() => validateSponsorPlacements({
      version: 1,
      placements: [{ ...validPlacement, contactEmail: "private@example.com" }],
    })).toThrow(/unknown field contactEmail/);
  });

  it("allows a router to be reused in a later non-overlapping placement window", () => {
    const placements = validateSponsorPlacements({
      version: 1,
      placements: [
        validPlacement,
        {
          ...validPlacement,
          id: "founding-next",
          brandName: "Next Networks",
          startsOn: "2026-10-20",
          endsOn: "2026-11-18",
        },
      ],
    });

    expect(placements).toHaveLength(2);
    expect(activeSponsorPlacements(placements, "2026-10-19")[0]?.brandName).toBe("Acme Networks");
    expect(activeSponsorPlacements(placements, "2026-10-20")[0]?.brandName).toBe("Next Networks");
  });

  it("rejects overlapping placements on the same router", () => {
    expect(() => validateSponsorPlacements({
      version: 1,
      placements: [
        validPlacement,
        { ...validPlacement, id: "founding-overlap", startsOn: "2026-10-19", endsOn: "2026-11-17" },
      ],
    })).toThrow(/overlap on node edge/);
  });

  it("allows 20 total bookings when repeated routers use non-overlapping windows", () => {
    const placements = validateSponsorPlacements({
      version: 1,
      placements: Array.from({ length: 20 }, (_, index) => scheduledPlacement(index)),
    });

    expect(placements).toHaveLength(20);
    expect(() => validateSponsorPlacements({
      version: 1,
      placements: Array.from({ length: 21 }, (_, index) => scheduledPlacement(index)),
    })).toThrow(/20 total Founding Node bookings/);
  });

  it("permits seven active routers but fails closed above the concurrent capacity", () => {
    const nodeIds = ["edge", "cache", "core", "relay", "transit", "pop", "gateway"] as const;
    const placements = validateSponsorPlacements({
      version: 1,
      placements: nodeIds.map((nodeId, index) => ({
        ...validPlacement,
        id: `founding-live-${index}`,
        nodeId,
      })),
    });

    expect(activeSponsorPlacements(placements, "2026-09-20")).toHaveLength(7);
    expect(() => activeSponsorPlacements([
      ...placements,
      { ...placements[0], id: "forged-eighth-placement" },
    ], "2026-09-20")).toThrow(/7 concurrent Founding Node bookings/);
  });

  it("cannot alter generated topology, link conditions, metrics, or score", () => {
    const before = generatePuzzle("2026-09-20");
    const beforeMetrics = calculateMetrics(before, before.guaranteedRoute);
    const placements = validateSponsorPlacements({ version: 1, placements: [validPlacement] });
    expect(activeSponsorPlacements(placements, "2026-09-20")).toHaveLength(1);

    const after = generatePuzzle("2026-09-20");
    const afterMetrics = calculateMetrics(after, after.guaranteedRoute);
    expect(after).toEqual(before);
    expect(afterMetrics).toEqual(beforeMetrics);
  });

  it("opens only a configured Tally form and otherwise falls back to sponsor policy", () => {
    const fallback = { url: "https://cramzz.space/sponsor-policy", opensForm: false };
    expect(resolveSponsorFormDestination(undefined, "https://cramzz.space")).toEqual(fallback);
    expect(resolveSponsorFormDestination("https://example.com/form", "https://cramzz.space")).toEqual(fallback);
    expect(resolveSponsorFormDestination("http://tally.so/r/demo", "https://cramzz.space")).toEqual(fallback);
    expect(resolveSponsorFormDestination("https://user:pass@tally.so/r/demo", "https://cramzz.space")).toEqual(fallback);
    expect(resolveSponsorFormDestination("https://tally.so/r/demo", "https://cramzz.space")).toEqual({
      url: "https://tally.so/r/demo",
      opensForm: true,
    });
  });
});

function scheduledPlacement(index: number) {
  const startTime = Date.UTC(2026, 0, 1) + index * 30 * 86_400_000;
  const endTime = startTime + 29 * 86_400_000;
  return {
    ...validPlacement,
    id: `founding-slot-${index}`,
    brandName: `Brand ${index + 1}`,
    startsOn: new Date(startTime).toISOString().slice(0, 10),
    endsOn: new Date(endTime).toISOString().slice(0, 10),
  };
}
