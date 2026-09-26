import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function gitOutput(arguments_, workingDirectory) {
  const result = spawnSync("git", arguments_, {
    cwd: workingDirectory,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw (
      result.error ??
      new Error(result.stderr.trim() || `git ${arguments_.join(" ")} failed`)
    );
  }

  return result.stdout;
}

function workingFiles(workingDirectory = process.cwd()) {
  const output = gitOutput(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    workingDirectory,
  );

  return [...new Set(output.split("\0").filter(Boolean))].sort();
}

function gitStatus(workingDirectory = process.cwd()) {
  return gitOutput(
    ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    workingDirectory,
  );
}

export function workingTreeSnapshot(workingDirectory = process.cwd()) {
  const hash = createHash("sha256");
  hash.update(gitStatus(workingDirectory));
  hash.update("\0");

  for (const file of workingFiles(workingDirectory)) {
    hash.update(file);
    hash.update("\0");

    const absolutePath = path.join(workingDirectory, file);
    if (!existsSync(absolutePath)) {
      hash.update("missing\0");
      continue;
    }

    const stat = lstatSync(absolutePath);
    hash.update(String(stat.mode));
    hash.update("\0");

    if (stat.isSymbolicLink()) {
      hash.update("symlink\0");
      hash.update(readlinkSync(absolutePath));
    } else if (stat.isFile()) {
      hash.update("file\0");
      hash.update(readFileSync(absolutePath));
    } else if (stat.isDirectory()) {
      // A tracked gitlink is represented by a directory in the worktree.
      // Git status already captures its staged identity and dirty state.
      hash.update("directory\0");
    } else {
      hash.update("other\0");
    }
    hash.update("\0");
  }

  return hash.digest("hex");
}
