// GENERATED FILE — do not edit by hand. Run `pnpm gen` to regenerate.
// Source of truth: every `*.ts` file under `src/rules/`.
// Adding a rule = drop the file under `src/rules/` (using defineItallRule)
// and re-run codegen.

import { asyncCheapConditionBeforeAwait } from "./rules/async-cheap-condition-before-await.js";
import { componentFunctionDeclaration } from "./rules/component-function-declaration.js";
import { errorTsxUseClient } from "./rules/error-tsx-use-client.js";
import { noDocumentTitleMutation } from "./rules/no-document-title-mutation.js";
import { noProcessEnvDirectAccess } from "./rules/no-process-env-direct-access.js";
import { noTypePrefixSuffix } from "./rules/no-type-prefix-suffix.js";
import { renderingHydrationSuppressWarning } from "./rules/rendering-hydration-suppress-warning.js";
import { rerenderSplitCombinedHooks } from "./rules/rerender-split-combined-hooks.js";
import { rerenderUseRefTransientValues } from "./rules/rerender-use-ref-transient-values.js";
import { routeSegmentExplicitName } from "./rules/route-segment-explicit-name.js";
import { serverParallelNestedFetching } from "./rules/server-parallel-nested-fetching.js";
import { serverSerialization } from "./rules/server-serialization.js";
import { tanstackQueryKeyArray } from "./rules/tanstack-query-key-array.js";
import type { EslintRule, ItallRule } from "./types.js";

export const ITALL_DEFINITIONS: ReadonlyArray<ItallRule> = [
  asyncCheapConditionBeforeAwait,
  componentFunctionDeclaration,
  errorTsxUseClient,
  noDocumentTitleMutation,
  noProcessEnvDirectAccess,
  noTypePrefixSuffix,
  renderingHydrationSuppressWarning,
  rerenderSplitCombinedHooks,
  rerenderUseRefTransientValues,
  routeSegmentExplicitName,
  serverParallelNestedFetching,
  serverSerialization,
  tanstackQueryKeyArray,
];

export const ITALL_RULES: Record<string, EslintRule> = Object.fromEntries(
  ITALL_DEFINITIONS.map((definition) => [definition.id, definition.rule]),
);
