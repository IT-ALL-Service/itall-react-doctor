import { highlighter, logger } from "@react-doctor/core";
import type { Diagnostic, ScoreResult } from "@react-doctor/types";
import { collectAffectedFiles, formatElapsedTime } from "./render-diagnostics.js";
import { printNoScoreHeader, printScoreHeader } from "./render-score-header.js";
import { writeDiagnosticsDirectory } from "./write-diagnostics-directory.js";

const printCountsSummaryLine = (
  diagnostics: Diagnostic[],
  totalSourceFileCount: number,
  elapsedMilliseconds: number,
): void => {
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const affectedFileCount = collectAffectedFiles(diagnostics).size;
  const totalIssueCount = diagnostics.length;
  const elapsedTimeLabel = formatElapsedTime(elapsedMilliseconds);

  const issueCountColor =
    errorCount > 0 ? highlighter.error : warningCount > 0 ? highlighter.warn : highlighter.dim;
  const issueCountText = `${totalIssueCount} ${totalIssueCount === 1 ? "issue" : "issues"}`;
  const fileCountText =
    totalSourceFileCount > 0
      ? `across ${affectedFileCount}/${totalSourceFileCount} files`
      : `across ${affectedFileCount} file${affectedFileCount === 1 ? "" : "s"}`;
  const elapsedTimeText = `in ${elapsedTimeLabel}`;

  logger.log(
    `  ${issueCountColor(issueCountText)} ${highlighter.dim(`${fileCountText}  ${elapsedTimeText}`)}`,
  );
};

// itall fork: 외부 share URL / React Review CTA 출력은 제거. 점수와 카운트 요약,
// diagnostics 덤프 경로 표시만 남긴다.
export const printSummary = (
  diagnostics: Diagnostic[],
  elapsedMilliseconds: number,
  scoreResult: ScoreResult | null,
  totalSourceFileCount: number,
  noScoreMessage: string,
): void => {
  if (scoreResult) {
    printScoreHeader(scoreResult);
  } else {
    printNoScoreHeader(noScoreMessage);
  }

  printCountsSummaryLine(diagnostics, totalSourceFileCount, elapsedMilliseconds);

  try {
    const diagnosticsDirectory = writeDiagnosticsDirectory(diagnostics);
    logger.log(highlighter.gray(`  Full diagnostics written to ${diagnosticsDirectory}`));
  } catch {
    /* swallow — failing to write the dump shouldn't block the summary */
  }
};
