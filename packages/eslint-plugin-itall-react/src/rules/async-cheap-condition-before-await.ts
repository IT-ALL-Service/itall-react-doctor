import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: a logical `&&` chain whose left-hand side is an
// `await` expression and whose right-hand side is a cheap, sync check.
// Because JS short-circuits `a && b`, swapping the operands lets the
// cheap predicate skip the awaited call entirely on the false path,
// avoiding network/disk/IO when the answer is already knowable from
// local state. See:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-cheap-condition-before-await.md

interface AstNode {
  type: string;
  [key: string]: unknown;
}

// "Cheap" RHS is one we can guarantee has no side effect and no nested
// `await`/`CallExpression`. We accept literals, identifier references,
// chained member access made of identifier/member only, and unary
// negation/typeof of any of the above. Anything with a call, await,
// new, or template-literal interpolation is rejected — those may be
// expensive enough that auto-flipping the operand order is unsafe.
const isCheapExpression = (node: AstNode | undefined | null): boolean => {
  if (!node) return false;
  switch (node.type) {
    case "Literal":
      return true;
    case "TemplateLiteral": {
      const expressions = node.expressions as Array<AstNode> | undefined;
      if (!expressions || expressions.length === 0) return true;
      return expressions.every((expr) => isCheapExpression(expr));
    }
    case "Identifier":
    case "ThisExpression":
      return true;
    case "MemberExpression": {
      const object = node.object as AstNode | undefined;
      const property = node.property as AstNode | undefined;
      if (!object || !property) return false;
      if (!isCheapExpression(object)) return false;
      // Computed access like `obj[fn()]` would invoke `fn()`, so the
      // computed key must itself be cheap. Non-computed access has a
      // plain identifier on the right and is always cheap.
      const computed = node.computed === true;
      if (computed && !isCheapExpression(property)) return false;
      return true;
    }
    case "UnaryExpression": {
      const op = node.operator as string | undefined;
      if (op === "!" || op === "typeof" || op === "void") {
        return isCheapExpression(node.argument as AstNode | undefined);
      }
      return false;
    }
    default:
      return false;
  }
};

const describeAwait = (node: AstNode): string => {
  const argument = node.argument as AstNode | undefined;
  if (!argument) return "await expression";
  if (argument.type === "CallExpression") {
    const callee = argument.callee as AstNode | undefined;
    if (callee?.type === "Identifier") return `await ${callee.name as string}()`;
    if (callee?.type === "MemberExpression") {
      const prop = callee.property as AstNode | undefined;
      if (prop?.type === "Identifier") return `await ...${prop.name as string}()`;
    }
    return "await call";
  }
  if (argument.type === "Identifier") return `await ${argument.name as string}`;
  return "await expression";
};

const describeRhs = (node: AstNode): string => {
  if (node.type === "Identifier") return node.name as string;
  if (node.type === "MemberExpression") {
    const object = node.object as AstNode | undefined;
    const prop = node.property as AstNode | undefined;
    const objectLabel = object?.type === "Identifier" ? (object.name as string) : "...";
    const propLabel = prop?.type === "Identifier" ? (prop.name as string) : "?";
    return `${objectLabel}.${propLabel}`;
  }
  if (node.type === "Literal") {
    const value = (node as unknown as { value: unknown }).value;
    return JSON.stringify(value);
  }
  if (node.type === "UnaryExpression" && node.argument) {
    return `${node.operator as string}${describeRhs(node.argument as AstNode)}`;
  }
  return "<cheap expression>";
};

const buildMessage = (awaitLabel: string, rhsLabel: string): string =>
  `Short-circuit \`${rhsLabel}\` first before \`${awaitLabel}\` — flipping the operands lets the cheap check skip the awaited call when it fails.`;

export const asyncCheapConditionBeforeAwait = defineItallRule({
  id: "async-cheap-condition-before-await",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "Place cheap, synchronous predicates before `await` in `&&` boolean checks so short-circuiting can skip the awaited call.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/async-cheap-condition-before-await.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      LogicalExpression(node) {
        const n = node as AstNode;
        if (n.operator !== "&&") return;
        const left = n.left as AstNode | undefined;
        const right = n.right as AstNode | undefined;
        if (!left || !right) return;
        if (left.type !== "AwaitExpression") return;
        if (!isCheapExpression(right)) return;
        context.report({
          node,
          message: buildMessage(describeAwait(left), describeRhs(right)),
        });
      },
    };
  },
});

export default asyncCheapConditionBeforeAwait;
