import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { selectProjects } from "../src/cli/utils/select-projects.js";
import { writeJson } from "./regressions/_helpers.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rd-select-projects-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

interface ConsoleLogHandle {
  capturedMessages: string[];
  restore: () => void;
}

const captureConsoleLog = (): ConsoleLogHandle => {
  const capturedMessages: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    capturedMessages.push(args.map(String).join(" "));
  });
  return {
    capturedMessages,
    restore: () => spy.mockRestore(),
  };
};

const buildWorkspace = (caseId: string, packageNames: string[]): string => {
  const rootDirectory = path.join(tempRoot, caseId);
  fs.mkdirSync(rootDirectory, { recursive: true });
  writeJson(path.join(rootDirectory, "package.json"), {
    name: caseId,
    private: true,
    workspaces: ["packages/*"],
  });

  for (const packageName of packageNames) {
    const directoryName = packageName.replace("@scope/", "");
    writeJson(path.join(rootDirectory, "packages", directoryName, "package.json"), {
      name: packageName,
      dependencies: { react: "^19.0.0" },
    });
  }

  return rootDirectory;
};

describe("selectProjects", () => {
  let consoleHandle: ConsoleLogHandle;

  beforeEach(() => {
    consoleHandle = captureConsoleLog();
  });

  afterEach(() => {
    consoleHandle.restore();
  });

  it("prints scanning wording when -y auto-selects multiple workspace projects", async () => {
    const rootDirectory = buildWorkspace("multi-auto", ["@scope/app", "@scope/admin"]);

    await selectProjects(rootDirectory, undefined, true);

    const output = consoleHandle.capturedMessages.join("\n");
    expect(output).toContain("Scanning projects");
    expect(output).not.toContain("Select projects to scan");
  });

  it("prints scanning wording when a single workspace project is selected automatically", async () => {
    const rootDirectory = buildWorkspace("single-auto", ["@scope/app"]);

    await selectProjects(rootDirectory, undefined, true);

    const output = consoleHandle.capturedMessages.join("\n");
    expect(output).toContain("Scanning project");
    expect(output).not.toContain("Select projects to scan");
  });
});
