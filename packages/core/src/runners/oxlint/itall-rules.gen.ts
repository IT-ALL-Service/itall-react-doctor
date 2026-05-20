// GENERATED FILE — do not edit by hand. Run `pnpm gen` (from `@it-all-service/eslint-plugin-itall-react`) to regenerate.
// Mirror of every rule key exported by the sidecar plugin, with the
// metadata needed for capability + tag filtering in the CLI's oxlint
// config builder (same path upstream react-doctor rules use).

import type { OxlintRuleSeverity } from "oxlint-plugin-react-doctor";

export interface ItallReactRuleMetadata {
  defaultSeverity: OxlintRuleSeverity;
  requires: ReadonlyArray<string>;
  tags: ReadonlyArray<string>;
}

export const ITALL_REACT_RULE_METADATA: Record<string, ItallReactRuleMetadata> = {
  "itall/async-cheap-condition-before-await": { defaultSeverity: "warn", requires: [], tags: [] },
  "itall/rendering-hydration-suppress-warning": { defaultSeverity: "warn", requires: [], tags: [] },
  "itall/rerender-use-ref-transient-values": { defaultSeverity: "warn", requires: [], tags: [] },
  "itall/server-parallel-nested-fetching": {
    defaultSeverity: "warn",
    requires: [],
    tags: ["test-noise"],
  },
};

// Back-compat surface — kept so existing `filterRulesToAvailable`
// callers continue to work. Built from `ITALL_REACT_RULE_METADATA`.
export const ITALL_REACT_RULES: Record<string, OxlintRuleSeverity> = Object.fromEntries(
  Object.entries(ITALL_REACT_RULE_METADATA).map(([key, meta]) => [key, meta.defaultSeverity]),
);
