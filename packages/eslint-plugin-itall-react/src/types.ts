export interface EslintRuleVisitor {
  [selector: string]: ((node: unknown) => void) | undefined;
}

export interface EslintRuleContext {
  report: (descriptor: { node: unknown; message: string }) => void;
  getFilename?: () => string;
}

export interface EslintRuleMeta {
  type: "problem" | "suggestion" | "layout";
  docs: {
    description: string;
    url: string;
    recommended: boolean;
  };
  schema: unknown[];
}

export interface EslintRule {
  meta: EslintRuleMeta;
  create: (context: EslintRuleContext) => EslintRuleVisitor;
}

export interface ItallReactPlugin {
  meta: { name: string; version: string };
  rules: Record<string, EslintRule>;
}
