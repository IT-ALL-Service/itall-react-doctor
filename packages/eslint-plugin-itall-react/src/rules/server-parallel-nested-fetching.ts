import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: two consecutive `await Promise.all(<arr>.map(...))`
// statements where the second's `<arr>` is the binding produced by the
// first. The shape parallelizes within each stage but waterfalls
// *between* stages — every item must finish stage-1 before stage-2
// starts for anyone. Replace with a single per-item chain so each row
// runs both fetches in parallel with every other row's:
//
//   const ys = await Promise.all(items.map(id => getX(id).then(getY)))
//
// See: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-parallel-nested-fetching.md

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isIdentifierNamed = (node: AstNode | undefined | null, name: string): boolean =>
  !!node && node.type === "Identifier" && (node.name as string) === name;

const isPromiseAllCallee = (callee: AstNode | undefined): boolean => {
  if (!callee || callee.type !== "MemberExpression") return false;
  const object = callee.object as AstNode | undefined;
  const property = callee.property as AstNode | undefined;
  if (!object || !property) return false;
  if (!isIdentifierNamed(object, "Promise")) return false;
  if (property.type !== "Identifier" || (property.name as string) !== "all") return false;
  return true;
};

// Matches `<expr>.map(<fn>)` and returns the receiver expression so the
// caller can decide whether it is the previous statement's binding.
const matchMapCallReceiver = (call: AstNode): AstNode | null => {
  if (call.type !== "CallExpression") return null;
  const callee = call.callee as AstNode | undefined;
  if (!callee || callee.type !== "MemberExpression") return null;
  const property = callee.property as AstNode | undefined;
  if (!property || property.type !== "Identifier" || (property.name as string) !== "map") {
    return null;
  }
  const object = callee.object as AstNode | undefined;
  return object ?? null;
};

interface PromiseAllMapMatch {
  receiver: AstNode;
}

const matchPromiseAllMap = (awaitNode: AstNode | undefined): PromiseAllMapMatch | null => {
  if (!awaitNode || awaitNode.type !== "AwaitExpression") return null;
  const argument = awaitNode.argument as AstNode | undefined;
  if (!argument || argument.type !== "CallExpression") return null;
  if (!isPromiseAllCallee(argument.callee as AstNode | undefined)) return null;
  const args = argument.arguments as Array<AstNode> | undefined;
  if (!args || args.length !== 1) return null;
  const receiver = matchMapCallReceiver(args[0]);
  if (!receiver) return null;
  return { receiver };
};

interface SingleDeclaratorInfo {
  bindingName: string;
  initAwait: AstNode;
}

// We only care about `const x = await Promise.all(...)` shapes — a
// pluralized destructure or no binding makes the dependency tracking
// brittle, so we conservatively skip those.
const extractSingleDeclarator = (statement: AstNode): SingleDeclaratorInfo | null => {
  if (statement.type !== "VariableDeclaration") return null;
  const declarations = statement.declarations as Array<AstNode> | undefined;
  if (!declarations || declarations.length !== 1) return null;
  const declarator = declarations[0];
  if (!declarator || declarator.type !== "VariableDeclarator") return null;
  const id = declarator.id as AstNode | undefined;
  const init = declarator.init as AstNode | undefined;
  if (!id || id.type !== "Identifier" || !init) return null;
  return { bindingName: id.name as string, initAwait: init };
};

const describeReceiver = (node: AstNode): string => {
  if (node.type === "Identifier") return node.name as string;
  if (node.type === "MemberExpression") {
    const object = node.object as AstNode | undefined;
    const prop = node.property as AstNode | undefined;
    const o = object?.type === "Identifier" ? (object.name as string) : "...";
    const p = prop?.type === "Identifier" ? (prop.name as string) : "?";
    return `${o}.${p}`;
  }
  return "items";
};

const buildMessage = (firstReceiverLabel: string, firstBinding: string): string =>
  `Nested \`Promise.all(...map())\` waterfalls between stages — every item in \`${firstReceiverLabel}\` must finish stage 1 (\`${firstBinding}\`) before any stage 2 fetch starts. Flatten with a per-item chain: \`Promise.all(${firstReceiverLabel}.map(x => getX(x).then(getY)))\` so each row runs both fetches in parallel with every other row.`;

const inspectStatements = (
  statements: ReadonlyArray<AstNode>,
  context: EslintRuleContext,
): void => {
  for (let i = 0; i < statements.length - 1; i++) {
    const first = extractSingleDeclarator(statements[i]);
    if (!first) continue;
    const firstMatch = matchPromiseAllMap(first.initAwait);
    if (!firstMatch) continue;

    const second = extractSingleDeclarator(statements[i + 1]);
    if (!second) continue;
    const secondMatch = matchPromiseAllMap(second.initAwait);
    if (!secondMatch) continue;

    if (!isIdentifierNamed(secondMatch.receiver, first.bindingName)) continue;

    context.report({
      node: statements[i + 1],
      message: buildMessage(describeReceiver(firstMatch.receiver), first.bindingName),
    });
    // Skip past the second so we don't double-report on a 3-stage chain.
    i++;
  }
};

const visitFunctionBody = (node: AstNode, context: EslintRuleContext): void => {
  // Only async functions can host awaits, but oxlint doesn't always
  // populate the `async` flag for type guards; we rely on the await
  // matcher above to filter, so we only need to ensure we have a block
  // body to scan.
  const body = node.body as AstNode | undefined;
  if (!body || body.type !== "BlockStatement") return;
  const statements = (body.body as Array<AstNode> | undefined) ?? [];
  inspectStatements(statements, context);
};

const visitProgram = (node: AstNode, context: EslintRuleContext): void => {
  // Top-level await (ESM) — Program nodes carry the statement array on
  // `body` directly, not wrapped in BlockStatement.
  const statements = (node.body as Array<AstNode> | undefined) ?? [];
  inspectStatements(statements, context);
};

export const serverParallelNestedFetching = defineItallRule({
  id: "server-parallel-nested-fetching",
  defaultSeverity: "warn",
  // Test files commonly set up fixtures with `await Promise.all(ids.map(getX))`
  // followed by `await Promise.all(xs.map(getY))` to seed multi-stage data
  // — that pattern is intentional in fixtures, not a perf bug. Tag opts
  // every `*.test.*` / `e2e/` / `cypress/` path out via the core
  // `merge-and-filter-diagnostics` auto-suppress pipeline.
  tags: ["test-noise"],
  meta: {
    type: "problem",
    docs: {
      description:
        "Flatten nested `Promise.all(arr.map(...))` waterfalls — chain per-item fetches inside a single `.map()` so rows run in parallel.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/server-parallel-nested-fetching.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const handleFn = (node: unknown): void => visitFunctionBody(node as AstNode, context);
    const handleProgram = (node: unknown): void => visitProgram(node as AstNode, context);
    return {
      FunctionDeclaration: handleFn,
      FunctionExpression: handleFn,
      ArrowFunctionExpression: handleFn,
      Program: handleProgram,
    };
  },
});

export default serverParallelNestedFetching;
