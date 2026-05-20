import type { EslintRule, EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: non-deterministic expressions (current time, random
// values, locale-sensitive formatting) rendered directly inside JSX
// without `suppressHydrationWarning` on the wrapping element. In SSR
// frameworks the server-rendered and client-rendered HTML diverge,
// producing noisy hydration warnings. See:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rendering-hydration-suppress-warning.md

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const walkSubtree = (
  node: AstNode | undefined | null,
  visit: (n: AstNode) => boolean | void,
): void => {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  if (visit(node) === false) return;
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walkSubtree(child as AstNode, visit);
    } else if (value && typeof value === "object" && typeof (value as AstNode).type === "string") {
      walkSubtree(value as AstNode, visit);
    }
  }
};

const memberObjectName = (node: AstNode): string | null => {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return (node.name as string) ?? null;
  return null;
};

const memberPropertyName = (node: AstNode): string | null => {
  const prop = node.property as AstNode | undefined;
  if (!prop || prop.type !== "Identifier") return null;
  return (prop.name as string) ?? null;
};

// Identifies a single AST node as a non-deterministic source. Returns
// a short label used in the diagnostic message, or null if the node
// is deterministic / unrelated.
const classifyNonDeterministic = (node: AstNode): string | null => {
  if (node.type === "NewExpression") {
    const callee = node.callee as AstNode | undefined;
    if (!callee) return null;
    if (callee.type === "Identifier" && callee.name === "Date") return "new Date()";
    if (callee.type === "MemberExpression" && memberObjectName(callee) === "Intl") {
      const name = memberPropertyName(callee);
      return name ? `new Intl.${name}()` : "new Intl.*()";
    }
  }
  if (node.type === "CallExpression") {
    const callee = node.callee as AstNode | undefined;
    if (!callee) return null;
    if (callee.type === "MemberExpression") {
      const object = memberObjectName(callee);
      const property = memberPropertyName(callee);
      if (!property) return null;
      if (object === "Date" && property === "now") return "Date.now()";
      if (object === "Math" && property === "random") return "Math.random()";
      if (object === "crypto" && property === "randomUUID") return "crypto.randomUUID()";
      if (object === "Intl") return `Intl.${property}()`;
    }
  }
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

interface NonDeterministicHit {
  node: AstNode;
  label: string;
}

const collectNonDeterministicHits = (expressionRoot: AstNode): NonDeterministicHit[] => {
  const hits: NonDeterministicHit[] = [];
  walkSubtree(expressionRoot, (innerNode) => {
    const label = classifyNonDeterministic(innerNode);
    if (label) {
      hits.push({ node: innerNode, label });
      // Do not descend further; the outer expression already represents
      // the violation site, and child nodes (e.g., args) often produce
      // redundant matches.
      return false;
    }
  });
  return hits;
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
    // Stack of `suppressHydrationWarning` flags for currently-open JSX
    // elements. We only need to know if ANY ancestor in the open chain
    // suppresses, so each entry stores the running "ancestor suppresses
    // or self suppresses" boolean. Top of stack is true iff at least
    // one ancestor JSX element has the attribute.
    const suppressionStack: boolean[] = [];

    return {
      JSXElement(node) {
        const element = node as AstNode;
        const selfSuppresses = hasSuppressHydrationAttribute(element);
        const ancestorSuppresses = suppressionStack[suppressionStack.length - 1] === true;
        suppressionStack.push(selfSuppresses || ancestorSuppresses);
      },
      "JSXElement:exit"() {
        suppressionStack.pop();
      },
      JSXExpressionContainer(node) {
        // Suppression is satisfied iff any ancestor JSXElement in the
        // open chain (or its self) carries `suppressHydrationWarning`.
        if (suppressionStack[suppressionStack.length - 1] === true) return;
        const container = node as AstNode;
        const expression = container.expression as AstNode | undefined;
        if (!expression) return;
        // Skip JSXEmptyExpression (e.g. `{/* comment */}`).
        if (expression.type === "JSXEmptyExpression") return;
        for (const hit of collectNonDeterministicHits(expression)) {
          context.report({
            node: hit.node,
            message: buildMessage(hit.label),
          });
        }
      },
    };
  },
};

export default renderingHydrationSuppressWarning;
