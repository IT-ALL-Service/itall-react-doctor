import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: a `useMemo(() => { ... }, [d1, d2, d3])` whose body
// runs multiple independent computations — one step depends on a
// subset of the deps, another step depends on a disjoint subset.
// Changing any one dep invalidates the whole memo even though some
// steps did not actually consume that dep. Splitting into separate
// `useMemo` calls (one per step) lets each step recompute only when
// its own deps change.
//
// Vercel spec: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-split-combined-hooks.md
//
// Scope (conservative on purpose):
// - Only `useMemo` (and `React.useMemo`). `useCallback` returns a
//   function and the body usually isn't multi-step; `useEffect` has
//   side-effect ordering / cleanup concerns that make body-splitting
//   unsafe to recommend mechanically.
// - Only flag when at least TWO `const X = expr` declarations in the
//   body each reference a non-empty, mutually disjoint subset of the
//   deps array. That guarantees a real waste — not just a step that
//   uses a superset / subset of another.
// - Skip if any declarator uses ALL deps (it's the "combined" step
//   that legitimately needs every dep — splitting doesn't help).

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isUseMemoCallee = (callee: AstNode | undefined): boolean => {
  if (!callee) return false;
  if (callee.type === "Identifier" && (callee.name as string) === "useMemo") return true;
  if (callee.type === "MemberExpression") {
    const object = callee.object as AstNode | undefined;
    const property = callee.property as AstNode | undefined;
    if (!object || !property) return false;
    if (object.type !== "Identifier" || (object.name as string) !== "React") return false;
    if (property.type !== "Identifier" || (property.name as string) !== "useMemo") return false;
    return true;
  }
  return false;
};

const collectDepIdentifiers = (depsArray: AstNode | undefined): Set<string> => {
  const names = new Set<string>();
  if (!depsArray || depsArray.type !== "ArrayExpression") return names;
  const elements = (depsArray.elements as Array<AstNode | null> | undefined) ?? [];
  for (const element of elements) {
    if (!element) continue;
    // Plain identifier dep — what 95% of useMemo deps look like in
    // practice. Member access (e.g. `props.user`) is rejected to keep
    // the analysis simple; that yields false negatives (we miss some
    // splittable memos) rather than false positives.
    if (element.type === "Identifier") {
      const name = element.name as string | undefined;
      if (name) names.add(name);
    }
  }
  return names;
};

const walkSubtree = (node: AstNode | undefined | null, visit: (n: AstNode) => void): void => {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const value = (node as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) walkSubtree(child as AstNode, visit);
    } else if (value && typeof value === "object" && typeof (value as AstNode).type === "string") {
      walkSubtree(value as AstNode, visit);
    }
  }
};

const collectIdentifierUsage = (root: AstNode, depNames: ReadonlySet<string>): Set<string> => {
  const used = new Set<string>();
  walkSubtree(root, (node) => {
    if (node.type !== "Identifier") return;
    const name = node.name as string | undefined;
    if (name && depNames.has(name)) used.add(name);
  });
  return used;
};

const haveDisjointNonEmptySubsets = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  if (a.size === 0 || b.size === 0) return false;
  for (const item of a) {
    if (b.has(item)) return false;
  }
  return true;
};

interface StepUsage {
  declarator: AstNode;
  used: Set<string>;
}

const collectBodySteps = (
  bodyStatements: ReadonlyArray<AstNode>,
  depNames: ReadonlySet<string>,
): StepUsage[] => {
  const steps: StepUsage[] = [];
  for (const statement of bodyStatements) {
    if (statement.type !== "VariableDeclaration") continue;
    const declarators = statement.declarations as Array<AstNode> | undefined;
    if (!declarators) continue;
    for (const declarator of declarators) {
      if (!declarator || declarator.type !== "VariableDeclarator") continue;
      const init = declarator.init as AstNode | undefined;
      if (!init) continue;
      const used = collectIdentifierUsage(init, depNames);
      steps.push({ declarator, used });
    }
  }
  return steps;
};

const stepsToFlag = (
  steps: ReadonlyArray<StepUsage>,
  totalDepCount: number,
): { aIndex: number; bIndex: number } | null => {
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    // Skip the "combined" step that consumes every dep — splitting it
    // out doesn't save any work.
    if (a.used.size === totalDepCount) continue;
    for (let j = i + 1; j < steps.length; j++) {
      const b = steps[j];
      if (b.used.size === totalDepCount) continue;
      if (haveDisjointNonEmptySubsets(a.used, b.used)) {
        return { aIndex: i, bIndex: j };
      }
    }
  }
  return null;
};

const buildMessage = (
  aDeps: ReadonlySet<string>,
  bDeps: ReadonlySet<string>,
  allDeps: ReadonlySet<string>,
): string => {
  const aList = [...aDeps].sort().join(", ");
  const bList = [...bDeps].sort().join(", ");
  const allList = [...allDeps].sort().join(", ");
  return `\`useMemo\` body combines two independent steps — one uses \`[${aList}]\`, the other uses \`[${bList}]\` — but the deps array is \`[${allList}]\`. Changing any one dep recomputes both. Split into separate \`useMemo\` calls so each step only recomputes when its own deps change.`;
};

export const rerenderSplitCombinedHooks = defineItallRule({
  id: "rerender-split-combined-hooks",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "Split a `useMemo` body into separate hooks when its sub-steps depend on disjoint subsets of the deps array — avoids recomputing independent work.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/rerender-split-combined-hooks.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      CallExpression(node) {
        const callExpression = node as AstNode;
        if (!isUseMemoCallee(callExpression.callee as AstNode | undefined)) return;
        const args = callExpression.arguments as Array<AstNode> | undefined;
        if (!args || args.length < 2) return;

        const callback = args[0];
        const depsArray = args[1];
        if (!callback || !depsArray) return;
        if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") {
          return;
        }
        const body = callback.body as AstNode | undefined;
        if (!body || body.type !== "BlockStatement") return;

        const depNames = collectDepIdentifiers(depsArray);
        // Need at least 2 deps for a "disjoint subset" pair to exist.
        if (depNames.size < 2) return;

        const bodyStatements = (body.body as Array<AstNode> | undefined) ?? [];
        const steps = collectBodySteps(bodyStatements, depNames);
        if (steps.length < 2) return;

        const hit = stepsToFlag(steps, depNames.size);
        if (!hit) return;

        context.report({
          node: callExpression,
          message: buildMessage(steps[hit.aIndex].used, steps[hit.bIndex].used, depNames),
        });
      },
    };
  },
});

export default rerenderSplitCombinedHooks;
