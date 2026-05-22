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
    expect(hits[0]?.category).toBe("사내 룰");
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

describe("itall/error-tsx-use-client", () => {
  it("flags an error.tsx file missing `'use client'` directive", async () => {
    const projectDir = setupReactProject(tempRoot, "error-tsx-missing-use-client", {
      files: {
        "src/app/error.tsx": `interface Props { error: Error; reset: () => void }

export default function GlobalError({ error, reset }: Props) {
  return (
    <div>
      <h2>Something broke</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "error-tsx-use-client");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag an error.tsx that declares `'use client'`", async () => {
    const projectDir = setupReactProject(tempRoot, "error-tsx-with-use-client", {
      files: {
        "src/app/error.tsx": `"use client";

interface Props { error: Error; reset: () => void }

export default function GlobalError({ error, reset }: Props) {
  return (
    <div>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "error-tsx-use-client");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a regular page.tsx file", async () => {
    const projectDir = setupReactProject(tempRoot, "page-tsx-no-fire", {
      files: {
        "src/app/page.tsx": `export default function HomePage() {
  return <main>Home</main>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "error-tsx-use-client");
    expect(hits.length).toBe(0);
  });
});

describe("itall/no-process-env-direct-access", () => {
  it("flags `process.env.API_KEY` in a regular consumer file", async () => {
    const projectDir = setupReactProject(tempRoot, "process-env-consumer", {
      files: {
        "src/components/banner.tsx": `export function Banner() {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  return <div data-key={apiKey}>...</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-process-env-direct-access");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag `process.env` access inside lib/env.ts (the env-defining module)", async () => {
    const projectDir = setupReactProject(tempRoot, "process-env-defining-module", {
      files: {
        "src/lib/env.ts": `export const env = {
  apiKey: process.env.API_KEY,
  publicBase: process.env.NEXT_PUBLIC_BASE,
};
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-process-env-direct-access");
    expect(hits.length).toBe(0);
  });
});

describe("itall/tanstack-query-key-array", () => {
  it("flags `useQuery({ queryKey: 'events' })` with a bare string key", async () => {
    const projectDir = setupReactProject(tempRoot, "tanstack-key-string", {
      files: {
        "src/list.tsx": `declare function useQuery<T>(options: { queryKey: unknown; queryFn: () => T }): { data: T | undefined };
declare function fetchEvents(): Promise<unknown[]>;

export function EventList() {
  const { data } = useQuery({ queryKey: "events", queryFn: fetchEvents });
  return <pre>{JSON.stringify(data)}</pre>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "tanstack-query-key-array");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags `useMutation({ mutationKey: 'create' })` with a bare string key", async () => {
    const projectDir = setupReactProject(tempRoot, "tanstack-mutation-key-string", {
      files: {
        "src/create.tsx": `declare function useMutation<TVars>(options: { mutationKey: unknown; mutationFn: (vars: TVars) => Promise<void> }): { mutate: (vars: TVars) => void };

export function CreateButton() {
  const { mutate } = useMutation({ mutationKey: "create-event", mutationFn: async () => {} });
  return <button onClick={() => mutate({})}>Create</button>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "tanstack-query-key-array");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag an array key", async () => {
    const projectDir = setupReactProject(tempRoot, "tanstack-key-array", {
      files: {
        "src/list.tsx": `declare function useQuery<T>(options: { queryKey: unknown; queryFn: () => T }): { data: T | undefined };
declare function fetchEvents(filter: unknown): Promise<unknown[]>;

export function EventList({ filter }: { filter: unknown }) {
  const { data } = useQuery({ queryKey: ["events", filter], queryFn: () => fetchEvents(filter) });
  return <pre>{JSON.stringify(data)}</pre>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "tanstack-query-key-array");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag identifier keys (factory-built key constants)", async () => {
    const projectDir = setupReactProject(tempRoot, "tanstack-key-identifier", {
      files: {
        "src/list.tsx": `declare function useQuery<T>(options: { queryKey: unknown; queryFn: () => T }): { data: T | undefined };
declare function fetchEvents(): Promise<unknown[]>;

const eventListKey = ["events", "all"] as const;

export function EventList() {
  const { data } = useQuery({ queryKey: eventListKey, queryFn: fetchEvents });
  return <pre>{JSON.stringify(data)}</pre>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "tanstack-query-key-array");
    expect(hits.length).toBe(0);
  });
});

describe("itall/route-segment-explicit-name", () => {
  it("flags a page.tsx whose default export is named `Page`", async () => {
    const projectDir = setupReactProject(tempRoot, "route-segment-page-generic", {
      files: {
        "src/app/dashboard/page.tsx": `export default function Page() {
  return <main>Dashboard</main>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "route-segment-explicit-name");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a page.tsx with a role-revealing function name", async () => {
    const projectDir = setupReactProject(tempRoot, "route-segment-page-named", {
      files: {
        "src/app/dashboard/page.tsx": `export default function DashboardPage() {
  return <main>Dashboard</main>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "route-segment-explicit-name");
    expect(hits.length).toBe(0);
  });

  it("does NOT activate in non-routing files", async () => {
    const projectDir = setupReactProject(tempRoot, "route-segment-non-routing", {
      files: {
        "src/components/page-shell.tsx": `export default function Page() {
  return <section>Some shell</section>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "route-segment-explicit-name");
    expect(hits.length).toBe(0);
  });
});

describe("itall/no-document-title-mutation", () => {
  it("flags `document.title = ...` assignment", async () => {
    const projectDir = setupReactProject(tempRoot, "document-title-mutate", {
      files: {
        "src/page.tsx": `import { useEffect } from "react";

export function Inner() {
  useEffect(() => {
    document.title = "Manual title";
  }, []);
  return <div />;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-document-title-mutation");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag reading document.title", async () => {
    const projectDir = setupReactProject(tempRoot, "document-title-read", {
      files: {
        "src/util.ts": `export function currentTitle(): string {
  return document.title;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-document-title-mutation");
    expect(hits.length).toBe(0);
  });
});

describe("itall/component-function-declaration", () => {
  it("flags a Pascal-named arrow component", async () => {
    const projectDir = setupReactProject(tempRoot, "component-arrow-pascal", {
      files: {
        "src/profile.tsx": `export const Profile = ({ name }: { name: string }) => {
  return <div>{name}</div>;
};
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "component-function-declaration");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a function-keyword component", async () => {
    const projectDir = setupReactProject(tempRoot, "component-function-keyword", {
      files: {
        "src/profile.tsx": `export function Profile({ name }: { name: string }) {
  return <div>{name}</div>;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "component-function-declaration");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a Pascal-named const that doesn't return JSX (factory helper)", async () => {
    const projectDir = setupReactProject(tempRoot, "component-pascal-factory", {
      files: {
        "src/factory.ts": `declare function createStore(): { value: number };

export const Store = () => createStore();
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "component-function-declaration");
    expect(hits.length).toBe(0);
  });
});

describe("itall/no-type-prefix-suffix", () => {
  it("flags an `IUser` interface (forbidden `I` prefix)", async () => {
    const projectDir = setupReactProject(tempRoot, "type-prefix-iuser", {
      files: {
        "src/types.ts": `export interface IUser {
  id: string;
  name: string;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-type-prefix-suffix");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags a `UserType` type alias (forbidden `Type` suffix)", async () => {
    const projectDir = setupReactProject(tempRoot, "type-suffix-type", {
      files: {
        "src/types.ts": `export type UserType = {
  id: string;
  name: string;
};
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-type-prefix-suffix");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag a plain `User` interface", async () => {
    const projectDir = setupReactProject(tempRoot, "type-plain-user", {
      files: {
        "src/types.ts": `export interface User {
  id: string;
  name: string;
}
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-type-prefix-suffix");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag domain-suffixed `UserDto` / `UserEntity` / `UserModel`", async () => {
    const projectDir = setupReactProject(tempRoot, "type-domain-suffix", {
      files: {
        "src/types.ts": `export interface UserDto { id: string }
export interface UserEntity { id: string; createdAt: Date }
export type UserModel = { id: string; name: string };
`,
      },
    });
    const hits = await collectRuleHits(projectDir, "no-type-prefix-suffix");
    expect(hits.length).toBe(0);
  });
});

// NOTE: `async-api-routes` was deliberately NOT shipped — upstream's
// `react-doctor/server-sequential-independent-await` already covers
// the same pattern across every async function body, and a sidecar
// copy targeting `route.ts(x)` would double-report on the same line
// and skew the diagnostic score. See `docs/sidecar-eslint-plugin-plan.md`
// (overlap policy + rule 5 status) for the decision record.
