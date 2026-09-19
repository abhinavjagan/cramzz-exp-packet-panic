import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../experiment.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../dist/experiment.json", import.meta.url), "utf8"));
const expected = process.argv[2] ?? process.env.EXPERIMENT_SOURCE_COMMIT?.trim();

validateManifest(source, "source manifest");
validateManifest(manifest, "built manifest");
assert.equal(source.pinnedCommit, "UNPINNED", "source manifest must declare its self-reference as UNPINNED");
assert.equal(manifest.slug, "packet-panic", "built manifest slug changed");
if (expected) {
  assert.match(expected, /^[0-9a-f]{40}$/i, "expected source commit is not a full Git SHA");
  assert.equal(manifest.pinnedCommit, expected.toLowerCase(), "built manifest source pin is wrong");
} else {
  assert.equal(manifest.pinnedCommit, "UNPINNED", "an unpinned local build must not pretend to have a source commit");
}
console.log(`Built manifest verified (${manifest.pinnedCommit ?? "unpinned local preview"}).`);

function validateManifest(candidate, label) {
  assert(candidate && typeof candidate === "object" && !Array.isArray(candidate), `${label} must be an object`);
  const allowed = new Set([
    "$schema", "slug", "title", "repository", "pinnedCommit", "status", "launchDate",
    "hypothesis", "sponsorInventory", "analyticsIdentifier",
  ]);
  assert.deepEqual(Object.keys(candidate).filter((key) => !allowed.has(key)), [], `${label} has unknown properties`);
  for (const required of ["slug", "title", "repository", "pinnedCommit", "status", "launchDate", "hypothesis", "sponsorInventory", "analyticsIdentifier"]) {
    assert(Object.hasOwn(candidate, required), `${label} is missing ${required}`);
  }
  assert.match(candidate.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} slug is invalid`);
  assert(typeof candidate.title === "string" && candidate.title.length >= 1 && candidate.title.length <= 80, `${label} title is invalid`);
  assert.match(candidate.repository, /^https:\/\/github\.com\/abhinavjagan\//, `${label} repository is invalid`);
  assert.match(candidate.pinnedCommit, /^(UNPINNED|[0-9a-f]{40})$/, `${label} pin is invalid`);
  assert(["backlog", "building", "testing", "scaled", "iterating", "retired"].includes(candidate.status), `${label} status is invalid`);
  assert(candidate.launchDate === null || isCalendarDate(candidate.launchDate), `${label} launch date is invalid`);
  if (["backlog", "building"].includes(candidate.status)) {
    assert.equal(candidate.launchDate, null, `${label} pre-launch status must keep launchDate null`);
  } else {
    assert(typeof candidate.launchDate === "string" && isCalendarDate(candidate.launchDate), `${label} launched status requires launchDate`);
  }
  assert(typeof candidate.hypothesis === "string" && candidate.hypothesis.length >= 20 && candidate.hypothesis.length <= 500, `${label} hypothesis is invalid`);
  assert(Array.isArray(candidate.sponsorInventory), `${label} sponsorInventory must be an array`);
  for (const item of candidate.sponsorInventory) validateSponsorItem(item, label);
  assert.match(candidate.analyticsIdentifier, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} analyticsIdentifier is invalid`);
}

function validateSponsorItem(item, label) {
  assert(item && typeof item === "object" && !Array.isArray(item), `${label} sponsor item must be an object`);
  const keys = Object.keys(item).sort();
  assert.deepEqual(keys, ["id", "label", "priceInr", "quantity", "status"], `${label} sponsor item shape is invalid`);
  assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} sponsor id is invalid`);
  assert(typeof item.label === "string" && item.label.trim().length > 0, `${label} sponsor label is invalid`);
  assert(Number.isInteger(item.priceInr) && item.priceInr >= 0, `${label} sponsor price is invalid`);
  assert(Number.isInteger(item.quantity) && item.quantity >= 0, `${label} sponsor quantity is invalid`);
  assert(["locked", "available", "sold-out", "retired"].includes(item.status), `${label} sponsor status is invalid`);
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}
