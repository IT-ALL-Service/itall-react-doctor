import { describe, expect, it } from "vite-plus/test";
import plugin, { ITALL_DEFINITIONS } from "../src/index.js";

describe("@it-all-service/eslint-plugin-itall-react", () => {
  it("exports a plugin object with the expected shape", () => {
    expect(plugin.meta.name).toBe("itall-react");
    expect(typeof plugin.meta.version).toBe("string");
    expect(plugin.rules).toBeDefined();
  });

  it("registers the rerender-use-ref-transient-values rule", () => {
    const rule = plugin.rules["rerender-use-ref-transient-values"];
    expect(rule).toBeDefined();
    expect(rule.meta.type).toBe("problem");
    expect(rule.meta.docs.recommended).toBe(true);
    expect(rule.meta.docs.description).toContain("useState");
    expect(typeof rule.create).toBe("function");
  });

  it("create() returns a visitor object with the expected entries", () => {
    const rule = plugin.rules["rerender-use-ref-transient-values"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.tsx",
    });
    expect(typeof visitor.Program).toBe("function");
    expect(typeof visitor.CallExpression).toBe("function");
    expect(typeof visitor.JSXAttribute).toBe("function");
  });

  it("registers the rendering-hydration-suppress-warning rule", () => {
    const rule = plugin.rules["rendering-hydration-suppress-warning"];
    expect(rule).toBeDefined();
    expect(rule.meta.type).toBe("problem");
    expect(rule.meta.docs.recommended).toBe(true);
    expect(rule.meta.docs.description).toContain("suppressHydrationWarning");
    expect(typeof rule.create).toBe("function");
  });

  it("rendering-hydration-suppress-warning visitor covers expression hooks", () => {
    const rule = plugin.rules["rendering-hydration-suppress-warning"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.tsx",
    });
    expect(typeof visitor.NewExpression).toBe("function");
    expect(typeof visitor.CallExpression).toBe("function");
  });

  it("registers the async-cheap-condition-before-await rule", () => {
    const rule = plugin.rules["async-cheap-condition-before-await"];
    expect(rule).toBeDefined();
    expect(rule.meta.type).toBe("problem");
    expect(rule.meta.docs.recommended).toBe(true);
    expect(rule.meta.docs.description).toContain("await");
    expect(typeof rule.create).toBe("function");
  });

  it("async-cheap-condition-before-await visitor covers LogicalExpression", () => {
    const rule = plugin.rules["async-cheap-condition-before-await"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.ts",
    });
    expect(typeof visitor.LogicalExpression).toBe("function");
  });

  it("registers the server-parallel-nested-fetching rule", () => {
    const rule = plugin.rules["server-parallel-nested-fetching"];
    expect(rule).toBeDefined();
    expect(rule.meta.type).toBe("problem");
    expect(rule.meta.docs.recommended).toBe(true);
    expect(rule.meta.docs.description).toContain("Promise.all");
    expect(typeof rule.create).toBe("function");
  });

  it("server-parallel-nested-fetching visitor covers function bodies and Program", () => {
    const rule = plugin.rules["server-parallel-nested-fetching"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.ts",
    });
    expect(typeof visitor.FunctionDeclaration).toBe("function");
    expect(typeof visitor.FunctionExpression).toBe("function");
    expect(typeof visitor.ArrowFunctionExpression).toBe("function");
    expect(typeof visitor.Program).toBe("function");
  });

  it("ITALL_DEFINITIONS carries metadata for every registered rule", () => {
    expect(ITALL_DEFINITIONS.length).toBeGreaterThan(0);
    expect(ITALL_DEFINITIONS.length).toBe(Object.keys(plugin.rules).length);
    for (const definition of ITALL_DEFINITIONS) {
      expect(typeof definition.id).toBe("string");
      expect(["error", "warn", "off"]).toContain(definition.defaultSeverity);
      expect(definition.rule).toBe(plugin.rules[definition.id]);
    }
  });

  it("server-parallel-nested-fetching is tagged test-noise (auto-suppresses in test files)", () => {
    const definition = ITALL_DEFINITIONS.find(
      (entry) => entry.id === "server-parallel-nested-fetching",
    );
    expect(definition).toBeDefined();
    expect(definition?.tags ?? []).toContain("test-noise");
  });

  it("registers the rerender-split-combined-hooks rule", () => {
    const rule = plugin.rules["rerender-split-combined-hooks"];
    expect(rule).toBeDefined();
    expect(rule.meta.type).toBe("problem");
    expect(rule.meta.docs.recommended).toBe(true);
    expect(rule.meta.docs.description).toContain("useMemo");
    expect(typeof rule.create).toBe("function");
  });

  it("rerender-split-combined-hooks visitor covers CallExpression", () => {
    const rule = plugin.rules["rerender-split-combined-hooks"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.tsx",
    });
    expect(typeof visitor.CallExpression).toBe("function");
  });
});
