import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: defining a React component as an arrow-function const
// (`const Foo = () => <div />`). The itall React guide mandates the
// `function` keyword for components because:
//   - Hoisting lets the file open with the public component API and
//     scroll downward into private helpers (top-down readability).
//   - Stack traces / React DevTools / the Profiler show the component
//     by its function name; anonymous arrows often surface as `<unknown>`.
//   - Generic component types (`function Foo<T>(props: ...)`) parse
//     cleanly; the arrow generic syntax (`<T,>`) is awkward in TSX.
//
// itall internal style: `packages/claude-presets/rules/react.md`
// (component definition section).
//
// Scope (conservative — fewer false positives than catching every
// Pascal-named arrow):
//   - Only flags arrow-function-or-function-expression initializers
//     assigned to a Pascal-named `const`/`let`/`var`.
//   - Only flags when the body actually returns JSX. Higher-order
//     helpers that happen to be Pascal-named (`const QueryProvider =
//     createProvider(...)`) are skipped.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const startsWithUppercase = (name: string): boolean => {
  if (name.length === 0) return false;
  const ch = name.charCodeAt(0);
  return ch >= 65 && ch <= 90;
};

const isJsxNode = (node: AstNode | undefined | null): boolean => {
  if (!node) return false;
  return node.type === "JSXElement" || node.type === "JSXFragment";
};

const walkSubtree = (
  node: AstNode | undefined | null,
  visit: (n: AstNode) => boolean | void,
): void => {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  const stopHere = visit(node) === false;
  if (stopHere) return;
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

const functionReturnsJsx = (functionNode: AstNode): boolean => {
  const body = functionNode.body as AstNode | undefined;
  if (!body) return false;
  // `() => <div />` — concise body
  if (body.type !== "BlockStatement") return isJsxNode(body);
  // Block body — scan only `return` statements that belong to THIS
  // function. Nested functions are a different scope, so we prune
  // their subtrees so a nested helper returning JSX doesn't lead the
  // outer Pascal-const to be flagged.
  let returnsJsx = false;
  walkSubtree(body, (node) => {
    if (returnsJsx) return false;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      // Skip nested function bodies entirely.
      return false;
    }
    if (node.type === "ReturnStatement") {
      const argument = node.argument as AstNode | undefined;
      if (argument && isJsxNode(argument)) returnsJsx = true;
    }
    return;
  });
  return returnsJsx;
};

export const componentFunctionDeclaration = defineItallRule({
  id: "component-function-declaration",
  defaultSeverity: "warn",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "React components should be declared with the `function` keyword (`function Foo() { ... }`), not as arrow-function consts. Improves stack traces, DevTools labels, and TSX generics ergonomics.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/component-function-declaration.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      VariableDeclarator(node) {
        const declarator = node as AstNode;
        const id = declarator.id as AstNode | undefined;
        if (!id || id.type !== "Identifier") return;
        const name = id.name as string | undefined;
        if (!name || !startsWithUppercase(name)) return;
        const init = declarator.init as AstNode | undefined;
        if (!init) return;
        if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") return;
        if (!functionReturnsJsx(init)) return;
        context.report({
          node,
          message: `Declare \`${name}\` with the \`function\` keyword (\`function ${name}(props) { ... }\`) instead of an arrow-function const. Function declarations hoist, get named in stack traces / React DevTools, and avoid the awkward \`<T,>\` generic workaround in TSX.`,
        });
      },
    };
  },
});

export default componentFunctionDeclaration;
