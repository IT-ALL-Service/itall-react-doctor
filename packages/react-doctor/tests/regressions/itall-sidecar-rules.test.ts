/**
 * E2E regression tests for the @it-all-service/eslint-plugin-itall-react
 * sidecar rules. Each test drops a fixture file into a synthetic React
 * project, runs the full oxlint pipeline (same pipeline the CLI runs),
 * and asserts at least one diagnostic for the targeted itall rule.
 *
 * The v0.4.0 hydration rule shipped with a silent-failure visitor that
 * unit shape tests could not catch (the rule fired in jest but not
 * under oxlint's JS plugin loader). These tests close that gap by
 * exercising the actual oxlint→JS plugin path used in production.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { collectRuleHits, setupReactProject } from "./_helpers.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rd-itall-sidecar-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("itall/async-cheap-condition-before-await", () => {
  it("flags `await ... && cheap` inside an if condition", async () => {
    const projectDir = setupReactProject(tempRoot, "async-cheap-if", {
      files: {
        "src/handler.ts": `declare function fetchUser(id: string): Promise<unknown>;
declare const featureFlag: { enabled: boolean };

export async function run(id: string) {
  if ((await fetchUser(id)) && featureFlag.enabled) {
    return true;
  }
  return false;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "async-cheap-condition-before-await");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag the recommended cheap-first ordering", async () => {
    const projectDir = setupReactProject(tempRoot, "async-cheap-ok", {
      files: {
        "src/handler.ts": `declare function fetchUser(id: string): Promise<unknown>;
declare const featureFlag: { enabled: boolean };

export async function run(id: string) {
  if (featureFlag.enabled && (await fetchUser(id))) {
    return true;
  }
  return false;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "async-cheap-condition-before-await");
    expect(hits.length).toBe(0);
  });
});

describe("itall/server-parallel-nested-fetching", () => {
  it("flags two-stage `await Promise.all(arr.map(...))` waterfalls", async () => {
    const projectDir = setupReactProject(tempRoot, "server-parallel-nested", {
      files: {
        "src/data.ts": `declare function getX(id: string): Promise<{ id: string }>;
declare function getY(item: { id: string }): Promise<unknown>;

export async function loadAll(items: string[]) {
  const xs = await Promise.all(items.map((id) => getX(id)));
  const ys = await Promise.all(xs.map((x) => getY(x)));
  return ys;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-parallel-nested-fetching");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a single Promise.all stage", async () => {
    const projectDir = setupReactProject(tempRoot, "server-parallel-single", {
      files: {
        "src/data.ts": `declare function getX(id: string): Promise<{ id: string }>;

export async function loadAll(items: string[]) {
  const xs = await Promise.all(items.map((id) => getX(id)));
  return xs;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-parallel-nested-fetching");
    expect(hits.length).toBe(0);
  });
});

// NOTE: `async-api-routes` was deliberately NOT shipped — upstream's
// `react-doctor/server-sequential-independent-await` already covers
// the same pattern across every async function body, and a sidecar
// copy targeting `route.ts(x)` would double-report on the same line
// and skew the diagnostic score. See `docs/sidecar-eslint-plugin-plan.md`
// (overlap policy + rule 5 status) for the decision record.
