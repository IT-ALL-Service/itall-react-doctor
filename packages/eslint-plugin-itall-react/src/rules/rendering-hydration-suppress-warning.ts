import type { EslintRule, EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: non-deterministic expressions (current time, random
// values, locale-sensitive formatting) rendered directly inside JSX
// without `suppressHydrationWarning` on the wrapping element. In SSR
// frameworks the server-rendered and client-rendered HTML diverge,
// producing noisy hydration warnings. See:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rendering-hydration-suppress-warning.md

interface AstNode {
  type: string;
  parent?: AstNode;
  [key: string]: unknown;
}

const memberObjectName = (node: AstNode | undefined | null): string | null => {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return (node.name as string) ?? null;
  return null;
};

const memberPropertyName = (node: AstNode): string | null => {
  const prop = node.property as AstNode | undefined;
  if (!prop || prop.type !== "Identifier") return null;
  return (prop.name as string) ?? null;
};

// Returns a short label if the node is a recognised non-deterministic
// source, else null. Splits cleanly into NewExpression (constructors)
// and CallExpression (methods).
const classifyNewExpression = (node: AstNode): string | null => {
  const callee = node.callee as AstNode | undefined;
  if (!callee) return null;
  if (callee.type === "Identifier" && callee.name === "Date") return "new Date()";
  if (callee.type === "MemberExpression" && memberObjectName(callee.object as AstNode) === "Intl") {
    const name = memberPropertyName(callee);
    return name ? `new Intl.${name}()` : "new Intl.*()";
  }
  return null;
};

const classifyCallExpression = (node: AstNode): string | null => {
  const callee = node.callee as AstNode | undefined;
  if (!callee || callee.type !== "MemberExpression") return null;
  const object = memberObjectName(callee.object as AstNode);
  const property = memberPropertyName(callee);
  if (!property) return null;
  if (object === "Date" && property === "now") return "Date.now()";
  if (object === "Math" && property === "random") return "Math.random()";
  if (object === "crypto" && property === "randomUUID") return "crypto.randomUUID()";
  if (object === "Intl") return `Intl.${property}()`;
  return null;
};

const hasSuppressHydrationAttribute = (jsxElement: AstNode): boolean => {
  const openingElement = jsxElement.openingElement as AstNode | undefined;
  if (!openingElement) return false;
  const attributes = openingElement.attributes as Array<AstNode> | undefined;
  if (!attributes) return false;
  for (const attr of attributes) {
    if (!attr || attr.type !== "JSXAttribute") continue;
    const name = attr.name as AstNode | undefined;
    if (!name || name.type !== "JSXIdentifier") continue;
    if ((name.name as string) === "suppressHydrationWarning") return true;
  }
  return false;
};

interface JsxContextCheck {
  insideJsxRender: boolean;
  suppressed: boolean;
}

// Walks the parent chain from `start` to determine:
// - whether this expression is rendered into JSX synchronously (i.e.
//   reached a JSXExpressionContainer or JSXAttribute value before any
//   function-like boundary), and
// - whether any enclosing JSX element (or ancestor) carries
//   `suppressHydrationWarning`.
// Bails to `insideJsxRender: false` when it crosses a function-like
// node (ArrowFunctionExpression, FunctionExpression, FunctionDeclaration)
// because the expression only runs when the function is invoked, not
// at render time.
const inspectJsxContext = (start: AstNode): JsxContextCheck => {
  let suppressed = false;
  let insideJsxRender = false;
  let cursor: AstNode | undefined = start.parent;
  while (cursor) {
    const type = cursor.type;
    if (
      !insideJsxRender &&
      (type === "ArrowFunctionExpression" ||
        type === "FunctionExpression" ||
        type === "FunctionDeclaration")
    ) {
      // Crossed a function boundary BEFORE reaching a JSX render site
      // — the expression lives inside a nested callback/handler and
      // does not execute at render time, so the rule should skip it.
      // (Once we are inside JSX render, the surrounding component
      // function is just the natural enclosing scope and is fine.)
      return { insideJsxRender: false, suppressed: false };
    }
    if (type === "JSXExpressionContainer" || type === "JSXSpreadAttribute") {
      insideJsxRender = true;
    }
    if (type === "JSXElement") {
      if (hasSuppressHydrationAttribute(cursor)) {
        suppressed = true;
      }
    }
    cursor = cursor.parent;
  }
  return { insideJsxRender, suppressed };
};

const buildMessage = (label: string): string =>
  `Wrap \`${label}\` in an element with \`suppressHydrationWarning\` — server/client outputs will diverge here and noisy hydration warnings hide real bugs.`;

export const renderingHydrationSuppressWarning: EslintRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Wrap non-deterministic values (new Date(), Math.random(), Intl.*, etc.) rendered in JSX with `suppressHydrationWarning` to avoid hydration mismatch noise.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/rendering-hydration-suppress-warning.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const reportIfFlagged = (node: AstNode, label: string): void => {
      const ctx = inspectJsxContext(node);
      if (!ctx.insideJsxRender) return;
      if (ctx.suppressed) return;
      context.report({ node, message: buildMessage(label) });
    };

    return {
      NewExpression(node) {
        const astNode = node as AstNode;
        const label = classifyNewExpression(astNode);
        if (label) reportIfFlagged(astNode, label);
      },
      CallExpression(node) {
        const astNode = node as AstNode;
        const label = classifyCallExpression(astNode);
        if (label) reportIfFlagged(astNode, label);
      },
    };
  },
};

export default renderingHydrationSuppressWarning;
