import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vite-plus/test";
import { inspectAction } from "../src/cli/commands/inspect.js";
import { initGitRepo, writeFile, writeJson } from "./regressions/_helpers.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rd-inspect-diff-monorepo-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const commitAll = (cwd: string, message: string): void => {
  spawnSync("git", ["add", "."], { cwd });
  spawnSync("git", ["commit", "-q", "-m", message], { cwd });
};

const captureStdout = (): { lines: string[]; restore: () => void } => {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(((
    chunk: string | Uint8Array,
  ) => {
    lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as never);
  return { lines, restore: () => spy.mockRestore() };
};

describe("inspectAction monorepo diff", () => {
  it("does not full-scan workspace projects when root-only files changed", async () => {
    const rootDirectory = path.join(tempRoot, "root-only-change");
    writeJson(path.join(rootDirectory, "package.json"), {
      name: "root-only-change",
      private: true,
      workspaces: ["apps/*"],
    });
    writeJson(path.join(rootDirectory, "apps", "web", "package.json"), {
      name: "@scope/web",
      dependencies: { react: "^19.0.0" },
    });
    writeFile(
      path.join(rootDirectory, "apps", "web", "src", "app.tsx"),
      "export const App = () => null;\n",
    );
    initGitRepo(rootDirectory);
    commitAll(rootDirectory, "init");
    writeJson(path.join(rootDirectory, "package.json"), {
      name: "root-only-change",
      private: true,
      version: "1.0.1",
      workspaces: ["apps/*"],
    });

    const stdout = captureStdout();
    try {
      await inspectAction(rootDirectory, {
        diff: true,
        failOn: "none",
        json: true,
        jsonCompact: true,
        lint: false,
      });
    } finally {
      stdout.restore();
    }

    const report = JSON.parse(stdout.lines.join(""));
    expect(report.mode).toBe("diff");
    expect(report.diff.changedFileCount).toBe(1);
    expect(report.projects).toEqual([]);
    expect(report.diagnostics).toEqual([]);
  });
});
