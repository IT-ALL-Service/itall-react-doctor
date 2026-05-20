import { asyncApiRoutes } from "./rules/async-api-routes.js";
import { asyncCheapConditionBeforeAwait } from "./rules/async-cheap-condition-before-await.js";
import { renderingHydrationSuppressWarning } from "./rules/rendering-hydration-suppress-warning.js";
import { rerenderUseRefTransientValues } from "./rules/rerender-use-ref-transient-values.js";
import { serverParallelNestedFetching } from "./rules/server-parallel-nested-fetching.js";
import type { EslintRule, ItallReactPlugin } from "./types.js";

const PLUGIN_NAMESPACE = "itall-react";
const RULE_DOCS_BASE_URL =
  "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules";

const rules: Record<string, EslintRule> = {
  "async-api-routes": asyncApiRoutes,
  "async-cheap-condition-before-await": asyncCheapConditionBeforeAwait,
  "rendering-hydration-suppress-warning": renderingHydrationSuppressWarning,
  "rerender-use-ref-transient-values": rerenderUseRefTransientValues,
  "server-parallel-nested-fetching": serverParallelNestedFetching,
};

const plugin: ItallReactPlugin = {
  meta: {
    name: PLUGIN_NAMESPACE,
    version: process.env.VERSION ?? "0.0.0",
  },
  rules,
};

export default plugin;
export { plugin, PLUGIN_NAMESPACE, RULE_DOCS_BASE_URL };
export type {
  EslintRule,
  EslintRuleContext,
  EslintRuleMeta,
  EslintRuleVisitor,
  ItallReactPlugin,
} from "./types.js";
