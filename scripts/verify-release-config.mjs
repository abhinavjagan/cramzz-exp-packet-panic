import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceManifest = JSON.parse(await readFile(new URL("../experiment.json", import.meta.url), "utf8"));
const builtManifest = JSON.parse(await readFile(new URL("../dist/experiment.json", import.meta.url), "utf8"));
const puzzleConfig = JSON.parse(await readFile(new URL("../dist/puzzle-config.json", import.meta.url), "utf8"));

assert.equal(builtManifest.launchDate, sourceManifest.launchDate, "built and source launchDate differ");
assert.equal(puzzleConfig.launchDate, builtManifest.launchDate, "public puzzle config and manifest launchDate differ");

if (builtManifest.launchDate === null) {
  assert.equal(puzzleConfig.mode, "preview", "an unconfigured launch must identify itself as preview");
  assert.match(puzzleConfig.puzzleEpoch, /^\d{4}-\d{2}-\d{2}$/, "preview puzzle epoch is invalid");
  assert.notEqual(process.env.REQUIRE_LAUNCH_DATE, "true", "release requires a real launchDate in experiment.json");
} else {
  assert.equal(puzzleConfig.mode, "configured", "a configured launch cannot use preview mode");
  assert.equal(puzzleConfig.puzzleEpoch, builtManifest.launchDate, "puzzle epoch must equal the public launchDate");
}

console.log(`Puzzle epoch verified (${puzzleConfig.mode}: ${puzzleConfig.puzzleEpoch}).`);
