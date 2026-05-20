import type {
  EslintRuleContext,
  EslintRuleMeta,
  EslintRuleVisitor,
  ItallRule,
  ItallRuleSeverity,
} from "./types.js";

export interface DefineItallRuleInput {
  /**
   * Public rule identifier. Used as the registration key in the plugin's
   * `rules` map (without namespace) and to look up the rule when
   * resolving namespaced keys like `itall/<id>`. Must match the kebab-
   * case filename so codegen can derive imports by convention.
   */
  id: string;
  /**
   * Default severity baked into the generated `ITALL_REACT_RULE_METADATA`.
   * Per-project overrides still flow through `apply-severity-controls`.
   * Defaults to `"warn"` — keep new rules opt-in soft until operational
   * data justifies a graduation to `"error"`.
   */
  defaultSeverity?: ItallRuleSeverity;
  /**
   * Capability tokens (e.g. `"nextjs"`, `"react:19"`) that the project
   * must satisfy for the rule to register. Omit for rules that apply
   * to every project once the plugin is installed.
   */
  requires?: ReadonlyArray<string>;
  /**
   * Cross-cutting opt-out tags. Honored tags currently:
   * - `"test-noise"` → auto-suppressed in test files
   */
  tags?: ReadonlyArray<string>;
  meta: EslintRuleMeta;
  create: (context: EslintRuleContext) => EslintRuleVisitor;
}

/**
 * Authoring helper for sidecar rules. Replaces the plain
 * `export const x: EslintRule = { meta, create }` shape with a richer
 * `ItallRule` that carries id + capability/tag metadata. The shape that
 * actually goes through oxlint's JS plugin loader (`.rule`) is still
 * the clean ESLint-compatible object — no extra fields leak into the
 * plugin export consumed by oxlint.
 */
export const defineItallRule = (input: DefineItallRuleInput): ItallRule => ({
  id: input.id,
  defaultSeverity: input.defaultSeverity ?? "warn",
  requires: input.requires,
  tags: input.tags,
  rule: { meta: input.meta, create: input.create },
});
