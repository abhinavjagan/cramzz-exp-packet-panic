import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTY_NAMES,
  analyticsOptedOut,
  capture,
  classifyReferrer,
  createDirectPostHogTransport,
  getRotatingAnonymousId,
  sanitizeAnalyticsProperties,
} from "../src/analytics";

describe("privacy-safe analytics adapter", () => {
  it("drops every property outside the approved allowlist", () => {
    expect(sanitizeAnalyticsProperties({
      experiment_id: "packet-panic-v1",
      puzzle_id: "2026-09-20",
      email: "do-not-send@example.com",
      ip: "127.0.0.1",
      grade: "A",
      source: "launch_post",
      campaign: "person@example.com",
    })).toEqual({
      experiment_id: "packet-panic-v1",
      puzzle_id: "2026-09-20",
      grade: "A",
      source: "launch_post",
    });
  });

  it("rejects free-form identifiers, invalid enums, and out-of-range score data", () => {
    expect(sanitizeAnalyticsProperties({
      experiment_id: "x".repeat(65),
      puzzle_id: "2026/09/20",
      source: "someone@example.com",
      campaign: "launch campaign",
      referrer_class: "email",
      outcome: "maybe",
      grade: "S+",
      returning_player: "yes",
      latency_ms: -1,
      reliability_pct: 100.1,
      hops: 7,
    })).toEqual({});
  });

  it("rejects fractional hop counts", () => {
    expect(sanitizeAnalyticsProperties({ hops: 5.5 })).toEqual({});
  });

  it("accepts only bounded, non-identifying gameplay properties", () => {
    expect(sanitizeAnalyticsProperties({
      referrer_class: "social",
      outcome: "delivered",
      grade: "S",
      returning_player: true,
      latency_ms: 10_000,
      reliability_pct: 99.9,
      hops: 6,
    })).toEqual({
      referrer_class: "social",
      outcome: "delivered",
      grade: "S",
      returning_player: true,
      latency_ms: 10_000,
      reliability_pct: 99.9,
      hops: 6,
    });
  });

  it("works without an analytics SDK and dispatches a local integration event", () => {
    const listener = vi.fn();
    window.addEventListener("cramzz:analytics", listener);

    expect(() => capture("experiment_view", { experiment_id: "packet-panic-v1" })).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("cramzz:analytics", listener);
  });

  it("keeps development and incomplete production configuration network-silent", () => {
    expect(createDirectPostHogTransport({ production: false, key: "phc_public", host: "https://us.i.posthog.com" })).toBeNull();
    expect(createDirectPostHogTransport({ production: true, host: "https://us.i.posthog.com" })).toBeNull();
    expect(createDirectPostHogTransport({ production: true, key: "phc_public", host: "http://insecure.example" })).toBeNull();
    expect(createDirectPostHogTransport({ production: true, key: "phc_public", host: "https://analytics.example" })).toBeNull();
  });

  it("sends anonymous, geo-disabled events directly to the official ingestion path", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = createDirectPostHogTransport({
      production: true,
      key: "phc_public",
      host: "https://eu.i.posthog.com/untrusted/path?ignored=yes",
      fetcher,
      storage: memoryStorage(),
      now: () => 1_000,
      createId: () => "anon_1234567890abcdef",
      privacySignals: {},
    });

    await transport?.send("game_complete", { outcome: "delivered", hops: 4 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, request] = fetcher.mock.calls[0];
    expect(String(endpoint)).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(request?.credentials).toBe("omit");
    expect(request?.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(String(request?.body))).toEqual({
      api_key: "phc_public",
      event: "game_complete",
      distinct_id: "anon_1234567890abcdef",
      properties: {
        outcome: "delivered",
        hops: 4,
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  });

  it("respects DNT and Global Privacy Control", () => {
    expect(analyticsOptedOut({ doNotTrack: "1" })).toBe(true);
    expect(analyticsOptedOut({ doNotTrack: "yes" })).toBe(true);
    expect(analyticsOptedOut({ globalPrivacyControl: true })).toBe(true);
    expect(analyticsOptedOut({ doNotTrack: "0", globalPrivacyControl: false })).toBe(false);
    expect(createDirectPostHogTransport({
      production: true,
      key: "phc_public",
      host: "https://us.i.posthog.com",
      privacySignals: { globalPrivacyControl: true },
    })).toBeNull();
  });

  it("keeps an anonymous ID for 30 days, then rotates it", () => {
    const storage = memoryStorage();
    const ids = ["anon_1111111111111111", "anon_2222222222222222"];
    const createId = () => ids.shift() ?? "anon_3333333333333333";
    const first = getRotatingAnonymousId(storage, 1_000, createId);
    const same = getRotatingAnonymousId(storage, 1_000 + 29 * 86_400_000, createId);
    const rotated = getRotatingAnonymousId(storage, 1_000 + 30 * 86_400_000, createId);

    expect(first).toBe("anon_1111111111111111");
    expect(same).toBe(first);
    expect(rotated).toBe("anon_2222222222222222");
  });

  it("replaces a legacy ID that the hub would reject", () => {
    const storage = memoryStorage();
    storage.setItem("cramzz.analytics.anonymous-id.v1", JSON.stringify({ id: "raw-legacy-uuid", createdAt: 1_000 }));
    expect(getRotatingAnonymousId(storage, 2_000, () => "anon_4444444444444444"))
      .toBe("anon_4444444444444444");
  });

  it("classifies referrers without retaining their URLs", () => {
    expect(classifyReferrer("", "cramzz.space")).toBe("direct");
    expect(classifyReferrer("https://cramzz.space/", "cramzz.space")).toBe("internal");
    expect(classifyReferrer("https://x.com/some-post", "cramzz.space")).toBe("social");
    expect(classifyReferrer("https://example.com/post", "cramzz.space")).toBe("referral");
  });
});

describe("machine-readable analytics contract", () => {
  it("matches the runtime allowlists and keeps every privacy capability disabled", async () => {
    const contract = (await import("../analytics-contract.json")).default;
    expect(contract.events).toEqual(ANALYTICS_EVENTS);
    expect(Object.keys(contract.properties)).toEqual([...ANALYTICS_PROPERTY_NAMES]);
    expect(contract.properties).toEqual({
      experiment_id: { type: "token", maxLength: 64, pattern: "^[A-Za-z0-9._-]+$" },
      puzzle_id: { type: "token", maxLength: 64, pattern: "^[A-Za-z0-9._-]+$" },
      source: { type: "token", maxLength: 64, pattern: "^[A-Za-z0-9._-]+$" },
      campaign: { type: "token", maxLength: 64, pattern: "^[A-Za-z0-9._-]+$" },
      referrer_class: { type: "enum", values: ["direct", "internal", "search", "social", "referral"] },
      returning_player: { type: "boolean" },
      outcome: { type: "enum", values: ["delivered", "dropped"] },
      latency_ms: { type: "number", minimum: 0, maximum: 10_000 },
      reliability_pct: { type: "number", minimum: 0, maximum: 100 },
      hops: { type: "integer", minimum: 0, maximum: 6 },
      grade: { type: "enum", values: ["S", "A", "B", "C", "D"] },
    });
    expect(Object.values(contract.privacy)).toEqual([false, false, false, false, false, false]);
  });
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}
