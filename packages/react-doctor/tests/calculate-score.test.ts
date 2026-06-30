import { describe, expect, it } from "vite-plus/test";
import {
  ERROR_RULE_SCORE_WEIGHT,
  PERFECT_SCORE,
  SCORE_AFFECTED_FILE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_ERROR_FILE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
  SCORE_RULE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_WEIGHT_TOTAL_PERCENT,
  WARNING_RULE_SCORE_WEIGHT,
  calculateScore,
} from "@react-doctor/core";
import type { Diagnostic } from "@react-doctor/types";

const buildDiagnostic = (
  severity: Diagnostic["severity"],
  overrides: Partial<Diagnostic> = {},
): Diagnostic => ({
  filePath: overrides.filePath ?? "src/App.tsx",
  plugin: "react-doctor",
  rule: overrides.rule ?? "test-rule",
  severity,
  message: "test",
  line: overrides.line ?? 1,
  column: overrides.column ?? 1,
  category: overrides.category ?? "Correctness",
});

const calculateExpectedScore = ({
  affectedFileCount,
  errorAffectedFileCount,
  ruleComplianceRate,
  checkedFileCount,
}: {
  affectedFileCount: number;
  errorAffectedFileCount: number;
  ruleComplianceRate: number;
  checkedFileCount: number;
}): number => {
  const affectedFileComplianceRate = (checkedFileCount - affectedFileCount) / checkedFileCount;
  const errorFileComplianceRate = (checkedFileCount - errorAffectedFileCount) / checkedFileCount;
  return Math.round(
    ((affectedFileComplianceRate * SCORE_AFFECTED_FILE_COMPLIANCE_WEIGHT_PERCENT +
      ruleComplianceRate * SCORE_RULE_COMPLIANCE_WEIGHT_PERCENT +
      errorFileComplianceRate * SCORE_ERROR_FILE_COMPLIANCE_WEIGHT_PERCENT) /
      SCORE_WEIGHT_TOTAL_PERCENT) *
      PERFECT_SCORE,
  );
};

describe("calculateScore", () => {
  it("returns PERFECT_SCORE / 양호 when there are no diagnostics", () => {
    const result = calculateScore([]);
    expect(result.score).toBe(PERFECT_SCORE);
    expect(result.label).toBe("양호");
  });

  it("scores a rule by affected file ratio", () => {
    const diagnostics = [
      buildDiagnostic("warning", { filePath: "src/App.tsx" }),
      buildDiagnostic("warning", { filePath: "src/Page.tsx" }),
    ];

    const result = calculateScore(diagnostics, { checkedFileCount: 10 });

    expect(result.score).toBe(
      calculateExpectedScore({
        affectedFileCount: 2,
        errorAffectedFileCount: 0,
        ruleComplianceRate: 0.8,
        checkedFileCount: 10,
      }),
    );
  });

  it("counts the same rule once per affected file", () => {
    const diagnostics = [
      buildDiagnostic("warning", { filePath: "src/App.tsx", line: 1 }),
      buildDiagnostic("warning", { filePath: "src/App.tsx", line: 20 }),
    ];

    const result = calculateScore(diagnostics, { checkedFileCount: 10 });

    expect(result.score).toBe(
      calculateExpectedScore({
        affectedFileCount: 1,
        errorAffectedFileCount: 0,
        ruleComplianceRate: 0.9,
        checkedFileCount: 10,
      }),
    );
  });

  it("weights error rules more heavily than warning rules", () => {
    const diagnostics = [
      buildDiagnostic("error", { filePath: "src/App.tsx", rule: "unsafe-effect" }),
      buildDiagnostic("error", { filePath: "src/Page.tsx", rule: "unsafe-effect" }),
      buildDiagnostic("warning", { filePath: "src/A.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/B.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/C.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/D.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/E.tsx", rule: "naming" }),
    ];

    const result = calculateScore(diagnostics, { checkedFileCount: 10 });
    const ruleComplianceRate =
      (0.8 * ERROR_RULE_SCORE_WEIGHT + 0.5 * WARNING_RULE_SCORE_WEIGHT) /
      (ERROR_RULE_SCORE_WEIGHT + WARNING_RULE_SCORE_WEIGHT);

    expect(result.score).toBe(
      calculateExpectedScore({
        affectedFileCount: 7,
        errorAffectedFileCount: 2,
        ruleComplianceRate,
        checkedFileCount: 10,
      }),
    );
  });

  it("returns 0 when every checked file violates an error rule", () => {
    const diagnostics = Array.from({ length: 10 }, (_, diagnosticIndex) =>
      buildDiagnostic("error", { filePath: `src/${diagnosticIndex}.tsx` }),
    );

    const result = calculateScore(diagnostics, { checkedFileCount: 10 });

    expect(result.score).toBe(0);
    expect(result.label).toBe("심각");
  });

  it('labels "주의 필요" between SCORE_OK_THRESHOLD and SCORE_GOOD_THRESHOLD', () => {
    const diagnostics = [
      buildDiagnostic("error", { filePath: "src/App.tsx", rule: "unsafe-effect" }),
      buildDiagnostic("warning", { filePath: "src/A.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/B.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/C.tsx", rule: "naming" }),
      buildDiagnostic("warning", { filePath: "src/D.tsx", rule: "naming" }),
    ];

    const result = calculateScore(diagnostics, { checkedFileCount: 10 });

    expect(result.score).toBeLessThan(SCORE_GOOD_THRESHOLD);
    expect(result.score).toBeGreaterThanOrEqual(SCORE_OK_THRESHOLD);
    expect(result.label).toBe("주의 필요");
  });
});
