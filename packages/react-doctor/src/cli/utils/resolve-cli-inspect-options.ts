import { logger } from "@react-doctor/core";
import type { InspectOptions, ReactDoctorConfig } from "@react-doctor/types";
import type { InspectFlags } from "./inspect-flags.js";

// itall fork: 외부 score API / share URL 자체가 제거된 후 `--offline` 은 의미가
// 없어졌지만 컨슈머 워크플로 호환을 위해 deprecation noop으로 남긴다. 사용자가
// 명시적으로 켰을 때 한 번 알림만 출력하고 동작은 동일.
let offlineDeprecationWarned = false;
const maybeWarnOfflineDeprecated = (
  flags: InspectFlags,
  userConfig: ReactDoctorConfig | null,
): void => {
  if (offlineDeprecationWarned) return;
  if (flags.offline || userConfig?.offline) {
    logger.dim(
      "`--offline` / `offline` config field is deprecated and has no effect — the itall fork already runs offline-only.",
    );
    offlineDeprecationWarned = true;
  }
};

export const resolveCliInspectOptions = (
  flags: InspectFlags,
  userConfig: ReactDoctorConfig | null,
): InspectOptions => {
  maybeWarnOfflineDeprecated(flags, userConfig);
  return {
    lint: flags.lint ?? userConfig?.lint ?? true,
    verbose: flags.verbose ?? userConfig?.verbose ?? false,
    scoreOnly: Boolean(flags.score),
    offline: Boolean(flags.offline) || (userConfig?.offline ?? false),
    silent: Boolean(flags.json),
    respectInlineDisables: flags.respectInlineDisables ?? userConfig?.respectInlineDisables ?? true,
    outputSurface: flags.prComment ? "prComment" : "cli",
  };
};
