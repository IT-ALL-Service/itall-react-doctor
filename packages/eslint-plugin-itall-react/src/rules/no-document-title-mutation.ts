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
        "Don't mutate `document.title` directly — crawlers see only the server HTML. Use the Next.js Metadata API (`metadata` / `generateMetadata`) so the title is in the response.",
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
            "Setting `document.title` after hydration is invisible to crawlers and social preview bots. Move the title into the App Router's `metadata` export (or `generateMetadata({ params })`) so it ships in the initial HTML.",
        });
      },
    };
  },
});

export default noDocumentTitleMutation;
