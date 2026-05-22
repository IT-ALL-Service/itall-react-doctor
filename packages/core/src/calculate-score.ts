import {
  ERROR_RULE_SCORE_WEIGHT,
  MIN_SCORE_CHECKED_FILE_COUNT,
  PERFECT_SCORE,
  SCORE_AFFECTED_FILE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_ERROR_FILE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
  SCORE_RULE_COMPLIANCE_WEIGHT_PERCENT,
  SCORE_WEIGHT_TOTAL_PERCENT,
  WARNING_RULE_SCORE_WEIGHT,
} from "./constants.js";
import type { Diagnostic, ScoreResult } from "@react-doctor/types";

export interface CalculateScoreOptions {
  checkedFileCount?: number;
}

interface RuleScoreAccumulator {
  severity: Diagnostic["severity"];
  filePaths: Set<string>;
}

interface ScoreComplianceRates {
  affectedFileComplianceRate: number;
  ruleComplianceRate: number;
  errorFileComplianceRate: number;
}

const getRuleKey = (diagnostic: Diagnostic): string => `${diagnostic.plugin}/${diagnostic.rule}`;

const getRuleWeight = (severity: Diagnostic["severity"]): number =>
  severity === "error" ? ERROR_RULE_SCORE_WEIGHT : WARNING_RULE_SCORE_WEIGHT;

const resolveCheckedFileCount = (
  diagnostics: Diagnostic[],
  options: CalculateScoreOptions,
): number => {
  if (
    typeof options.checkedFileCount === "number" &&
    Number.isFinite(options.checkedFileCount) &&
    options.checkedFileCount > 0
  ) {
    return options.checkedFileCount;
  }

  const affectedFiles = new Set(diagnostics.map((diagnostic) => diagnostic.filePath));
  return Math.max(MIN_SCORE_CHECKED_FILE_COUNT, affectedFiles.size);
};

const collectRuleScoreAccumulators = (
  diagnostics: Diagnostic[],
): Map<string, RuleScoreAccumulator> => {
  const accumulators = new Map<string, RuleScoreAccumulator>();

  for (const diagnostic of diagnostics) {
    const ruleKey = getRuleKey(diagnostic);
    const accumulator = accumulators.get(ruleKey);
    if (accumulator) {
      accumulator.filePaths.add(diagnostic.filePath);
      if (diagnostic.severity === "error") {
        accumulator.severity = "error";
      }
      continue;
    }

    accumulators.set(ruleKey, {
      severity: diagnostic.severity,
      filePaths: new Set([diagnostic.filePath]),
    });
  }

  return accumulators;
};

const collectAffectedFiles = (
  diagnostics: Diagnostic[],
  severity?: Diagnostic["severity"],
): Set<string> => {
  const affectedFiles = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (severity !== undefined && diagnostic.severity !== severity) {
      continue;
    }
    affectedFiles.add(diagnostic.filePath);
  }
  return affectedFiles;
};

const calculateRuleComplianceRate = (
  accumulators: Map<string, RuleScoreAccumulator>,
  checkedFileCount: number,
): number => {
  let weightedComplianceTotal = 0;
  let totalWeight = 0;

  for (const accumulator of accumulators.values()) {
    const affectedFileCount = Math.min(accumulator.filePaths.size, checkedFileCount);
    const complianceRate = (checkedFileCount - affectedFileCount) / checkedFileCount;
    const weight = getRuleWeight(accumulator.severity);

    weightedComplianceTotal += complianceRate * weight;
    totalWeight += weight;
  }

  return weightedComplianceTotal / totalWeight;
};

const calculateComplianceRates = (
  diagnostics: Diagnostic[],
  checkedFileCount: number,
): ScoreComplianceRates => {
  const affectedFiles = collectAffectedFiles(diagnostics);
  const errorAffectedFiles = collectAffectedFiles(diagnostics, "error");
  const accumulators = collectRuleScoreAccumulators(diagnostics);

  return {
    affectedFileComplianceRate:
      (checkedFileCount - Math.min(affectedFiles.size, checkedFileCount)) / checkedFileCount,
    ruleComplianceRate: calculateRuleComplianceRate(accumulators, checkedFileCount),
    errorFileComplianceRate:
      (checkedFileCount - Math.min(errorAffectedFiles.size, checkedFileCount)) / checkedFileCount,
  };
};

const getScoreLabel = (score: number): string => {
  let label: string;
  if (score >= SCORE_GOOD_THRESHOLD) label = "Healthy";
  else if (score >= SCORE_OK_THRESHOLD) label = "Needs attention";
  else label = "Critical";
  return label;
};

export const calculateScore = (
  diagnostics: Diagnostic[],
  options: CalculateScoreOptions = {},
): ScoreResult => {
  if (diagnostics.length === 0) {
    return { score: PERFECT_SCORE, label: getScoreLabel(PERFECT_SCORE) };
  }

  const checkedFileCount = resolveCheckedFileCount(diagnostics, options);
  const { affectedFileComplianceRate, ruleComplianceRate, errorFileComplianceRate } =
    calculateComplianceRates(diagnostics, checkedFileCount);
  const weightedComplianceRate =
    (affectedFileComplianceRate * SCORE_AFFECTED_FILE_COMPLIANCE_WEIGHT_PERCENT +
      ruleComplianceRate * SCORE_RULE_COMPLIANCE_WEIGHT_PERCENT +
      errorFileComplianceRate * SCORE_ERROR_FILE_COMPLIANCE_WEIGHT_PERCENT) /
    SCORE_WEIGHT_TOTAL_PERCENT;
  const score = Math.round(weightedComplianceRate * PERFECT_SCORE);
  const label = getScoreLabel(score);

  return { score, label };
};
