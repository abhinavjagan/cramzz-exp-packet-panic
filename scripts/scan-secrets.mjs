import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, relative } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "dist", "coverage", "playwright-report", "test-results"]);
const textExtensions = new Set([".html", ".json", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml", ".css", ".svg"]);
const patterns = [
  { name: "private key", value: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", value: /gh[pousr]_[A-Za-z0-9_]{30,}/ },
  { name: "Razorpay live key", value: /rzp_live_[A-Za-z0-9]{12,}/ },
  { name: "generic credential", value: /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"'\s]{16,}["']/i },
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => !ignored.has(entry.name)).map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const matches = [];
for (const file of await files(root)) {
  if (file.endsWith("scripts/scan-secrets.mjs")) continue;
  if (!textExtensions.has(extname(file)) && !file.endsWith(".env.example")) continue;
  const content = await readFile(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.value.test(content)) matches.push(`${relative(root, file)}: ${pattern.name}`);
  }
}

if (matches.length > 0) {
  console.error(`Potential secrets found:\n${matches.join("\n")}`);
  process.exit(1);
}
console.log("Secret scan passed.");
