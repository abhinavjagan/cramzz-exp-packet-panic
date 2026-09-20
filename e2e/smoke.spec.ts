import { expect, test } from "@playwright/test";
import { generatePuzzle, PUZZLE_EPOCH } from "../src/game";

test("a player can deliver the daily packet and copy a share result", async ({ page }) => {
  await page.addInitScript(() => {
    const capturedEvents: string[] = [];
    Object.assign(window, { __capturedEvents: capturedEvents });
    window.addEventListener("cramzz:analytics", (event) => {
      capturedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => { Object.assign(window, { __sharedData: data }); },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { Object.assign(window, { __copiedText: text }); } },
    });
  });
  await page.goto(`?p=${PUZZLE_EPOCH}&source=e2e`);

  const builtManifest = await page.evaluate(async () => {
    const response = await fetch(new URL("experiment.json", window.location.href));
    return response.json() as Promise<{ pinnedCommit: string }>;
  });
  expect(builtManifest.pinnedCommit).toBe(process.env.GITHUB_SHA ?? "UNPINNED");

  await expect(page.getByRole("heading", { name: /Packet Panic/i })).toBeVisible();
  await expect(page.getByText("SCHEDULED INVENTORY · BOOKINGS OPEN")).toBeVisible();
  await expect(page.getByText("FOUNDING BOOKINGS 00/20 TOTAL")).toBeVisible();
  await expect(page.locator(".sponsored-node")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /See the live experiment ledger/i })).toHaveAttribute("href", "/ledger/");

  const puzzle = generatePuzzle(PUZZLE_EPOCH);
  for (const nodeId of puzzle.guaranteedRoute.slice(1)) {
    await page.locator(`[data-node-id="${nodeId}"]`).click();
  }

  await expect(page.getByText("PACKET DELIVERED", { exact: true })).toBeVisible();
  await expect(page.locator("#streak-stat-value")).toContainText("1");
  expect(await capturedAnalyticsEvents(page)).not.toContain("share_opened");
  await page.getByRole("button", { name: /Share result/i }).click();
  expect(await capturedAnalyticsEvents(page)).toContain("share_opened");
  const shareData = await page.evaluate(() => (window as Window & { __sharedData?: ShareData }).__sharedData);
  expect(shareData?.url).toContain(`/e/packet-panic/?p=${PUZZLE_EPOCH}`);
  expect(shareData?.text).not.toContain("https://");
  await page.getByRole("button", { name: "Copy score" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toContain(`Packet Panic #${puzzle.number}`);
});

test("the sponsor policy fallback does not claim that a form opened", async ({ page }) => {
  await page.addInitScript(() => {
    const capturedEvents: string[] = [];
    Object.assign(window, { __capturedEvents: capturedEvents });
    window.addEventListener("cramzz:analytics", (event) => {
      capturedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
    });
  });
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  await page.locator("#sponsor-button").evaluate((element) => {
    element.addEventListener("click", (event) => event.preventDefault());
  });
  await page.getByRole("link", { name: /Book a node/i }).click();

  const events = await capturedAnalyticsEvents(page);
  expect(events).toContain("sponsor_cta_clicked");
  expect(events).not.toContain("sponsor_form_opened");
});

test("copying falls back to the selected textarea when Clipboard API writing fails", async ({ page }) => {
  await page.addInitScript(() => {
    const capturedEvents: string[] = [];
    Object.assign(window, { __capturedEvents: capturedEvents });
    window.addEventListener("cramzz:analytics", (event) => {
      capturedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new DOMException("blocked", "NotAllowedError"); } },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => {
        Object.assign(window, {
          __fallbackCommand: command,
          __fallbackText: (document.activeElement as HTMLTextAreaElement | null)?.value,
        });
        return command === "copy";
      },
    });
  });
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  const puzzle = generatePuzzle(PUZZLE_EPOCH);
  for (const nodeId of puzzle.guaranteedRoute.slice(1)) {
    await page.locator(`[data-node-id="${nodeId}"]`).click();
  }
  await page.getByRole("button", { name: "Copy score" }).click();

  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __fallbackCommand?: string }).__fallbackCommand)).toBe("copy");
  expect(await page.evaluate(() => (window as Window & { __fallbackText?: string }).__fallbackText)).toContain("Packet Panic #1");
  expect(await capturedAnalyticsEvents(page)).toContain("share_completed");
});

