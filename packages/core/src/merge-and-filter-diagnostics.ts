import reactDoctorPlugin from "oxlint-plugin-react-doctor";
import type { Diagnostic, ReactDoctorConfig } from "@react-doctor/types";
import { applySeverityControls } from "./apply-severity-controls.js";
import { filterIgnoredDiagnostics, filterInlineSuppressions } from "./filter-diagnostics.js";
import { isTestFilePath } from "./is-test-file.js";
import { ITALL_REACT_RULE_METADATA } from "./runners/oxlint/itall-rules.gen.js";

interface MergeAndFilterOptions {
  respectInlineDisables?: boolean;
}

const testFileResultCache = new Map<string, boolean>();

export const clearAutoSuppressionCaches = (): void => {
  testFileResultCache.clear();
};

// Resolves the cross-cutting tags attached to a diagnostic's source
// rule. Today we look up two plugin populations — upstream
// `oxlint-plugin-react-doctor` (`diagnostic.plugin === "react-doctor"`)
// and our sidecar (`diagnostic.plugin === "itall"`) — and return their
// `tags` arrays merged into a single iterable for the suppress check
// below. Unknown plugins fall through with empty tags.
const resolveDiagnosticTags = (diagnostic: Diagnostic): ReadonlyArray<string> => {
  if (diagnostic.plugin === "react-doctor") {
    return reactDoctorPlugin.rules[diagnostic.rule]?.tags ?? [];
  }
  if (diagnostic.plugin === "itall") {
    return ITALL_REACT_RULE_METADATA[`itall/${diagnostic.rule}`]?.tags ?? [];
  }
  return [];
};

const shouldAutoSuppress = (diagnostic: Diagnostic): boolean => {
  const tags = resolveDiagnosticTags(diagnostic);
  if (!tags.includes("test-noise")) return false;

  const filePath = diagnostic.filePath;
  let isTest = testFileResultCache.get(filePath);
  if (isTest === undefined) {
    isTest = isTestFilePath(filePath);
    testFileResultCache.set(filePath, isTest);
  }
  return isTest;
};

export const mergeAndFilterDiagnostics = (
  mergedDiagnostics: Diagnostic[],
  directory: string,
  userConfig: ReactDoctorConfig | null,
  readFileLinesSync: (filePath: string) => string[] | null,
  options: MergeAndFilterOptions = {},
): Diagnostic[] => {
  const autoFiltered = mergedDiagnostics.filter((diagnostic) => !shouldAutoSuppress(diagnostic));
  const severityAdjusted = applySeverityControls(autoFiltered, userConfig);
  const filtered = userConfig
    ? filterIgnoredDiagnostics(severityAdjusted, userConfig, directory, readFileLinesSync)
    : severityAdjusted;
  if (options.respectInlineDisables === false) return filtered;
  return filterInlineSuppressions(filtered, directory, readFileLinesSync);
};
