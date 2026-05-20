import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { inspect } from "../src/inspect.js";
import {
  ERROR_PENALTY_POINTS,
  PERFECT_SCORE,
  WARNING_PENALTY_POINTS,
} from "@react-doctor/core";
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

  // itall fork regression: 외부 score API 가 사라지고 로컬 산식으로 전환된 뒤에도
  // `design`-tag diagnostics 가 점수에 반영되지 않아야 한다 (`score` surface 사전
  // 필터링 동작 보존). 점수 = PERFECT_SCORE - errors*ERROR_PENALTY - warnings*WARNING_PENALTY
  // 라는 산식을 non-design diagnostics 에만 적용한 결과와 일치해야 한다.
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
        (diagnostic) =>
          !(diagnostic.plugin === "react-doctor" && hasDesignTag(diagnostic.rule)),
      );
      const errorCount = nonDesignDiagnostics.filter((d) => d.severity === "error").length;
      const warningCount = nonDesignDiagnostics.filter((d) => d.severity === "warning").length;
      const expectedScore = Math.max(
        0,
        PERFECT_SCORE - errorCount * ERROR_PENALTY_POINTS - warningCount * WARNING_PENALTY_POINTS,
      );

      expect(result.score).not.toBeNull();
      expect(result.score?.score).toBe(expectedScore);
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
      expect(printedText).toContain(`${baselineDesignCount} demoted from the cli surface`);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
