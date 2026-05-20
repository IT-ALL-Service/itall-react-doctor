import {
  ERROR_PENALTY_POINTS,
  PERFECT_SCORE,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
  WARNING_PENALTY_POINTS,
} from "./constants.js";
import type { Diagnostic, ScoreResult } from "@react-doctor/types";

// 사내 fork는 외부 scoring API 의존을 끊고 로컬에서 점수를 산출한다.
// 입력 diagnostics는 호출부에서 `filterDiagnosticsForSurface("score", ...)`
// 를 거친 상태로 들어와야 한다 — design 같은 weak-signal tag가 빠진 뒤
// 점수가 매겨지도록.
//
// 산식: PERFECT_SCORE - (errors × ERROR_PENALTY) - (warnings × WARNING_PENALTY)
//       0 미만은 0으로 clamp.
// 라벨 임계값: SCORE_GOOD_THRESHOLD(75) / SCORE_OK_THRESHOLD(50).
// upstream 라벨 문구 ("Healthy"/"Needs attention"/"Critical") 는 score 렌더링
// 컬러링 로직(colorize-by-score) 과 일치시키기 위해 그대로 유지한다.
export const calculateScore = (diagnostics: Diagnostic[]): ScoreResult => {
  let errorCount = 0;
  let warningCount = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") errorCount += 1;
    else if (diagnostic.severity === "warning") warningCount += 1;
  }

  const penalty = errorCount * ERROR_PENALTY_POINTS + warningCount * WARNING_PENALTY_POINTS;
  const score = Math.max(0, PERFECT_SCORE - penalty);

  let label: string;
  if (score >= SCORE_GOOD_THRESHOLD) label = "Healthy";
  else if (score >= SCORE_OK_THRESHOLD) label = "Needs attention";
  else label = "Critical";

  return { score, label };
};