test("a failed clipboard fallback does not report a completed share", async ({ page }) => {
  await page.addInitScript(() => {
    const capturedEvents: string[] = [];
    Object.assign(window, { __capturedEvents: capturedEvents });
    window.addEventListener("cramzz:analytics", (event) => {
      capturedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new DOMException("blocked", "NotAllowedError"); } },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  const puzzle = generatePuzzle(PUZZLE_EPOCH);
  for (const nodeId of puzzle.guaranteedRoute.slice(1)) {
    await page.locator(`[data-node-id="${nodeId}"]`).click();
  }
  await page.getByRole("button", { name: "Copy score" }).click();

  await expect(page.locator("#announcer")).toContainText("Copy failed");
  expect(await capturedAnalyticsEvents(page)).not.toContain("share_completed");
});

test("keyboard focus follows every hop through a completed route", async ({ page }) => {
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  const available = page.locator("[data-node-id]:not(:disabled)").first();
  await available.focus();
  await expect(available).toBeFocused();

  let completed = false;
  for (let hop = 1; hop <= 6; hop += 1) {
    await expect(page.locator("[data-node-id]:not(:disabled):focus")).toHaveCount(1);
    await page.keyboard.press("Enter");
    if (await page.getByText("PACKET DELIVERED", { exact: true }).count()) {
      completed = true;
      break;
    }
    await expect(page.locator("[data-node-id]:not(:disabled):focus")).toHaveCount(1);
  }

  expect(completed).toBe(true);
  await expect(page.getByRole("button", { name: /Share result/i })).toBeFocused();
});

test("same-puzzle reloads do not mark a player as returning", async ({ page }) => {
  await page.addInitScript(() => {
    const capturedAnalytics: Array<{ event: string; properties: { returning_player?: boolean } }> = [];
    Object.assign(window, { __capturedAnalytics: capturedAnalytics });
    window.addEventListener("cramzz:analytics", (event) => {
      capturedAnalytics.push((event as CustomEvent<{
        event: string;
        properties: { returning_player?: boolean };
      }>).detail);
    });
  });
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  const puzzle = generatePuzzle(PUZZLE_EPOCH);
  for (const nodeId of puzzle.guaranteedRoute.slice(1)) {
    await page.locator(`[data-node-id="${nodeId}"]`).click();
  }

  await page.reload();
  expect(await returningPlayerForExperimentView(page)).toBe(false);

  await page.evaluate((previousPuzzleId) => {
    const storageKey = Object.keys(localStorage)
      .find((key) => key.startsWith("cramzz:packet-panic:progress:v2:"));
    if (!storageKey) throw new Error("Player progress was not stored");
    const progress = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
      completions: Record<string, unknown>;
    };
    progress.completions[previousPuzzleId] = {
      puzzleId: previousPuzzleId,
      won: true,
      score: 800,
      grade: "A",
      hops: 4,
      completedAt: `${previousPuzzleId}T10:00:00Z`,
    };
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }, offsetDate(PUZZLE_EPOCH, -1));

  await page.reload();
  expect(await returningPlayerForExperimentView(page)).toBe(true);
});

test("mobile layout stays inside the viewport", async ({ page }) => {
  await page.goto(`?p=${offsetDate(PUZZLE_EPOCH, 2)}`);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
  await expect(page.getByRole("link", { name: /Book a node/i })).toBeVisible();
});

test("a loaded puzzle remains playable when the network goes offline", async ({ page, context }) => {
  const puzzle = generatePuzzle(PUZZLE_EPOCH);
  await page.goto(`?p=${PUZZLE_EPOCH}`);
  await context.setOffline(true);
  await expect(page.getByText("Offline · game still works", { exact: true })).toBeVisible();

  for (const nodeId of puzzle.guaranteedRoute.slice(1)) {
    await page.locator(`[data-node-id="${nodeId}"]`).click();
  }
  await expect(page.getByText("PACKET DELIVERED", { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test("interactive routes stay named and reduced-motion preferences are honored", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`?p=${PUZZLE_EPOCH}`);

  const nextHops = page.locator("[data-node-id]:not(:disabled)");
  expect(await nextHops.count()).toBeGreaterThan(0);
  for (let index = 0; index < await nextHops.count(); index += 1) {
    await expect(nextHops.nth(index)).toHaveAttribute("aria-label", /^Route to /);
  }
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
  const animationDuration = await page.locator(".network-node.available .node-pulse").first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(animationDuration).toBeLessThanOrEqual(0.001);
});

async function capturedAnalyticsEvents(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => (window as Window & { __capturedEvents?: string[] }).__capturedEvents ?? []);
}

async function returningPlayerForExperimentView(page: import("@playwright/test").Page): Promise<boolean | undefined> {
  return page.evaluate(() => {
    const captured = (window as Window & {
      __capturedAnalytics?: Array<{ event: string; properties: { returning_player?: boolean } }>;
    }).__capturedAnalytics ?? [];
    return captured.find((entry) => entry.event === "experiment_view")?.properties.returning_player;
  });
}

function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
