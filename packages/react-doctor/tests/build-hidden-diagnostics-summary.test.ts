import { describe, expect, it } from "vite-plus/test";
import { buildHiddenDiagnosticsSummary } from "../src/cli/utils/build-hidden-diagnostics-summary.js";
import { buildDiagnostic } from "./regressions/_helpers.js";

describe("buildHiddenDiagnosticsSummary", () => {
  it("returns an empty array when no diagnostics are hidden", () => {
    expect(buildHiddenDiagnosticsSummary([])).toEqual([]);
  });

  it("emits a single warning part with the count label", () => {
    const oneWarning = buildHiddenDiagnosticsSummary([buildDiagnostic({ severity: "warning" })]);
    expect(oneWarning).toEqual([{ severity: "warning", count: 1, text: "⚠ warning 1건 더" }]);

    const manyWarnings = buildHiddenDiagnosticsSummary(
      Array.from({ length: 69 }, () => buildDiagnostic({ severity: "warning" })),
    );
    expect(manyWarnings).toEqual([{ severity: "warning", count: 69, text: "⚠ warning 69건 더" }]);
  });

  it("emits a single error part with the count label", () => {
    const oneError = buildHiddenDiagnosticsSummary([buildDiagnostic({ severity: "error" })]);
    expect(oneError).toEqual([{ severity: "error", count: 1, text: "✗ error 1건 더" }]);

    const manyErrors = buildHiddenDiagnosticsSummary(
      Array.from({ length: 5 }, () => buildDiagnostic({ severity: "error" })),
    );
    expect(manyErrors).toEqual([{ severity: "error", count: 5, text: "✗ error 5건 더" }]);
  });

  it("orders errors before warnings when both severities are hidden", () => {
    const mixed = buildHiddenDiagnosticsSummary([
      buildDiagnostic({ severity: "warning" }),
      buildDiagnostic({ severity: "error" }),
      buildDiagnostic({ severity: "warning" }),
      buildDiagnostic({ severity: "error" }),
      buildDiagnostic({ severity: "warning" }),
    ]);
    expect(mixed).toEqual([
      { severity: "error", count: 2, text: "✗ error 2건 더" },
      { severity: "warning", count: 3, text: "⚠ warning 3건 더" },
    ]);
  });

  it("omits the warning part when only errors are hidden", () => {
    const errorsOnly = buildHiddenDiagnosticsSummary([
      buildDiagnostic({ severity: "error" }),
      buildDiagnostic({ severity: "error" }),
    ]);
    expect(errorsOnly).toHaveLength(1);
    expect(errorsOnly[0].severity).toBe("error");
  });

  it("omits the error part when only warnings are hidden", () => {
    const warningsOnly = buildHiddenDiagnosticsSummary([
      buildDiagnostic({ severity: "warning" }),
      buildDiagnostic({ severity: "warning" }),
    ]);
    expect(warningsOnly).toHaveLength(1);
    expect(warningsOnly[0].severity).toBe("warning");
  });
});
