#!/usr/bin/env node
// Generates two registry files from the rule modules under
// `packages/eslint-plugin-itall-react/src/rules/<rule-key>.ts`:
//
//   1. `packages/eslint-plugin-itall-react/src/registry.gen.ts`
//      → imports every rule, exports an `ITALL_RULES` record keyed by
//        the rule key. Consumed by `src/index.ts` to populate the
//        plugin's `rules` map.
//
//   2. `packages/core/src/runners/oxlint/itall-rules.gen.ts`
//      → exports `ITALL_REACT_RULES` keyed by the namespaced rule id
//        (`itall/<rule-key>`) with the default severity. Consumed by
//        `plugin-resolution.ts` so the CLI knows which itall rules to
//        enable when the sidecar plugin is installed.
//
// Convention-over-config:
//   - Filename `async-cheap-condition-before-await.ts` → rule key
//     `async-cheap-condition-before-await`.
//   - Export name is the camelCase of the filename
//     (`asyncCheapConditionBeforeAwait`).
//   - Default severity is `warn`. To raise a specific rule, add an
//     entry to `SEVERITY_OVERRIDES` below.
//
// Output files are committed to git so consumers (and reviewers) can
// see the wiring without running codegen. Re-run `pnpm gen` whenever a
// rule file is added, removed, or renamed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PACKAGE_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const REPO_ROOT = path.resolve(PLUGIN_PACKAGE_ROOT, "..", "..");

const RULES_DIRECTORY = path.join(PLUGIN_PACKAGE_ROOT, "src", "rules");
const PLUGIN_REGISTRY_OUTPUT = path.join(PLUGIN_PACKAGE_ROOT, "src", "registry.gen.ts");
const CORE_RULES_OUTPUT = path.join(
  REPO_ROOT,
  "packages",
  "core",
  "src",
  "runners",
  "oxlint",
  "itall-rules.gen.ts",
);

const NAMESPACE = "itall";
const DEFAULT_SEVERITY = "warn";

// Per-rule severity overrides. Leave empty unless a specific rule has
// graduated from `warn` to `error` after operational soak.
//   "rule-key": "error",
const SEVERITY_OVERRIDES = {};

const kebabToCamel = (kebab) => kebab.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

const ruleKeys = fs
  .readdirSync(RULES_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => name.endsWith(".ts") && !name.startsWith("_") && !name.endsWith(".d.ts"))
  .map((name) => name.replace(/\.ts$/, ""))
  .sort();

if (ruleKeys.length === 0) {
  console.error(`No rule files found under ${path.relative(REPO_ROOT, RULES_DIRECTORY)}`);
  process.exit(1);
}

const rules = ruleKeys.map((ruleKey) => ({
  ruleKey,
  exportName: kebabToCamel(ruleKey),
  modulePath: `./rules/${ruleKey}.js`,
  severity: SEVERITY_OVERRIDES[ruleKey] ?? DEFAULT_SEVERITY,
}));

const PLUGIN_REGISTRY_HEADER = `// GENERATED FILE — do not edit by hand. Run \`pnpm gen\` to regenerate.
// Source of truth: every \`*.ts\` file under \`src/rules/\`.
// Adding a rule = drop the file under \`src/rules/\` and re-run codegen.

`;

const pluginRegistryBody =
  rules.map((r) => `import { ${r.exportName} } from "${r.modulePath}";`).join("\n") +
  `\nimport type { EslintRule } from "./types.js";\n\n` +
  `export const ITALL_RULES: Record<string, EslintRule> = {\n` +
  rules.map((r) => `  "${r.ruleKey}": ${r.exportName},`).join("\n") +
  `\n};\n`;

fs.writeFileSync(PLUGIN_REGISTRY_OUTPUT, PLUGIN_REGISTRY_HEADER + pluginRegistryBody);

const CORE_RULES_HEADER = `// GENERATED FILE — do not edit by hand. Run \`pnpm gen\` (from \`@it-all-service/eslint-plugin-itall-react\`) to regenerate.
// Mirror of every rule key exported by the sidecar plugin, namespaced as \`itall/<rule-key>\` with its default severity.
// The CLI enables these rule keys when the optional peer plugin resolves at runtime.

`;

const coreRulesBody =
  `import type { OxlintRuleSeverity } from "oxlint-plugin-react-doctor";\n\n` +
  `export const ITALL_REACT_RULES: Record<string, OxlintRuleSeverity> = {\n` +
  rules.map((r) => `  "${NAMESPACE}/${r.ruleKey}": "${r.severity}",`).join("\n") +
  `\n};\n`;

fs.writeFileSync(CORE_RULES_OUTPUT, CORE_RULES_HEADER + coreRulesBody);

console.log(
  `[itall-codegen] ${rules.length} rule${rules.length === 1 ? "" : "s"} → ${path.relative(REPO_ROOT, PLUGIN_REGISTRY_OUTPUT)} + ${path.relative(REPO_ROOT, CORE_RULES_OUTPUT)}`,
);
