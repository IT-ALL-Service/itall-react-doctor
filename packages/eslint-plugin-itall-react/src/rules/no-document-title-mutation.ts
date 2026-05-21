import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: assigning to `document.title` (or compound assignment
// like `+=`) to update the page's title. Crawlers and OG/Twitter
// preview bots only read the HTML response — they never execute the
// JS that would run this assignment. The Next.js App Router exposes a
// proper `metadata` / `generateMetadata` export that is rendered into
// the initial HTML; everything else is a band-aid that breaks SEO and
// social previews silently.
//
// itall internal style: `packages/claude-presets/rules/nextjs.md` §5.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isDocumentTitleMemberExpression = (node: AstNode | undefined): boolean => {
  if (!node || node.type !== "MemberExpression") return false;
  if ((node as unknown as { computed?: boolean }).computed === true) return false;
  const object = node.object as AstNode | undefined;
  const property = node.property as AstNode | undefined;
  if (object?.type !== "Identifier" || (object.name as string) !== "document") return false;
  if (property?.type !== "Identifier" || (property.name as string) !== "title") return false;
  return true;
};

export const noDocumentTitleMutation = defineItallRule({
  id: "no-document-title-mutation",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "`document.title`을 직접 변경하지 않습니다. crawler는 server HTML만 보므로 Next.js Metadata API(`metadata` / `generateMetadata`)로 title을 응답에 포함합니다.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/no-document-title-mutation.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      AssignmentExpression(node) {
        const assignment = node as AstNode;
        const left = assignment.left as AstNode | undefined;
        if (!isDocumentTitleMemberExpression(left)) return;
        context.report({
          node,
          message:
            "hydration 이후에 설정한 `document.title`은 crawler와 social preview bot이 볼 수 없습니다. title을 App Router의 `metadata` export 또는 `generateMetadata({ params })`로 옮겨 initial HTML에 포함되게 하세요.",
        });
      },
    };
  },
});

export default noDocumentTitleMutation;
