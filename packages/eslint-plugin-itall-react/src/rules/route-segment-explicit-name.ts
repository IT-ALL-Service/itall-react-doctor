import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: a Next.js App Router routing file
// (`page.tsx` / `layout.tsx` / `loading.tsx` / `not-found.tsx` /
// `template.tsx` / `default.tsx`) whose default export is an anonymous
// function or a function with the generic role name (`Page`, `Layout`,
// `Loading`, `Error`, `NotFound`, `Template`, `Default`). Generic
// names mean stack traces, React DevTools, and the React Profiler can't
// tell which page exploded — every page just shows up as "Page". Use
// role-revealing names like `RecruitListPage`, `RecruitListLoading`,
// `RecruitDetailLayout`.
//
// itall internal style: `packages/claude-presets/rules/nextjs.md` §4.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

// File path → expected role suffix the export name must contain.
// Order matters only for predictable error messages. `error.tsx` is
// owned by the sibling `error-tsx-use-client` rule and is excluded
// here so the two rules don't both fire on the same file.
const ROUTE_FILE_RULES: ReadonlyArray<{ pattern: RegExp; role: string; generic: string }> = [
  { pattern: /(?:^|\/)page\.tsx?$/, role: "Page", generic: "Page" },
  { pattern: /(?:^|\/)layout\.tsx?$/, role: "Layout", generic: "Layout" },
  { pattern: /(?:^|\/)loading\.tsx?$/, role: "Loading", generic: "Loading" },
  { pattern: /(?:^|\/)not-found\.tsx?$/, role: "NotFound", generic: "NotFound" },
  { pattern: /(?:^|\/)template\.tsx?$/, role: "Template", generic: "Template" },
  { pattern: /(?:^|\/)default\.tsx?$/, role: "Default", generic: "Default" },
];

const matchRouteFile = (filename: string): { role: string; generic: string } | null => {
  const normalized = filename.replaceAll("\\", "/");
  for (const entry of ROUTE_FILE_RULES) {
    if (entry.pattern.test(normalized)) return { role: entry.role, generic: entry.generic };
  }
  return null;
};

const isGenericName = (name: string | null, generic: string): boolean => {
  if (!name) return true; // anonymous → also generic
  // Exact match — `function Page() {}` is the canonical anti-pattern.
  if (name === generic) return true;
  // Bare-role prefix variants people sometimes use (`PageComponent`,
  // `PageImpl`). The role itself is still the only signal in the name.
  if (name === `${generic}Component` || name === `${generic}Impl`) return true;
  return false;
};

const resolveDefaultExportName = (declaration: AstNode | undefined | null): string | null => {
  if (!declaration) return null;
  // `export default function Foo() { ... }`
  if (declaration.type === "FunctionDeclaration") {
    const id = declaration.id as AstNode | undefined;
    if (id?.type === "Identifier") return id.name as string;
    return null;
  }
  // `export default <Identifier>` — `const Foo = ...; export default Foo;`
  if (declaration.type === "Identifier") return (declaration as unknown as { name: string }).name;
  return null;
};

export const routeSegmentExplicitName = defineItallRule({
  id: "route-segment-explicit-name",
  defaultSeverity: "warn",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Next.js routing files(page.tsx, layout.tsx 등)의 default export는 `Page` 같은 일반 이름 대신 `RecruitListPage`처럼 역할이 드러나는 이름으로 선언해 stack trace와 React DevTools에서 segment를 구분할 수 있게 합니다.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/route-segment-explicit-name.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const filename = context.getFilename?.() ?? "";
    const match = matchRouteFile(filename);
    if (!match) return {};

    return {
      ExportDefaultDeclaration(node) {
        const exportNode = node as AstNode;
        const declaration = exportNode.declaration as AstNode | undefined;
        const exportedName = resolveDefaultExportName(declaration);
        if (!isGenericName(exportedName, match.generic)) return;
        const exampleSegmentName =
          match.role === "Page"
            ? "RecruitListPage"
            : match.role === "Layout"
              ? "RecruitListLayout"
              : `RecruitList${match.role}`;
        context.report({
          node,
          message: `default export 이름을 \`${exampleSegmentName}\`처럼 역할이 드러나게 바꾸세요. \`${exportedName ?? "anonymous"}\` 같은 일반 이름은 stack trace와 DevTools에서 모든 routing segment를 똑같이 보이게 합니다.`,
        });
      },
    };
  },
});

export default routeSegmentExplicitName;
