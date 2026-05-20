import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern (Vercel `server-serialization`): a Client Component
// (file with a top-level `"use client"` directive) destructures an
// object-shaped prop but only reads one or two fields of it. At the
// RSC ↔ Client boundary every property of the passed object is
// serialized into the HTML payload, so receiving a 50-field `user`
// just to render `user.name` ships ~49 fields of dead weight.
//
// Vercel spec:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-serialization.md
//
// Scope (deliberately narrow):
// - Only fires inside files declaring `"use client"` — that is the
//   only place we know we are sitting on an RSC serialization
//   boundary. Pure client SPAs do not pay this cost.
// - Only checks destructured object props (`function X({ user })`),
//   not whole-prop bags (`function X(props)`) — the destructure
//   itself is the unambiguous signal that the prop is an object and
//   that the parent is passing it by name.
// - Only flags when 1 or 2 distinct fields are read AND no other
//   usage shape exists (no spread, no computed access, no whole-
//   identifier reference). A spread or computed key means the body
//   "uses the whole object" and the parent is not obviously
//   over-serializing.
// - This rule cannot replace the full cross-file analysis the
//   Vercel spec implies (the caller, often in a server file, can
//   only be checked by walking the module graph). It catches the
//   half of cases where the smell is visible at the component
//   definition; for the rest we rely on review + the Vercel prose.

interface AstNode {
  type: string;
  parent?: AstNode;
  [key: string]: unknown;
}

const USE_CLIENT_DIRECTIVE = "use client";

const startsWithUppercase = (name: string): boolean => {
  if (name.length === 0) return false;
  const ch = name.charCodeAt(0);
  return ch >= 65 && ch <= 90;
};

const findUseClientDirective = (program: AstNode): boolean => {
  // ESTree exposes directives in two shapes depending on parser version:
  //   1. `program.directives` (legacy / espree): array of
  //      `{ value: { value: "use client" } }`
  //   2. `program.body[0]` is an `ExpressionStatement` whose
  //      `directive` is `"use client"` (newer parsers, oxlint
  //      included)
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
    if (!statement || statement.type !== "ExpressionStatement") break;
    const directiveTag = (statement as unknown as { directive?: string }).directive;
    if (directiveTag === USE_CLIENT_DIRECTIVE) return true;
    const expression = statement.expression as AstNode | undefined;
    if (
      expression?.type === "Literal" &&
      (expression as unknown as { value: unknown }).value === USE_CLIENT_DIRECTIVE
    ) {
      return true;
    }
    // Stop at the first non-directive statement so we do not pick up
    // string literals deeper in the file by accident.
    if (expression?.type !== "Literal") break;
  }
  return false;
};

const resolveComponentName = (node: AstNode): string | null => {
  if (node.type === "FunctionDeclaration") {
    const id = node.id as AstNode | undefined;
    if (id?.type === "Identifier") return id.name as string;
  }
  // Anonymous function/arrow assigned to a const — the binding name
  // is on the enclosing VariableDeclarator.
  const parent = node.parent;
  if (parent?.type === "VariableDeclarator") {
    const id = parent.id as AstNode | undefined;
    if (id?.type === "Identifier") return id.name as string;
  }
  return null;
};

const collectDestructuredPropBindings = (param: AstNode): string[] => {
  if (param.type !== "ObjectPattern") return [];
  const properties = (param.properties as Array<AstNode> | undefined) ?? [];
  const names: string[] = [];
  for (const property of properties) {
    if (!property) continue;
    if (property.type !== "Property") continue;
    if (property.computed === true) continue;
    const value = property.value as AstNode | undefined;
    if (value?.type === "Identifier") {
      names.push(value.name as string);
    }
    // RestElement / nested patterns intentionally skipped — those are
    // already a destructure refinement and not over-serialization shape.
  }
  return names;
};

const walkSubtree = (node: AstNode | undefined | null, visit: (n: AstNode) => void): void => {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node);
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

