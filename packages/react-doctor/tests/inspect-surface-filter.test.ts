import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { inspect } from "../src/inspect.js";
import { calculateScore } from "@react-doctor/core";
import path from "node:path";
import reactDoctorPlugin from "oxlint-plugin-react-doctor";

vi.mock("ora", () => ({
  default: () => ({
    text: "",
    start: function () {
      return this;
    },
    stop: function () {
      return this;
    },
    succeed: () => {},
    fail: () => {},
  }),
}));

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");

const hasDesignTag = (ruleId: string): boolean =>
  reactDoctorPlugin.rules[ruleId]?.tags?.includes("design") ?? false;

describe("inspect — score surface filter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("excludes `design`-tagged diagnostics from the local score input", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const result = await inspect(path.join(FIXTURES_DIRECTORY, "basic-react"), {
        lint: true,
      });

      const returnedDesignDiagnostics = result.diagnostics.filter(
        (diagnostic) => diagnostic.plugin === "react-doctor" && hasDesignTag(diagnostic.rule),
      );
      expect(returnedDesignDiagnostics.length).toBeGreaterThan(0);

      const nonDesignDiagnostics = result.diagnostics.filter(
        (diagnostic) => !(diagnostic.plugin === "react-doctor" && hasDesignTag(diagnostic.rule)),
      );
      const expectedScore = calculateScore(nonDesignDiagnostics, {
        checkedFileCount: result.project.sourceFileCount,
      });

      expect(result.score).not.toBeNull();
      expect(result.score?.score).toBe(expectedScore.score);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // Regression for the Bugbot finding on upstream #271: the `cli` outputSurface
  // used to short-circuit to the raw diagnostic list, which silently
  // dropped any user-configured `surfaces.cli.exclude*` controls before
  // the printed output rendered. The filter now always runs so user
  // overrides on the cli surface flow through end-to-end.
  it("honors user-configured `surfaces.cli` overrides on the printed output", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const printedLines: string[] = [];
    consoleSpy.mockImplementation((...args: unknown[]) => {
      printedLines.push(args.map(String).join(" "));
    });

    try {
      const baselineResult = await inspect(path.join(FIXTURES_DIRECTORY, "basic-react"), {
        lint: true,
      });
      const baselineDesignCount = baselineResult.diagnostics.filter(
        (diagnostic) =>
          diagnostic.plugin === "react-doctor" &&
          (reactDoctorPlugin.rules[diagnostic.rule]?.tags?.includes("design") ?? false),
      ).length;
      expect(baselineDesignCount).toBeGreaterThan(0);
      printedLines.length = 0;

      await inspect(path.join(FIXTURES_DIRECTORY, "basic-react"), {
        lint: true,
        outputSurface: "cli",
        configOverride: { surfaces: { cli: { excludeTags: ["design"] } } },
      });

      const printedText = printedLines.join("\n");
      expect(printedText).toContain(`cli surface에서 ${baselineDesignCount}건 제외됨`);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
