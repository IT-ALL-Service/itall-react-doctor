// GENERATED FILE — do not edit by hand. Run `pnpm gen` to regenerate.
// Source of truth: every `*.ts` file under `src/rules/`.
// Adding a rule = drop the file under `src/rules/` and re-run codegen.

import { asyncCheapConditionBeforeAwait } from "./rules/async-cheap-condition-before-await.js";
import { renderingHydrationSuppressWarning } from "./rules/rendering-hydration-suppress-warning.js";
import { rerenderUseRefTransientValues } from "./rules/rerender-use-ref-transient-values.js";
import { serverParallelNestedFetching } from "./rules/server-parallel-nested-fetching.js";
import type { EslintRule } from "./types.js";

export const ITALL_RULES: Record<string, EslintRule> = {
  "async-cheap-condition-before-await": asyncCheapConditionBeforeAwait,
  "rendering-hydration-suppress-warning": renderingHydrationSuppressWarning,
  "rerender-use-ref-transient-values": rerenderUseRefTransientValues,
  "server-parallel-nested-fetching": serverParallelNestedFetching,
};
