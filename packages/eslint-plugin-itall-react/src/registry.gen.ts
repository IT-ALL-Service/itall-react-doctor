// GENERATED FILE — do not edit by hand. Run `pnpm gen` to regenerate.
// Source of truth: every `*.ts` file under `src/rules/`.
// Adding a rule = drop the file under `src/rules/` (using defineItallRule)
// and re-run codegen.

import { asyncCheapConditionBeforeAwait } from "./rules/async-cheap-condition-before-await.js";
import { errorTsxUseClient } from "./rules/error-tsx-use-client.js";
import { noProcessEnvDirectAccess } from "./rules/no-process-env-direct-access.js";
import { renderingHydrationSuppressWarning } from "./rules/rendering-hydration-suppress-warning.js";
import { rerenderSplitCombinedHooks } from "./rules/rerender-split-combined-hooks.js";
import { rerenderUseRefTransientValues } from "./rules/rerender-use-ref-transient-values.js";
import { serverParallelNestedFetching } from "./rules/server-parallel-nested-fetching.js";
import { serverSerialization } from "./rules/server-serialization.js";
import { tanstackQueryKeyArray } from "./rules/tanstack-query-key-array.js";
import type { EslintRule, ItallRule } from "./types.js";

export const ITALL_DEFINITIONS: ReadonlyArray<ItallRule> = [
  asyncCheapConditionBeforeAwait,
  errorTsxUseClient,
  noProcessEnvDirectAccess,
  renderingHydrationSuppressWarning,
  rerenderSplitCombinedHooks,
  rerenderUseRefTransientValues,
  serverParallelNestedFetching,
  serverSerialization,
  tanstackQueryKeyArray,
];

export const ITALL_RULES: Record<string, EslintRule> = Object.fromEntries(
  ITALL_DEFINITIONS.map((definition) => [definition.id, definition.rule]),
);
