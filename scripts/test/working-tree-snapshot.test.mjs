import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { workingTreeSnapshot } from "../lib/working-tree-snapshot.mjs";

function git(workingDirectory, arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: workingDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function initializeRepository(workingDirectory) {
  git(workingDirectory, ["init"]);
  git(workingDirectory, ["config", "user.name", "Snapshot Test"]);
  git(workingDirectory, ["config", "user.email", "snapshot@test.invalid"]);
}

function temporaryRepository() {
  const workingDirectory = mkdtempSync(
    path.join(os.tmpdir(), "collateral-rail-snapshot-"),
  );
  initializeRepository(workingDirectory);
  return workingDirectory;
}

test("snapshot handles a tracked gitlink directory", () => {
  const workingDirectory = temporaryRepository();
  try {
    writeFileSync(path.join(workingDirectory, "tracked.txt"), "root\n");
    git(workingDirectory, ["add", "tracked.txt"]);
    git(workingDirectory, ["commit", "-m", "Add root file"]);

    const dependency = path.join(workingDirectory, "vendor", "dependency");
    mkdirSync(dependency, { recursive: true });
    initializeRepository(dependency);
    writeFileSync(path.join(dependency, "dependency.txt"), "dependency\n");
    git(dependency, ["add", "dependency.txt"]);
    git(dependency, ["commit", "-m", "Add dependency file"]);
    const dependencyCommit = git(dependency, ["rev-parse", "HEAD"]);

    git(workingDirectory, [
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${dependencyCommit},vendor/dependency`,
    ]);

    const first = workingTreeSnapshot(workingDirectory);
    const second = workingTreeSnapshot(workingDirectory);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(second, first);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("snapshot changes for tracked and untracked file mutations", () => {
  const workingDirectory = temporaryRepository();
  try {
    const tracked = path.join(workingDirectory, "tracked.txt");
    writeFileSync(tracked, "initial\n");
    git(workingDirectory, ["add", "tracked.txt"]);
    git(workingDirectory, ["commit", "-m", "Add tracked file"]);

    const initial = workingTreeSnapshot(workingDirectory);
    writeFileSync(tracked, "changed\n");
    const trackedChange = workingTreeSnapshot(workingDirectory);
    assert.notEqual(trackedChange, initial);

    writeFileSync(tracked, "initial\n");
    assert.equal(workingTreeSnapshot(workingDirectory), initial);

    writeFileSync(path.join(workingDirectory, "untracked.txt"), "new\n");
    assert.notEqual(workingTreeSnapshot(workingDirectory), initial);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
