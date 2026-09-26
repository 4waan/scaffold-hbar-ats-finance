import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const scripts = [
  "format:check",
  "lint",
  "typecheck",
  "recipe:check",
  "check:dead-code",
  "foundry:build",
  "foundry:test",
  "foundry:fuzz",
  "foundry:invariant",
  "test:runner",
  "test:e2e",
  "test:e2e:live",
  "next:build",
  "test:e2e:production",
  "check:routes",
  "check:ats-abi",
  "check:secrets",
  "harness:validate",
];
const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";

function workingFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    throw (
      result.error ?? new Error(result.stderr.trim() || "git ls-files failed")
    );
  }

  return [...new Set(result.stdout.split("\0").filter(Boolean))].sort();
}

function gitStatus() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    {
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    throw (
      result.error ?? new Error(result.stderr.trim() || "git status failed")
    );
  }

  return result.stdout;
}

function workingTreeSnapshot() {
  const hash = createHash("sha256");
  hash.update(gitStatus());
  hash.update("\0");

  for (const file of workingFiles()) {
    hash.update(file);
    hash.update("\0");

    if (!existsSync(file)) {
      hash.update("missing\0");
      continue;
    }

    const stat = lstatSync(file);
    hash.update(String(stat.mode));
    hash.update("\0");
    hash.update(
      stat.isSymbolicLink() ? readlinkSync(file) : readFileSync(file),
    );
    hash.update("\0");
  }

  return hash.digest("hex");
}

const initialSnapshot = workingTreeSnapshot();
let failedScript = null;

for (const script of scripts) {
  process.stdout.write(`\n[release] yarn ${script}\n`);
  const result = spawnSync(yarnCommand, [script], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    failedScript = script;
    if (result.error) console.error(result.error.message);
    break;
  }
}

const finalSnapshot = workingTreeSnapshot();

if (initialSnapshot !== finalSnapshot) {
  console.error(
    "Release validation changed tracked files. Review the diff and run it again.",
  );
  process.exit(1);
}

if (failedScript) {
  console.error(`Release validation stopped at yarn ${failedScript}.`);
  process.exit(1);
}

console.log("Release validation passed without changing tracked files.");
