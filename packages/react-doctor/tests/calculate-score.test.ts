import { describe, expect, it } from "vite-plus/test";
import {
  ERROR_PENALTY_POINTS,
  PERFECT_SCORE,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
  WARNING_PENALTY_POINTS,
  calculateScore,
} from "@react-doctor/core";
import type { Diagnostic } from "@react-doctor/types";

// itall fork: 외부 API 호출이 제거되고 로컬 weight 기반으로 점수가 계산된다.
// 산식: max(0, PERFECT_SCORE - errors*ERROR_PENALTY - warnings*WARNING_PENALTY)
const buildDiagnostic = (severity: Diagnostic["severity"]): Diagnostic => ({
  filePath: "src/App.tsx",
  plugin: "react-doctor",
  rule: "test-rule",
  severity,
  message: "test",
  line: 1,
  column: 1,
});

describe("calculateScore", () => {
  it("returns PERFECT_SCORE / Healthy when there are no diagnostics", () => {
    const result = calculateScore([]);
    expect(result.score).toBe(PERFECT_SCORE);
    expect(result.label).toBe("Healthy");
  });

  it("subtracts ERROR_PENALTY_POINTS per error diagnostic", () => {
    const errors = [buildDiagnostic("error"), buildDiagnostic("error")];
    const result = calculateScore(errors);
    expect(result.score).toBe(PERFECT_SCORE - 2 * ERROR_PENALTY_POINTS);
  });

  it("subtracts WARNING_PENALTY_POINTS per warning diagnostic", () => {
    const warnings = [buildDiagnostic("warning"), buildDiagnostic("warning"), buildDiagnostic("warning")];
    const result = calculateScore(warnings);
    expect(result.score).toBe(PERFECT_SCORE - 3 * WARNING_PENALTY_POINTS);
  });

  it("clamps to 0 when penalties exceed PERFECT_SCORE", () => {
    const manyErrors = Array.from({ length: 50 }, () => buildDiagnostic("error"));
    const result = calculateScore(manyErrors);
    expect(result.score).toBe(0);
    expect(result.label).toBe("Critical");
  });

  it('labels "Needs attention" between SCORE_OK_THRESHOLD and SCORE_GOOD_THRESHOLD', () => {
    // Two errors + two warnings = 100 - 20 - 6 = 74 (just under Healthy at 75)
    const mixed = [
      buildDiagnostic("error"),
      buildDiagnostic("error"),
      buildDiagnostic("warning"),
      buildDiagnostic("warning"),
    ];
    const result = calculateScore(mixed);
    expect(result.score).toBeLessThan(SCORE_GOOD_THRESHOLD);
    expect(result.score).toBeGreaterThanOrEqual(SCORE_OK_THRESHOLD);
    expect(result.label).toBe("Needs attention");
  });
});
