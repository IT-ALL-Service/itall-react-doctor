import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: interface or type alias names that carry meaningless
// language-marker affixes — `IUser`, `TUser`, `FooType`, `BarInterface`.
// The TypeScript compiler already knows it is a type; encoding that
// information in the name adds noise and makes types and the runtime
// values they describe drift apart. itall convention reserves
// suffixes for *domain meaning*: `UserDto` for an API payload,
// `UserModel` for a data-layer entity, `UserEntity` for an ORM
// shape — those are allowed because they communicate WHERE in the
// stack the type lives, not THAT it is a type.
//
// itall internal style: `packages/claude-presets/rules/typescript.md`
// (type declarations section).
//
// Implementation note: we walk the Program body once instead of
// relying on `TSInterfaceDeclaration`/`TSTypeAliasDeclaration`
// selectors. Those selector names are standard ESTree but are not
// known to fire under oxlint's JS plugin loader (no upstream rule
// exercises them, and v0.4.0's hydration regression taught us not to
// trust un-validated selectors). `Program` is proven; the in-body
// walk costs ~one pass over top-level statements per file, which is
// negligible.

interface AstNode {
  type: string;
  [key: string]: unknown;
}

// Suffix → descriptive replacement hint used in the diagnostic.
// `Model`/`Entity`/`Dto` carry domain meaning and are explicitly
// excluded from the blacklist.
const FORBIDDEN_SUFFIX_PATTERN = /(?:Type|Interface)$/;

// `I` followed by an uppercase letter (`IUser`, `IUserDto`) or
// `T` followed by an uppercase letter when the next char is not a
// number (so we don't false-flag `T1` / `T2` generic-style aliases
// in legacy code). We require Pascal-case to avoid matching things
// like `Item` or `Tag` where the second character is lowercase.
const FORBIDDEN_PREFIX_PATTERN = /^([IT])[A-Z]/;

// Suffixes that pass through — they convey storage/transport role,
// not "this is a type".
const DOMAIN_SUFFIX_ALLOWLIST: ReadonlyArray<string> = ["Model", "Entity", "Dto"];

const hasAllowedDomainSuffix = (name: string): boolean => {
  for (const suffix of DOMAIN_SUFFIX_ALLOWLIST) {
    if (name.endsWith(suffix)) return true;
  }
  return false;
};

interface NamingViolation {
  shape: string;
}

const classifyName = (name: string): NamingViolation | null => {
  if (!name) return null;
  if (hasAllowedDomainSuffix(name)) return null;
  if (FORBIDDEN_SUFFIX_PATTERN.test(name)) {
    const match = name.match(FORBIDDEN_SUFFIX_PATTERN);
    return { shape: `suffix \`${match?.[0] ?? "Type"}\`` };
  }
  if (FORBIDDEN_PREFIX_PATTERN.test(name)) {
    const prefixChar = name.charAt(0);
    return { shape: `prefix \`${prefixChar}\`` };
  }
  return null;
};

const visitDeclaration = (
  declaration: AstNode | undefined | null,
  context: EslintRuleContext,
): void => {
  if (!declaration) return;
  const type = declaration.type;
  // Type alias and interface AST node types in TS-ESTree.
  if (type !== "TSInterfaceDeclaration" && type !== "TSTypeAliasDeclaration") return;
  const id = declaration.id as AstNode | undefined;
  if (!id || id.type !== "Identifier") return;
  const name = id.name as string | undefined;
  if (!name) return;
  const violation = classifyName(name);
  if (!violation) return;
  const kind = type === "TSInterfaceDeclaration" ? "interface" : "type";
  context.report({
    node: declaration,
    message: `\`${kind} ${name}\` carries the ${violation.shape} marker — drop it (TypeScript already knows it's a type) or replace with a domain suffix (\`Model\` / \`Entity\` / \`Dto\`) when the role matters.`,
  });
};

const walkTopLevel = (program: AstNode, context: EslintRuleContext): void => {
  const body = (program.body as Array<AstNode> | undefined) ?? [];
  for (const statement of body) {
    if (!statement) continue;
    visitDeclaration(statement, context);
    // Also handle `export interface X {}` / `export type X = ...`
    if (statement.type === "ExportNamedDeclaration") {
      const inner = statement.declaration as AstNode | undefined;
      visitDeclaration(inner, context);
    }
  }
};

export const noTypePrefixSuffix = defineItallRule({
  id: "no-type-prefix-suffix",
  defaultSeverity: "warn",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Drop language-marker prefixes / suffixes on type names (`IUser`, `FooType`). TypeScript already knows it's a type. Domain suffixes (`Model`, `Entity`, `Dto`) are allowed because they convey role.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/no-type-prefix-suffix.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    return {
      Program(node) {
        walkTopLevel(node as AstNode, context);
      },
    };
  },
});

export default noTypePrefixSuffix;
