import { ITALL_DEFINITIONS, ITALL_RULES } from "./registry.gen.js";
import type { ItallReactPlugin } from "./types.js";

const PLUGIN_NAMESPACE = "itall-react";
const RULE_DOCS_BASE_URL =
  "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules";

const plugin: ItallReactPlugin = {
  meta: {
    name: PLUGIN_NAMESPACE,
    version: process.env.VERSION ?? "0.0.0",
  },
  rules: ITALL_RULES,
};

export default plugin;
export { plugin, PLUGIN_NAMESPACE, RULE_DOCS_BASE_URL, ITALL_RULES, ITALL_DEFINITIONS };
export { defineItallRule } from "./define-itall-rule.js";
export type { DefineItallRuleInput } from "./define-itall-rule.js";
export type {
  EslintRule,
  EslintRuleContext,
  EslintRuleMeta,
  EslintRuleVisitor,
  ItallReactPlugin,
  ItallRule,
  ItallRuleSeverity,
} from "./types.js";
