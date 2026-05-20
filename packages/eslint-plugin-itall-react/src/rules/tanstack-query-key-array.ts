import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: passing a non-array `queryKey` (or `mutationKey`) to
// TanStack Query hooks. The library uses array structural equality for
// cache identity; a bare string like `useQuery({ queryKey: "events" })`
// works at first but breaks `invalidateQueries({ queryKey: ["events"] })`
// from elsewhere — the keys never match and the cache silently goes
// stale.
//
// itall internal style: `packages/claude-presets/rules/nextjs.md` §3-4.
//
// Scope: the rule visits `useQuery` / `useInfiniteQuery` /
// `useSuspenseQuery` / `useMutation` / `useQueryClient().*` style calls
// that take a single options object literal. Spreads (`...defaults`)
// and identifier-passed options bags are left alone — those are usually
// shared factories where the key is built elsewhere and a static check
// would only produce noise.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const HOOK_KEYS: ReadonlyMap<string, string> = new Map([
  ["useQuery", "queryKey"],
  ["useInfiniteQuery", "queryKey"],
  ["useSuspenseQuery", "queryKey"],
  ["useSuspenseInfiniteQuery", "queryKey"],
  ["useQueries", "queryKey"],
  ["useMutation", "mutationKey"],
]);

const QUERY_CLIENT_METHODS: ReadonlyMap<string, string> = new Map([
  ["invalidateQueries", "queryKey"],
  ["refetchQueries", "queryKey"],
  ["cancelQueries", "queryKey"],
  ["removeQueries", "queryKey"],
  ["resetQueries", "queryKey"],
  ["prefetchQuery", "queryKey"],
  ["prefetchInfiniteQuery", "queryKey"],
  ["fetchQuery", "queryKey"],
  ["fetchInfiniteQuery", "queryKey"],
  ["ensureQueryData", "queryKey"],
  ["getQueryData", "queryKey"],
  ["setQueryData", "queryKey"],
]);

const resolveExpectedKeyFieldForCall = (callee: AstNode | undefined): string | null => {
  if (!callee) return null;
  if (callee.type === "Identifier") {
    return HOOK_KEYS.get(callee.name as string) ?? null;
  }
  if (callee.type === "MemberExpression") {
    const property = callee.property as AstNode | undefined;
    if (property?.type !== "Identifier") return null;
    if ((callee as unknown as { computed?: boolean }).computed === true) return null;
    return QUERY_CLIENT_METHODS.get(property.name as string) ?? null;
  }
  return null;
};

const findPropertyByName = (objectExpression: AstNode, name: string): AstNode | null => {
  if (objectExpression.type !== "ObjectExpression") return null;
  const properties = (objectExpression.properties as Array<AstNode> | undefined) ?? [];
  for (const property of properties) {
    if (!property) continue;
    if (property.type !== "Property") continue;
    if ((property as unknown as { computed?: boolean }).computed === true) continue;
    const key = property.key as AstNode | undefined;
    if (key?.type === "Identifier" && (key.name as string) === name) return property;
    if (key?.type === "Literal" && (key as unknown as { value: unknown }).value === name) {
      return property;
    }
  }
  return null;
};

const objectHasSpreadElement = (objectExpression: AstNode): boolean => {
  if (objectExpression.type !== "ObjectExpression") return false;
  const properties = (objectExpression.properties as Array<AstNode> | undefined) ?? [];
  return properties.some((property) => property?.type === "SpreadElement");
};

const describeQueryKeyShape = (value: AstNode | undefined): string => {
  if (!value) return "<missing>";
  if (value.type === "Literal") {
    const literalValue = (value as unknown as { value: unknown }).value;
    return typeof literalValue === "string" ? `"${literalValue}"` : String(literalValue);
  }
  if (value.type === "Identifier") return `\`${value.name as string}\``;
  if (value.type === "TemplateLiteral") return "<template literal>";
  return `\`${value.type}\``;
};

export const tanstackQueryKeyArray = defineItallRule({
  id: "tanstack-query-key-array",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "Pass `queryKey` / `mutationKey` as an array — TanStack Query uses array structural equality, so a bare string or identifier silently mismatches `invalidateQueries({ queryKey: [...] })` elsewhere.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/tanstack-query-key-array.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      CallExpression(node) {
        const callExpression = node as AstNode;
        const expectedKey = resolveExpectedKeyFieldForCall(
          callExpression.callee as AstNode | undefined,
        );
        if (!expectedKey) return;
        const args = callExpression.arguments as Array<AstNode> | undefined;
        if (!args || args.length === 0) return;
        const firstArg = args[0];
        if (firstArg.type !== "ObjectExpression") return;
        // Skip options objects that spread a shared base — the key
        // likely comes from a factory and a static check here would
        // double-report (or false-positive against valid keys).
        if (objectHasSpreadElement(firstArg)) return;
        const property = findPropertyByName(firstArg, expectedKey);
        if (!property) return;
        const value = (property as { value?: AstNode }).value;
        if (!value) return;
        if (value.type === "ArrayExpression") return;
        // Identifiers are usually computed key constants — those are
        // typically already arrays at their declaration site. Flagging
        // them here would produce a steady stream of false positives.
        if (value.type === "Identifier") return;
        // Spread inside the value (rare but possible) — treat as
        // "delegated to factory" and skip.
        if (value.type === "CallExpression") return;
        context.report({
          node: property,
          message: `\`${expectedKey}: ${describeQueryKeyShape(value)}\` must be an array. Use \`${expectedKey}: ["resource", ...params]\` so cache identity matches \`invalidateQueries({ ${expectedKey}: ["resource", ...] })\` calls from other modules.`,
        });
      },
    };
  },
});

export default tanstackQueryKeyArray;