interface BindingUsage {
  uniqueFields: Set<string>;
  // True if we observed any reference that is NOT in the
  // `<binding>.<staticField>` shape — meaning the body uses the whole
  // object somehow (spread, computed key, passed to another function,
  // JSX prop value, etc.). When set, we skip this binding because the
  // serialization cost is already justified.
  usesWhole: boolean;
}

const analyzeBindingUsage = (functionNode: AstNode, bindingName: string): BindingUsage => {
  const result: BindingUsage = { uniqueFields: new Set<string>(), usesWhole: false };
  const body = functionNode.body as AstNode | undefined;
  if (!body) return result;

  walkSubtree(body, (current) => {
    if (result.usesWhole) return;
    if (current.type !== "Identifier") return;
    if ((current.name as string) !== bindingName) return;
    const parent = current.parent;
    if (!parent) {
      result.usesWhole = true;
      return;
    }
    // The identifier appearing in its own binding position (the
    // ObjectPattern Property `value`) is not a usage — skip.
    if (parent.type === "Property" && (parent.value as AstNode | undefined) === current) return;
    if (parent.type === "VariableDeclarator" && (parent.id as AstNode | undefined) === current)
      return;

    if (parent.type === "MemberExpression" && (parent.object as AstNode | undefined) === current) {
      if (parent.computed === true) {
        result.usesWhole = true;
        return;
      }
      const property = parent.property as AstNode | undefined;
      if (property?.type !== "Identifier") {
        result.usesWhole = true;
        return;
      }
      result.uniqueFields.add(property.name as string);
      return;
    }

    // Any other parent shape — spread, JSX prop, call argument, return
    // statement, etc. — means the binding flows out as a whole. The
    // serialization cost is already inherent.
    result.usesWhole = true;
  });
  return result;
};

const buildMessage = (
  componentName: string,
  bindingName: string,
  fields: ReadonlySet<string>,
): string => {
  const fieldList = [...fields]
    .sort()
    .map((field) => `\`${bindingName}.${field}\``)
    .join(", ");
  const replacement = [...fields]
    .sort()
    .map((field) => `${field}={${bindingName}.${field}}`)
    .join(" ");
  return `\`${componentName}\` reads only ${fields.size === 1 ? "" : `${fields.size} fields `}${fieldList} from prop \`${bindingName}\`, but every other property is still serialized across the RSC → Client boundary. Pass flat fields instead — \`<${componentName} ${replacement} />\` — so the server payload only includes what the component actually renders.`;
};

const checkFunction = (functionNode: AstNode, context: EslintRuleContext): void => {
  const name = resolveComponentName(functionNode);
  if (!name || !startsWithUppercase(name)) return;
  const params = (functionNode.params as Array<AstNode> | undefined) ?? [];
  if (params.length === 0) return;
  const firstParam = params[0];
  if (!firstParam || firstParam.type !== "ObjectPattern") return;
  const bindings = collectDestructuredPropBindings(firstParam);
  if (bindings.length === 0) return;
  for (const binding of bindings) {
    const usage = analyzeBindingUsage(functionNode, binding);
    if (usage.usesWhole) continue;
    const fieldCount = usage.uniqueFields.size;
    // Only fire for the high-signal range (1 or 2 fields). Three+
    // fields starts to look like a legitimate prop bag.
    if (fieldCount < 1 || fieldCount > 2) continue;
    context.report({
      node: functionNode,
      message: buildMessage(name, binding, usage.uniqueFields),
    });
  }
};

export const serverSerialization = defineItallRule({
  id: "server-serialization",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "In Client Components (`'use client'` files), destructuring an object prop and reading only 1–2 fields hints that the parent is serializing dozens of unused fields across the RSC boundary — pass flat fields instead.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/server-serialization.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    let isClientFile = false;
    const handleComponent = (node: unknown): void => {
      if (!isClientFile) return;
      checkFunction(node as AstNode, context);
    };
    return {
      Program(node) {
        isClientFile = findUseClientDirective(node as AstNode);
      },
      FunctionDeclaration: handleComponent,
      FunctionExpression: handleComponent,
      ArrowFunctionExpression: handleComponent,
    };
  },
});

export default serverSerialization;
