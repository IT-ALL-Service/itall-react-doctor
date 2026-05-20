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

  // tags-based auto-suppress runs in `mergeAndFilterDiagnostics`, not
  // inside `runOxlint` (which `collectRuleHits` uses). The behavioral
  // verification lives in `tests/merge-and-filter-diagnostics.test.ts`
  // — kept there alongside the upstream `async-parallel` test-noise
  // cases for parity.
});

describe("itall/rerender-split-combined-hooks", () => {
  it("flags a useMemo body whose two steps have disjoint dep subsets", async () => {
    const projectDir = setupReactProject(tempRoot, "split-combined-hooks-fire", {
      files: {
        "src/products.tsx": `import { useMemo } from "react";

interface Product { category: string; price: number }
interface Props { products: Product[]; category: string; sortOrder: "asc" | "desc" }

export function ProductList({ products, category, sortOrder }: Props) {
  const sortedProducts = useMemo(() => {
    const filtered = products.filter((p) => p.category === category);
    const sorted = filtered.toSorted((a, b) =>
      sortOrder === "asc" ? a.price - b.price : b.price - a.price,
    );
    return sorted;
  }, [products, category, sortOrder]);

  return <ul>{sortedProducts.map((p) => <li key={p.category}>{p.price}</li>)}</ul>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "rerender-split-combined-hooks");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a useMemo whose single step uses every dep", async () => {
    const projectDir = setupReactProject(tempRoot, "split-combined-hooks-single", {
      files: {
        "src/total.tsx": `import { useMemo } from "react";

interface Props { products: { price: number }[]; taxRate: number }

export function Total({ products, taxRate }: Props) {
  const total = useMemo(
    () => products.reduce((sum, p) => sum + p.price, 0) * (1 + taxRate),
    [products, taxRate],
  );

  return <div>{total}</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "rerender-split-combined-hooks");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a useMemo whose steps share at least one dep (non-disjoint)", async () => {
    const projectDir = setupReactProject(tempRoot, "split-combined-hooks-overlapping", {
      files: {
        "src/dashboard.tsx": `import { useMemo } from "react";

interface Props { products: { id: string; price: number }[]; filterId: string; multiplier: number }

export function Dashboard({ products, filterId, multiplier }: Props) {
  // Both steps reference \`products\` — the dep subsets are not
  // disjoint, so splitting would not avoid any recompute.
  const summary = useMemo(() => {
    const matched = products.find((p) => p.id === filterId);
    const adjustedTotal = products.reduce((sum, p) => sum + p.price, 0) * multiplier;
    return { matched, adjustedTotal };
  }, [products, filterId, multiplier]);

  return <pre>{JSON.stringify(summary)}</pre>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "rerender-split-combined-hooks");
    expect(hits.length).toBe(0);
  });
});

describe("itall/server-serialization", () => {
  it("flags a 'use client' component reading just 1 field of a destructured object prop", async () => {
    const projectDir = setupReactProject(tempRoot, "server-serialization-one-field", {
      files: {
        "src/profile.tsx": `"use client";

interface User { id: string; name: string; email: string; avatarUrl: string }

export function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-serialization");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags reading 2 distinct fields", async () => {
    const projectDir = setupReactProject(tempRoot, "server-serialization-two-fields", {
      files: {
        "src/avatar.tsx": `"use client";

interface User { id: string; name: string; avatarUrl: string }

export function Avatar({ user }: { user: User }) {
  return <img src={user.avatarUrl} alt={user.name} />;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-serialization");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a Server Component (no 'use client' directive)", async () => {
    const projectDir = setupReactProject(tempRoot, "server-serialization-no-client", {
      files: {
        "src/server-profile.tsx": `interface User { id: string; name: string; email: string }

export function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-serialization");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a component reading 3+ fields (legitimate prop bag)", async () => {
    const projectDir = setupReactProject(tempRoot, "server-serialization-many-fields", {
      files: {
        "src/card.tsx": `"use client";

interface User { name: string; email: string; bio: string; avatarUrl: string }

export function Card({ user }: { user: User }) {
  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      <p>{user.bio}</p>
    </div>
  );
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-serialization");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag when the prop is spread or passed whole", async () => {
    const projectDir = setupReactProject(tempRoot, "server-serialization-spread", {
      files: {
        "src/forward.tsx": `"use client";

interface User { id: string; name: string }

declare function audit(payload: object): void;

export function Forward({ user }: { user: User }) {
  audit(user);
  return <div data-id={user.id}>...</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "server-serialization");
    expect(hits.length).toBe(0);
  });
});

// NOTE: `async-api-routes` was deliberately NOT shipped — upstream's
// `react-doctor/server-sequential-independent-await` already covers
// the same pattern across every async function body, and a sidecar
// copy targeting `route.ts(x)` would double-report on the same line
// and skew the diagnostic score. See `docs/sidecar-eslint-plugin-plan.md`
// (overlap policy + rule 5 status) for the decision record.
