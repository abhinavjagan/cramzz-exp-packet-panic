import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const browser = await chromium.launch();

const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await ogPage.goto(new URL("../public/packet-panic-card.svg", import.meta.url).href);
await ogPage.screenshot({
  path: fileURLToPath(new URL("../public/packet-panic-card.png", import.meta.url)),
  animations: "disabled",
});
await ogPage.close();

const screenshotUrl = process.env.SCREENSHOT_URL;
if (screenshotUrl) {
  const screenshotsDirectory = new URL("../docs/screenshots/", import.meta.url);
  await mkdir(screenshotsDirectory, { recursive: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await desktop.goto(screenshotUrl, { waitUntil: "networkidle" });
  await desktop.screenshot({
    path: fileURLToPath(new URL("packet-panic-desktop.png", screenshotsDirectory)),
    fullPage: true,
    animations: "disabled",
  });
  await desktop.close();

  const mobileContext = await browser.newContext({ ...devices["iPhone 15"] });
  const mobile = await mobileContext.newPage();
  await mobile.goto(screenshotUrl, { waitUntil: "networkidle" });
  await mobile.screenshot({
    path: fileURLToPath(new URL("packet-panic-mobile.png", screenshotsDirectory)),
    fullPage: true,
    animations: "disabled",
  });
  await mobileContext.close();
}

await browser.close();
