import { describe, expect, it } from "vite-plus/test";
import plugin from "../src/index.js";

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

  it("rendering-hydration-suppress-warning visitor covers JSX traversal hooks", () => {
    const rule = plugin.rules["rendering-hydration-suppress-warning"];
    const visitor = rule.create({
      report: () => {},
      getFilename: () => "test.tsx",
    });
    expect(typeof visitor.JSXElement).toBe("function");
    expect(typeof visitor["JSXElement:exit"]).toBe("function");
    expect(typeof visitor.JSXExpressionContainer).toBe("function");
  });
});
