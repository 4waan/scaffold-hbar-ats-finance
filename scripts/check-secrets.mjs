import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignored = new Set([
  ".git",
  ".next",
  ".yarn",
  "node_modules",
  "out",
  "cache",
  "broadcast",
  "playwright-report",
  "test-results",
]);
const ignoredFiles = new Set(["yarn.lock"]);
const patterns = [
  {
    name: "private key assignment",
    pattern: /(PRIVATE_KEY|OPERATOR_KEY|MNEMONIC)\s*=\s*(0x)?[0-9a-fA-F]{32,}/,
  },
  { name: "PEM private key", pattern: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/ },
  {
    name: "mnemonic assignment",
    pattern: /MNEMONIC\s*=\s*["']?(?:[a-z]+\s+){11}[a-z]+/i,
  },
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(full)));
    else if (!ignoredFiles.has(entry.name) && !entry.name.endsWith(".png"))
      found.push(full);
  }
  return found;
}

const findings = [];
for (const file of await files(".")) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }
  for (const item of patterns) {
    if (item.pattern.test(content)) findings.push(`${file}: ${item.name}`);
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("No credential-shaped content found in project files.");
