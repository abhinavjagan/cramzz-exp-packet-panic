import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { normalizeBase } from "./src/base-path";
import { resolvePuzzleEpoch } from "./src/puzzle-epoch";
import { validateSponsorAssetBytes } from "./src/sponsor-assets";
import { SPONSOR_PLACEMENTS } from "./src/sponsors";

function sourceExperimentManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL("./experiment.json", import.meta.url), "utf8")) as Record<string, unknown>;
}

function stampedExperimentManifest(manifest: Record<string, unknown>): string {
  const requestedCommit = process.env.EXPERIMENT_SOURCE_COMMIT?.trim() || undefined;
  if (requestedCommit && !/^[0-9a-f]{40}$/i.test(requestedCommit)) {
    throw new Error("EXPERIMENT_SOURCE_COMMIT must be an exact 40-character Git commit SHA");
  }
  return `${JSON.stringify({
    ...manifest,
    pinnedCommit: requestedCommit?.toLowerCase() ?? manifest.pinnedCommit,
  }, null, 2)}\n`;
}

function publicPuzzleConfig(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(resolvePuzzleEpoch(
    manifest.launchDate,
    process.env.VITE_PREVIEW_PUZZLE_EPOCH,
  ), null, 2)}\n`;
}

function verifySponsorAssets(): void {
  for (const placement of SPONSOR_PLACEMENTS) {
    if (!placement.logoPath) continue;
    const asset = new URL(`./public/${placement.logoPath}`, import.meta.url);
    if (!existsSync(asset)) throw new Error(`Missing local sponsor logo: public/${placement.logoPath}`);
    validateSponsorAssetBytes(placement.logoPath, readFileSync(asset));
  }
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH),
  plugins: [{
    name: "stamp-experiment-manifest",
    apply: "build",
    buildStart() {
      verifySponsorAssets();
    },
    generateBundle() {
      const manifest = sourceExperimentManifest();
      this.emitFile({ type: "asset", fileName: "experiment.json", source: stampedExperimentManifest(manifest) });
      this.emitFile({ type: "asset", fileName: "puzzle-config.json", source: publicPuzzleConfig(manifest) });
    },
  }],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
