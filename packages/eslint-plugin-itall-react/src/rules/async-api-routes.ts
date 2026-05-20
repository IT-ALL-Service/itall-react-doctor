import type { EslintRule, EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Anti-pattern: a Next.js App Router API route handler (`route.ts(x)`)
// that runs several `await`s sequentially when the later calls do not
// read the earlier ones' results. Every extra waterfall in a request
// handler compounds into client-visible latency, so independent calls
// should race via `Promise.all([...])` (or be started early as bare
// Promises and awaited at point of use). See:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-api-routes.md

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const HTTP_METHOD_NAMES: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// We only fire in App Router route handler files. Both `.ts` and `.tsx`
// are valid; pages-router API endpoints under `pages/api/**` are a
// different shape (`export default function handler(...)`) — those
// stay covered by upstream `server-sequential-independent-await`.
const isRouteFile = (filename: string | undefined): boolean => {
  if (!filename) return false;
  return /(^|\/)route\.tsx?$/.test(filename);
};

const collectBindingNames = (id: AstNode | undefined | null): Set<string> => {
  const names = new Set<string>();
  if (!id) return names;
  if (id.type === "Identifier") {
    names.add(id.name as string);
    return names;
  }
  if (id.type === "ObjectPattern") {
    const properties = id.properties as Array<AstNode> | undefined;
    for (const property of properties ?? []) {
      if (!property) continue;
      if (property.type === "Property") {
        const value = property.value as AstNode | undefined;
        if (value?.type === "Identifier") names.add(value.name as string);
        else if (value) {
          for (const nested of collectBindingNames(value)) names.add(nested);
        }
      } else if (property.type === "RestElement") {
        const argument = property.argument as AstNode | undefined;
        if (argument?.type === "Identifier") names.add(argument.name as string);
      }
    }
    return names;
  }
  if (id.type === "ArrayPattern") {
    const elements = id.elements as Array<AstNode | null> | undefined;
    for (const element of elements ?? []) {
      if (!element) continue;
      for (const nested of collectBindingNames(element)) names.add(nested);
    }
    return names;
  }
  return names;
};

const declarationBindings = (declaration: AstNode): Set<string> => {
  const out = new Set<string>();
  if (declaration.type !== "VariableDeclaration") return out;
  const declarators = declaration.declarations as Array<AstNode> | undefined;
  for (const declarator of declarators ?? []) {
    if (!declarator || declarator.type !== "VariableDeclarator") continue;
    for (const name of collectBindingNames(declarator.id as AstNode | undefined)) {
      out.add(name);
    }
  }
  return out;
};

const declarationHasAwaitInit = (declaration: AstNode): boolean => {
  if (declaration.type !== "VariableDeclaration") return false;
  const declarators = declaration.declarations as Array<AstNode> | undefined;
  for (const declarator of declarators ?? []) {
    if (!declarator) continue;
    const init = declarator.init as AstNode | undefined;
    if (init && init.type === "AwaitExpression") return true;
  }
  return false;
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

// True if any descendant of `declaration` reads an identifier in `names`.
const declarationReadsAny = (declaration: AstNode, names: ReadonlySet<string>): boolean => {
  if (names.size === 0) return false;
  let didRead = false;
  walkSubtree(declaration, (node) => {
    if (didRead) return;
    if (node.type === "Identifier" && names.has(node.name as string)) didRead = true;
  });
  return didRead;
};

interface IndependentChain {
  reportNode: AstNode;
  count: number;
}

// Walks a block of statements and reports the FIRST run of >= 2
// adjacent `await VariableDeclaration` statements where every later
// declaration's init does not reference any binding introduced earlier
// in the same run. We report once per route handler to keep noise low.
const findIndependentAwaitChain = (statements: ReadonlyArray<AstNode>): IndependentChain | null => {
  for (let start = 0; start < statements.length; start++) {
    const first = statements[start];
    if (!declarationHasAwaitInit(first)) continue;
    let count = 1;
    const accumulatedNames = new Set<string>(declarationBindings(first));
    let endNode: AstNode = first;
    for (let i = start + 1; i < statements.length; i++) {
      const candidate = statements[i];
      if (!declarationHasAwaitInit(candidate)) break;
      if (declarationReadsAny(candidate, accumulatedNames)) break;
      count++;
      endNode = candidate;
      for (const name of declarationBindings(candidate)) accumulatedNames.add(name);
    }
    if (count >= 2) return { reportNode: endNode, count };
  }
  return null;
};

const isHttpMethodFunction = (node: AstNode): { name: string; body: AstNode } | null => {
  // export async function GET(req) { ... }
  if (node.type === "FunctionDeclaration") {
    const id = node.id as AstNode | undefined;
    if (!id || id.type !== "Identifier") return null;
    const name = id.name as string;
    if (!HTTP_METHOD_NAMES.has(name)) return null;
    const body = node.body as AstNode | undefined;
    if (!body || body.type !== "BlockStatement") return null;
    return { name, body };
  }
  return null;
};

const findHttpMethodHandlersInVariableDeclaration = (
  declaration: AstNode,
): Array<{ name: string; body: AstNode }> => {
  // export const GET = async (req) => { ... }
  const out: Array<{ name: string; body: AstNode }> = [];
  if (declaration.type !== "VariableDeclaration") return out;
  const declarators = declaration.declarations as Array<AstNode> | undefined;
  for (const declarator of declarators ?? []) {
    if (!declarator || declarator.type !== "VariableDeclarator") continue;
    const id = declarator.id as AstNode | undefined;
    if (!id || id.type !== "Identifier") continue;
    const name = id.name as string;
    if (!HTTP_METHOD_NAMES.has(name)) continue;
    const init = declarator.init as AstNode | undefined;
    if (!init) continue;
    if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") continue;
    const body = init.body as AstNode | undefined;
    if (!body || body.type !== "BlockStatement") continue;
    out.push({ name, body });
  }
  return out;
};

const buildMessage = (handlerName: string, count: number): string =>
  `\`${handlerName}\` runs ${count} sequential \`await\`s with no data dependency between them — wrap them in \`Promise.all([...])\` (or kick off the promises early and await later) so the route handler's tail latency is the slowest single call, not the sum.`;

export const asyncApiRoutes: EslintRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "In Next.js `route.ts(x)` HTTP method handlers, parallelize independent `await` calls so request latency is the slowest call, not the sum.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/async-api-routes.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    const filename = context.getFilename?.() ?? "";
    if (!isRouteFile(filename)) {
      // Returning an empty visitor avoids paying the AST traversal cost
      // for the >99% of files that are not route handlers.
      return {};
    }

    const inspectHandler = (handlerName: string, body: AstNode): void => {
      const statements = (body.body as Array<AstNode> | undefined) ?? [];
      const chain = findIndependentAwaitChain(statements);
      if (!chain) return;
      context.report({
        node: chain.reportNode,
        message: buildMessage(handlerName, chain.count),
      });
    };

    return {
      ExportNamedDeclaration(node) {
        const exportNode = node as AstNode;
        const declaration = exportNode.declaration as AstNode | undefined;
        if (!declaration) return;
        const fnHandler = isHttpMethodFunction(declaration);
        if (fnHandler) {
          inspectHandler(fnHandler.name, fnHandler.body);
          return;
        }
        for (const variableHandler of findHttpMethodHandlersInVariableDeclaration(declaration)) {
          inspectHandler(variableHandler.name, variableHandler.body);
        }
      },
    };
  },
};

export default asyncApiRoutes;
