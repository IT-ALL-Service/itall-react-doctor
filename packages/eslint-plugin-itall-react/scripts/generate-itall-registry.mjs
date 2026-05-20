#!/usr/bin/env node
// Generates two registry files from the rule modules under
// `packages/eslint-plugin-itall-react/src/rules/<rule-key>.ts`:
//
//   1. `packages/eslint-plugin-itall-react/src/registry.gen.ts`
//      → imports every rule, exports `ITALL_DEFINITIONS` (full
//        ItallRule[]) + `ITALL_RULES` (the ESLint-shape map the
//        plugin exposes to oxlint).
//
//   2. `packages/core/src/runners/oxlint/itall-rules.gen.ts`
//      → exports `ITALL_REACT_RULE_METADATA` (per-key requires/tags/
//        defaultSeverity) and a back-compat `ITALL_REACT_RULES` that
//        the existing `filterRulesToAvailable` consumes. The CLI's
//        config builder uses the richer metadata to filter sidecar
//        rules by `shouldEnableRule(requires, tags, capabilities,
//        ignoredTags)` — the same path upstream rules use.
//
// Convention-over-config:
//   - Filename `async-cheap-condition-before-await.ts` → rule key
//     `async-cheap-condition-before-await`.
//   - Export name is the camelCase of the filename
//     (`asyncCheapConditionBeforeAwait`).
//   - Each rule file MUST use `defineItallRule({ id, defaultSeverity,
//     requires?, tags?, meta, create })`. The codegen parses these
//     fields via regex (matching upstream `defineRule({...})` pattern).
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

const kebabToCamel = (kebab) => kebab.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

const extractStringField = (source, field) => {
  const match = source.match(new RegExp(`^\\s*${field}:\\s*"([^"]+)",?\\s*$`, "m"));
  return match ? match[1] : null;
};

const extractStringArrayField = (source, field) => {
  // Matches `field: ["a", "b"]` on a single line. Multiline arrays are
  // not supported on purpose — keeps the convention authorable in one
  // glance and the codegen trivial.
  const match = source.match(new RegExp(`^\\s*${field}:\\s*\\[([^\\]]*)\\],?\\s*$`, "m"));
  if (!match) return null;
  const inside = match[1].trim();
  if (inside === "") return [];
  return inside
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item.length > 0);
};

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

const rules = ruleKeys.map((ruleKey) => {
  const filePath = path.join(RULES_DIRECTORY, `${ruleKey}.ts`);
  const source = fs.readFileSync(filePath, "utf8");
  if (!/defineItallRule\s*\(\s*\{/.test(source)) {
    console.error(
      `Rule file ${path.relative(REPO_ROOT, filePath)} does not use defineItallRule(...). Migrate to the helper so codegen can read its metadata.`,
    );
    process.exit(1);
  }
  const id = extractStringField(source, "id");
  if (id !== ruleKey) {
    console.error(
      `Rule file ${path.relative(REPO_ROOT, filePath)} has id="${id ?? "<missing>"}" but filename implies "${ruleKey}". Filename and id must match (convention).`,
    );
    process.exit(1);
  }
  const defaultSeverity = extractStringField(source, "defaultSeverity") ?? "warn";
  if (!["error", "warn", "off"].includes(defaultSeverity)) {
    console.error(
      `Rule file ${path.relative(REPO_ROOT, filePath)} has unknown defaultSeverity="${defaultSeverity}".`,
    );
    process.exit(1);
  }
  const requires = extractStringArrayField(source, "requires") ?? [];
  const tags = extractStringArrayField(source, "tags") ?? [];
  return {
    ruleKey,
    exportName: kebabToCamel(ruleKey),
    modulePath: `./rules/${ruleKey}.js`,
    defaultSeverity,
    requires,
    tags,
  };
});

const PLUGIN_REGISTRY_HEADER = `// GENERATED FILE — do not edit by hand. Run \`pnpm gen\` to regenerate.
// Source of truth: every \`*.ts\` file under \`src/rules/\`.
// Adding a rule = drop the file under \`src/rules/\` (using defineItallRule)
// and re-run codegen.

`;

const pluginRegistryBody =
  rules.map((r) => `import { ${r.exportName} } from "${r.modulePath}";`).join("\n") +
  `\nimport type { EslintRule, ItallRule } from "./types.js";\n\n` +
  `export const ITALL_DEFINITIONS: ReadonlyArray<ItallRule> = [\n` +
  rules.map((r) => `  ${r.exportName},`).join("\n") +
  `\n];\n\n` +
  `export const ITALL_RULES: Record<string, EslintRule> = Object.fromEntries(\n` +
  `  ITALL_DEFINITIONS.map((definition) => [definition.id, definition.rule]),\n` +
  `);\n`;

fs.writeFileSync(PLUGIN_REGISTRY_OUTPUT, PLUGIN_REGISTRY_HEADER + pluginRegistryBody);

const CORE_RULES_HEADER = `// GENERATED FILE — do not edit by hand. Run \`pnpm gen\` (from \`@it-all-service/eslint-plugin-itall-react\`) to regenerate.
// Mirror of every rule key exported by the sidecar plugin, with the
// metadata needed for capability + tag filtering in the CLI's oxlint
// config builder (same path upstream react-doctor rules use).

`;

const formatStringArrayLiteral = (items) => {
  if (items.length === 0) return "[]";
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
};

const coreRulesBody =
  `import type { OxlintRuleSeverity } from "oxlint-plugin-react-doctor";\n\n` +
  `export interface ItallReactRuleMetadata {\n` +
  `  defaultSeverity: OxlintRuleSeverity;\n` +
  `  requires: ReadonlyArray<string>;\n` +
  `  tags: ReadonlyArray<string>;\n` +
  `}\n\n` +
  `export const ITALL_REACT_RULE_METADATA: Record<string, ItallReactRuleMetadata> = {\n` +
  rules
    .map(
      (r) =>
        `  "${NAMESPACE}/${r.ruleKey}": { defaultSeverity: "${r.defaultSeverity}", requires: ${formatStringArrayLiteral(r.requires)}, tags: ${formatStringArrayLiteral(r.tags)} },`,
    )
    .join("\n") +
  `\n};\n\n` +
  `// Back-compat surface — kept so existing \`filterRulesToAvailable\`\n` +
  `// callers continue to work. Built from \`ITALL_REACT_RULE_METADATA\`.\n` +
  `export const ITALL_REACT_RULES: Record<string, OxlintRuleSeverity> = Object.fromEntries(\n` +
  `  Object.entries(ITALL_REACT_RULE_METADATA).map(([key, meta]) => [key, meta.defaultSeverity]),\n` +
  `);\n`;

fs.writeFileSync(CORE_RULES_OUTPUT, CORE_RULES_HEADER + coreRulesBody);

console.log(
  `[itall-codegen] ${rules.length} rule${rules.length === 1 ? "" : "s"} → ${path.relative(REPO_ROOT, PLUGIN_REGISTRY_OUTPUT)} + ${path.relative(REPO_ROOT, CORE_RULES_OUTPUT)}`,
);
