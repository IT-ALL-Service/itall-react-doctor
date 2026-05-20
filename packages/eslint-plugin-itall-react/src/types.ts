export interface EslintRuleVisitor {
  [selector: string]: ((node: unknown) => void) | undefined;
}

export interface EslintRuleContext {
  report: (descriptor: { node: unknown; message: string }) => void;
  getFilename?: () => string;
}

export interface EslintRuleMeta {
  type: "problem" | "suggestion" | "layout";
  docs: {
    description: string;
    url: string;
    recommended: boolean;
  };
  schema: unknown[];
}

export interface EslintRule {
  meta: EslintRuleMeta;
  create: (context: EslintRuleContext) => EslintRuleVisitor;
}

// Severity that consumers (CLI + tag/severity controls) reason about.
// `off` is a valid default — a rule can ship inactive and opt-in via
// per-project severity overrides without us having to remove it from the
// registry.
export type ItallRuleSeverity = "error" | "warn" | "off";

// Internal metadata layer for sidecar rules. Mirrors the fields upstream
// `oxlint-plugin-react-doctor` puts on every `defineRule({...})` call:
// `id` (registration key), `defaultSeverity` (initial severity before
// user overrides), `requires` (capability tokens that ALL must be met
// for the rule to register at all), `tags` (cross-cutting opt-out
// behavior — e.g. `"test-noise"` auto-suppresses in test files via
// `merge-and-filter-diagnostics`).
//
// The actual ESLint-compatible rule object lives on `.rule` so the
// plugin export passed to oxlint stays a clean `{ meta, create }` shape
// the JS plugin loader expects.
export interface ItallRule {
  id: string;
  defaultSeverity: ItallRuleSeverity;
  /**
   * Capability tokens (e.g. `"nextjs"`, `"react:19"`, `"react-native"`)
   * that the project must have for this rule to be enabled. ALL must
   * match. Omit / empty array = enabled in every project once installed.
   */
  requires?: ReadonlyArray<string>;
  /**
   * Cross-cutting opt-out tags. Currently honored:
   * - `"test-noise"` → diagnostics suppressed in test files
   *
   * Authors may add tags for future filters; unrecognised tags are
   * ignored. Mirrors upstream's `tags: ["test-noise"]` semantics.
   */
  tags?: ReadonlyArray<string>;
  rule: EslintRule;
}

export interface ItallReactPlugin {
  meta: { name: string; version: string };
  rules: Record<string, EslintRule>;
}
