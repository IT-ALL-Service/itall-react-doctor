import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: a Next.js App Router error boundary file (`error.tsx`
// or `global-error.tsx`) without a top-level `"use client"` directive.
// Per the framework spec, every `error.tsx` MUST be a Client Component
// — Error boundaries rely on React's `componentDidCatch` lifecycle and
// the `reset()` callback exposed by the framework is a client function.
// Forgetting the directive does not always fail loudly at dev time but
// blows up in production builds.
//
// itall internal style: `packages/claude-presets/rules/nextjs.md` §7-1.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const ERROR_BOUNDARY_FILE_PATTERN = /(^|\/)(global-)?error\.tsx?$/;

const USE_CLIENT_DIRECTIVE = "use client";

const startsWithUseClient = (program: AstNode): boolean => {
  // Two AST shapes are observed across parsers:
  //   1. legacy: `program.directives[0].value.value === "use client"`
  //   2. modern: `program.body[0]` is an ExpressionStatement whose
  //      `directive` field equals "use client"
  const legacyDirectives = program.directives as Array<AstNode> | undefined;
  if (legacyDirectives) {
    for (const directive of legacyDirectives) {
      const value = directive.value as AstNode | undefined;
      if (
        value?.type === "DirectiveLiteral" &&
        (value as unknown as { value: string }).value === USE_CLIENT_DIRECTIVE
      ) {
        return true;
      }
    }
  }
  const body = (program.body as Array<AstNode> | undefined) ?? [];
  for (const statement of body) {
    if (!statement || statement.type !== "ExpressionStatement") return false;
    const directiveTag = (statement as unknown as { directive?: string }).directive;
    if (directiveTag === USE_CLIENT_DIRECTIVE) return true;
    const expression = statement.expression as AstNode | undefined;
    if (
      expression?.type === "Literal" &&
      (expression as unknown as { value: unknown }).value === USE_CLIENT_DIRECTIVE
    ) {
      return true;
    }
    // First non-directive statement → we've left the directive prologue
    return false;
  }
  return false;
};

export const errorTsxUseClient = defineItallRule({
  id: "error-tsx-use-client",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        'Next.js App Router의 `error.tsx` 파일은 `"use client"`를 선언해야 합니다. Error boundary는 프레임워크 명세상 client-only입니다.',
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/error-tsx-use-client.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const filename = context.getFilename?.() ?? "";
    if (!ERROR_BOUNDARY_FILE_PATTERN.test(filename)) return {};
    return {
      Program(node) {
        const programNode = node as AstNode;
        if (startsWithUseClient(programNode)) return;
        context.report({
          node,
          message:
            '파일 첫 줄에 `"use client";`를 추가하세요. Next.js App Router의 error boundary(`error.tsx` / `global-error.tsx`)는 React lifecycle(`componentDidCatch`)과 프레임워크가 제공하는 client 함수 `reset()`에 의존하므로 클라이언트에서 실행되어야 합니다.',
        });
      },
    };
  },
});

export default errorTsxUseClient;
