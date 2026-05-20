import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: direct access to `process.env.X` outside the project's
// designated env module. `process.env.X` returns `string | undefined`,
// loses the secret-vs-public distinction, and lets a typo silently
// produce `undefined` at runtime. itall's convention is to fix this
// once in a `@/lib/env` module that:
//   - validates all expected variables with Zod at startup,
//   - asserts the `NEXT_PUBLIC_` vs server-only split, and
//   - exports a single typed `env` object every consumer imports.
//
// This rule fires on `process.env.<anything>` access in any file other
// than that single defining module. The whitelist (`isEnvDefiningFile`)
// uses filename matching only — no module-graph traversal — which means
// callers can land env stubs under the conventional paths and the rule
// stays out of their way.
//
// itall internal style: `packages/claude-presets/rules/nextjs.md` §8.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

// Files where direct `process.env.X` access is the intended pattern —
// these are the singletons that everyone else imports `env` from.
// Pattern matches `env.ts` / `env.js` / `env.mjs` etc. living anywhere
// in `lib/` or at the repo root (covers `lib/env.ts`, `src/lib/env.ts`,
// `app/env.ts`, plain `env.ts`). Files outside this allowlist must
// import the typed `env` instead of reaching for `process.env`.
const ENV_DEFINING_FILE_PATTERN =
  /(?:^|\/)(?:lib|src\/lib|app|src\/app|config|src\/config)\/env\.[cm]?[jt]sx?$|(?:^|\/)env\.[cm]?[jt]sx?$/;

const isEnvDefiningFile = (filename: string): boolean => {
  if (!filename) return false;
  const normalized = filename.replaceAll("\\", "/");
  return ENV_DEFINING_FILE_PATTERN.test(normalized);
};

const isProcessEnvAccess = (memberNode: AstNode): boolean => {
  // Matches the AST shape `<process>.<env>.<X>` — a MemberExpression
  // whose object is itself the MemberExpression `process.env`.
  const object = memberNode.object as AstNode | undefined;
  if (!object || object.type !== "MemberExpression") return false;
  const innerObject = object.object as AstNode | undefined;
  const innerProperty = object.property as AstNode | undefined;
  if (innerObject?.type !== "Identifier" || (innerObject.name as string) !== "process")
    return false;
  if (innerProperty?.type !== "Identifier" || (innerProperty.name as string) !== "env")
    return false;
  if ((object as unknown as { computed?: boolean }).computed === true) return false;
  return true;
};

const describeAccess = (memberNode: AstNode): string => {
  const property = memberNode.property as AstNode | undefined;
  const computed = (memberNode as unknown as { computed?: boolean }).computed === true;
  if (property?.type === "Identifier" && !computed) {
    return `process.env.${property.name as string}`;
  }
  if (
    property?.type === "Literal" &&
    computed &&
    typeof (property as unknown as { value: unknown }).value === "string"
  ) {
    return `process.env[${JSON.stringify((property as unknown as { value: string }).value)}]`;
  }
  return "process.env.*";
};

export const noProcessEnvDirectAccess = defineItallRule({
  id: "no-process-env-direct-access",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct `process.env.X` access outside the designated env-defining module — import the validated `env` object instead so types are preserved and the public/secret split is enforced.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/no-process-env-direct-access.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const filename = context.getFilename?.() ?? "";
    if (isEnvDefiningFile(filename)) return {};
    return {
      MemberExpression(node) {
        const member = node as AstNode;
        if (!isProcessEnvAccess(member)) return;
        const label = describeAccess(member);
        context.report({
          node,
          message: `Replace \`${label}\` with \`import { env } from "@/lib/env"\` — \`process.env\` returns \`string | undefined\` and bypasses the Zod-validated env contract. Add the variable to \`lib/env.ts\` if it is new.`,
        });
      },
    };
  },
});

export default noProcessEnvDirectAccess;
