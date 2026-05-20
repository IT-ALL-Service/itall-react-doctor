import { defineItallRule } from "../define-itall-rule.js";
import type { EslintRuleContext, EslintRuleVisitor } from "../types.js";

// Event names emitted at very high frequency. setState in handlers
// attached to these listeners forces a React render on every event,
// which is the anti-pattern this rule targets. See:
// https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-use-ref-transient-values.md
const HIGH_FREQUENCY_DOM_EVENTS: ReadonlySet<string> = new Set([
  "mousemove",
  "pointermove",
  "scroll",
  "touchmove",
  "wheel",
  "drag",
  "dragover",
]);

// JSX prop equivalents of the high-frequency events above.
const HIGH_FREQUENCY_JSX_PROPS: ReadonlySet<string> = new Set([
  "onMouseMove",
  "onPointerMove",
  "onScroll",
  "onTouchMove",
  "onWheel",
  "onDrag",
  "onDragOver",
]);

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isFunctionLike = (node: AstNode | undefined | null): boolean =>
  !!node &&
  (node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration");

// Recursively walk an AST subtree and visit every node. We only need a
// minimal walker because we are scanning known function bodies, not
// arbitrary source. No deps on estraverse/eslint-utils.
const walkSubtree = (node: AstNode | undefined | null, visit: (n: AstNode) => void): void => {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node);
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

const findUseStateSetterName = (node: AstNode): string | null => {
  // Match `const [_, setX] = useState(...)` and capture "setX".
  if (node.type !== "VariableDeclarator") return null;
  const id = node.id as AstNode | undefined;
  const init = node.init as AstNode | undefined;
  if (!id || id.type !== "ArrayPattern" || !init) return null;
  const elements = id.elements as Array<AstNode | null> | undefined;
  if (!elements || elements.length < 2) return null;
  const setter = elements[1];
  if (!setter || setter.type !== "Identifier") return null;

  const initCallee = init.type === "CallExpression" ? (init.callee as AstNode | undefined) : null;
  if (!initCallee) return null;
  // `useState(...)` — bare identifier
  if (initCallee.type === "Identifier" && initCallee.name === "useState") {
    return (setter.name as string) ?? null;
  }
  // `React.useState(...)`
  if (
    initCallee.type === "MemberExpression" &&
    (initCallee.property as AstNode | undefined)?.type === "Identifier" &&
    ((initCallee.property as AstNode).name as string) === "useState"
  ) {
    return (setter.name as string) ?? null;
  }
  return null;
};

const collectSetterNames = (programBody: ReadonlyArray<AstNode>): Set<string> => {
  const setters = new Set<string>();
  const visit = (node: AstNode): void => {
    const name = findUseStateSetterName(node);
    if (name) setters.add(name);
  };
  for (const stmt of programBody) walkSubtree(stmt, visit);
  return setters;
};

// Collects identifiers in the file that resolve to a function-like
// node, so we can follow `addEventListener('mousemove', onMove)` back
// to the body of `onMove`. We cover the three idiomatic forms used in
// React code; closures captured inside other functions are also caught
// because the walker descends through every nested statement.
const collectFunctionDefinitions = (programBody: ReadonlyArray<AstNode>): Map<string, AstNode> => {
  const definitions = new Map<string, AstNode>();
  const recordVariableDeclarator = (node: AstNode): void => {
    const id = node.id as AstNode | undefined;
    const init = node.init as AstNode | undefined;
    if (!id || id.type !== "Identifier" || !init) return;
    if (!isFunctionLike(init)) return;
    const name = id.name as string | undefined;
    if (name && !definitions.has(name)) definitions.set(name, init);
  };
  const recordFunctionDeclaration = (node: AstNode): void => {
    const id = node.id as AstNode | undefined;
    if (!id || id.type !== "Identifier") return;
    const name = id.name as string | undefined;
    if (name && !definitions.has(name)) definitions.set(name, node);
  };
  const visit = (node: AstNode): void => {
    if (node.type === "VariableDeclarator") recordVariableDeclarator(node);
    else if (node.type === "FunctionDeclaration") recordFunctionDeclaration(node);
  };
  for (const stmt of programBody) walkSubtree(stmt, visit);
  return definitions;
};

// Resolves a handler argument to a function-like body. Inline
// functions return themselves; identifiers are looked up in the
// program-scope definition map collected at Program-entry time. We do
// not chase chains of identifier-to-identifier reassignments because
// that is rare in React handler wiring and risks loops.
const resolveHandlerFunction = (
  handler: AstNode | undefined | null,
  definitions: ReadonlyMap<string, AstNode>,
): AstNode | null => {
  if (!handler) return null;
  if (isFunctionLike(handler)) return handler;
  if (handler.type === "Identifier") {
    const name = handler.name as string | undefined;
    if (!name) return null;
    return definitions.get(name) ?? null;
  }
  return null;
};

interface ListenerMatch {
  event: string;
  handlerNode: AstNode;
}

const matchAddEventListenerCall = (node: AstNode): ListenerMatch | null => {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee as AstNode | undefined;
  if (!callee || callee.type !== "MemberExpression") return null;
  const prop = callee.property as AstNode | undefined;
  if (!prop || prop.type !== "Identifier" || prop.name !== "addEventListener") return null;
  const args = node.arguments as Array<AstNode> | undefined;
  if (!args || args.length < 2) return null;
  const firstArg = args[0];
  const handler = args[1];
  if (
    !firstArg ||
    firstArg.type !== "Literal" ||
    typeof firstArg.value !== "string" ||
    !HIGH_FREQUENCY_DOM_EVENTS.has(firstArg.value)
  ) {
    return null;
  }
  if (!handler) return null;
  return { event: firstArg.value, handlerNode: handler };
};

const findSetterCallsInHandlerBody = (
  handlerFunction: AstNode,
  setters: ReadonlySet<string>,
): Array<{ node: AstNode; setter: string }> => {
  const hits: Array<{ node: AstNode; setter: string }> = [];
  walkSubtree(handlerFunction.body as AstNode, (innerNode) => {
    if (innerNode.type !== "CallExpression") return;
    const callee = innerNode.callee as AstNode | undefined;
    if (!callee || callee.type !== "Identifier") return;
    const name = callee.name as string | undefined;
    if (name && setters.has(name)) {
      hits.push({ node: innerNode, setter: name });
    }
  });
  return hits;
};

const buildMessage = (eventName: string, setter: string): string =>
  `Avoid calling \`${setter}\` (useState setter) inside a high-frequency \`${eventName}\` handler — it forces a render on every event. Use \`useRef\` for transient values and mutate the DOM directly.`;

export const rerenderUseRefTransientValues = defineItallRule({
  id: "rerender-use-ref-transient-values",
  defaultSeverity: "warn",
  meta: {
    type: "problem",
    docs: {
      description:
        "Avoid useState updates inside high-frequency event handlers (mousemove, scroll, etc.); use useRef for transient values.",
      url: "https://github.com/IT-ALL-Service/itall-react-doctor/blob/main/packages/eslint-plugin-itall-react/src/rules/rerender-use-ref-transient-values.ts",
      recommended: true,
    },
    schema: [],
  },
  create: (context: EslintRuleContext): EslintRuleVisitor => {
    let knownSetters: Set<string> = new Set();
    let functionDefinitions: Map<string, AstNode> = new Map();
    return {
      Program(node) {
        const programNode = node as AstNode;
        const body = (programNode.body as Array<AstNode> | undefined) ?? [];
        knownSetters = collectSetterNames(body);
        functionDefinitions = collectFunctionDefinitions(body);
      },
      CallExpression(node) {
        if (knownSetters.size === 0) return;
        const callNode = node as AstNode;
        const listener = matchAddEventListenerCall(callNode);
        if (!listener) return;
        const handlerFunction = resolveHandlerFunction(listener.handlerNode, functionDefinitions);
        if (!handlerFunction) return;
        for (const hit of findSetterCallsInHandlerBody(handlerFunction, knownSetters)) {
          context.report({
            node: hit.node,
            message: buildMessage(listener.event, hit.setter),
          });
        }
      },
      JSXAttribute(node) {
        if (knownSetters.size === 0) return;
        const attr = node as AstNode;
        const name = attr.name as AstNode | undefined;
        if (!name || name.type !== "JSXIdentifier") return;
        const attrName = name.name as string | undefined;
        if (!attrName || !HIGH_FREQUENCY_JSX_PROPS.has(attrName)) return;
        const value = attr.value as AstNode | undefined;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const expression = value.expression as AstNode | undefined;
        const handlerFunction = resolveHandlerFunction(expression, functionDefinitions);
        if (!handlerFunction) return;
        // Strip the leading "on", lowercase first char of remainder, to
        // mirror the DOM event name in messages: "onMouseMove" -> "mousemove".
        const eventName = attrName.slice(2).toLowerCase();
        for (const hit of findSetterCallsInHandlerBody(handlerFunction, knownSetters)) {
          context.report({
            node: hit.node,
            message: buildMessage(eventName, hit.setter),
          });
        }
      },
    };
  },
});

export default rerenderUseRefTransientValues;
