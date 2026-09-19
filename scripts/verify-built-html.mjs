import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const canonical = /<link\s+rel="canonical"\s+href="https:\/\/cramzz\.space\/e\/packet-panic\/"\s*\/?>/g;
const openGraphUrl = /<meta\s+property="og:url"\s+content="https:\/\/cramzz\.space\/e\/packet-panic\/"\s*\/?>/g;

assert.equal(html.match(canonical)?.length ?? 0, 1, "production HTML must contain one absolute canonical URL");
assert.equal(html.match(openGraphUrl)?.length ?? 0, 1, "production HTML must contain one absolute Open Graph URL");
assert.match(html, /<meta\s+property="og:image"\s+content="https:\/\/cramzz\.space\/e\/packet-panic\/packet-panic-card\.png"\s*\/?>/);
console.log("Built crawler metadata verified.");
