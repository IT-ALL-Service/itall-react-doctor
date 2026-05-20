# @it-all-service/eslint-plugin-itall-react

itall 팀 전용 React/Next.js lint 룰 모음. [`@it-all-service/react-doctor`](../react-doctor)에 사이드카 형태로 주입돼 단일 점수 파이프라인을 탄다.

## 왜 별도 plugin인가

- upstream `oxlint-plugin-react-doctor`(178개 룰)는 fork하지 않는다. upstream 변경을 따라가기 쉽도록.
- 사내에서 추가하고 싶은 룰은 [Vercel `react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) 중 upstream이 아직 mechanical로 잡지 못하는 패턴 위주.
- ESLint 표준 형태(`{ meta, create }`)로 작성해 oxlint의 JS plugin 메커니즘으로 로드된다 — `eslint-plugin-react-hooks`와 동일한 통합 경로.

## 설치

이 패키지는 보통 `@it-all-service/react-doctor`와 함께 설치한다. 자세한 셋업은 [상위 README](../../README.md) 참고. 단독 설치만 떼서 보면:

```ini
# .npmrc
@it-all-service:registry=https://npm.pkg.github.com
```

```bash
pnpm add -D @it-all-service/eslint-plugin-itall-react
```

CLI 쪽에서는 `optional` peer dep이라 이 plugin을 빼도 fork CLI는 그대로 동작한다(사내 룰만 비활성화).

## 현재 룰 목록

| 룰 키                                        | 기본 심각도 | Vercel 원문                                                                                                                                                             |
| -------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itall/rerender-use-ref-transient-values`    | `warn`      | [rerender-use-ref-transient-values](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-use-ref-transient-values.md)       |
| `itall/rendering-hydration-suppress-warning` | `warn`      | [rendering-hydration-suppress-warning](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rendering-hydration-suppress-warning.md) |
| `itall/async-cheap-condition-before-await`   | `warn`      | [async-cheap-condition-before-await](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-cheap-condition-before-await.md)     |
| `itall/server-parallel-nested-fetching`      | `warn`      | [server-parallel-nested-fetching](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-parallel-nested-fetching.md)           |
| `itall/rerender-split-combined-hooks`        | `warn`      | [rerender-split-combined-hooks](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-split-combined-hooks.md)               |
| `itall/server-serialization`                 | `warn`      | [server-serialization](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-serialization.md)                                 |

**사내 룰 출처: [`IT-ALL-Service/packages` claude-presets](https://github.com/IT-ALL-Service/packages/tree/main/packages/claude-presets/rules)**

| 룰 키                                | 기본 심각도 | 사내 가이드                                       |
| ------------------------------------ | ----------- | ------------------------------------------------- |
| `itall/no-process-env-direct-access` | `warn`      | nextjs.md §8 — 환경변수 Zod 검증 모듈 강제        |
| `itall/error-tsx-use-client`         | `warn`      | nextjs.md §7-1 — App Router error boundary 규약   |
| `itall/tanstack-query-key-array`     | `warn`      | nextjs.md §3-4 — TanStack Query 쿼리 키 배열 강제 |

> **`async-api-routes`는 의도적으로 구현하지 않는다.** 같은 패턴(독립적 sequential await)을 upstream `react-doctor/server-sequential-independent-await`(과 3+개일 땐 `async-parallel`)가 이미 잡는다. 사이드카에서 또 잡으면 동일 라인에 진단이 중복으로 떠서 점수가 이중으로 깎인다. 자세한 결정은 [`docs/sidecar-eslint-plugin-plan.md`](../../docs/sidecar-eslint-plugin-plan.md)의 룰 5 항목과 "겹침 정책" 섹션 참고.

### `itall/rerender-use-ref-transient-values`

고빈도 이벤트 핸들러(`mousemove`/`scroll`/`touchmove`/`wheel`/`pointermove`/`drag`/`dragover`) 안에서 `useState` 셋터를 호출하면 매 이벤트마다 리렌더가 트리거된다. 일시적 값(좌표·플래그)은 `useRef` + 직접 DOM 조작으로 처리해야 한다.

❌ 잘못된 예:

```tsx
function Tracker() {
  const [lastX, setLastX] = useState(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setLastX(e.clientX);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return <div style={{ transform: `translateX(${lastX}px)` }} />;
}
```

✅ 올바른 예:

```tsx
function Tracker() {
  const lastXRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastXRef.current = e.clientX;
      if (dotRef.current) {
        dotRef.current.style.transform = `translateX(${e.clientX}px)`;
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return <div ref={dotRef} />;
}
```

JSX 어트리뷰트(`onMouseMove`, `onScroll`, `onTouchMove`, `onWheel`, `onPointerMove`, `onDrag`, `onDragOver`)에서도 동일하게 검출된다. 별도 함수로 정의한 핸들러를 식별자로 전달한 경우(`window.addEventListener('mousemove', onMove)` 등)도 같은 파일 안의 함수 정의를 따라가 검사한다.

### `itall/rendering-hydration-suppress-warning`

SSR 프레임워크(Next.js 등)에서 서버와 클라이언트 렌더링 결과가 의도적으로 달라지는 비결정적 값(현재 시간, 랜덤 ID, 로캘 포맷팅)을 JSX 안에 그대로 렌더링하면 hydration 불일치 경고가 발생한다. 의도된 불일치라면 `suppressHydrationWarning` 어트리뷰트로 명시적으로 표시해 노이즈를 줄여야 한다.

❌ 잘못된 예:

```tsx
function Timestamp() {
  return <span>{new Date().toLocaleString()}</span>;
}
```

✅ 올바른 예:

```tsx
function Timestamp() {
  return <span suppressHydrationWarning>{new Date().toLocaleString()}</span>;
}
```

감지 대상: `new Date()`, `Date.now()`, `Math.random()`, `crypto.randomUUID()`, `new Intl.DateTimeFormat()` 류, `Intl.*()` 호출. 부모 또는 조상 JSX element에 `suppressHydrationWarning`이 있으면 진단을 건너뛴다.

### `itall/async-cheap-condition-before-await`

`&&` 조건에서 `await ...`가 LHS이고 RHS가 cheap한 sync 체크(Literal/Identifier/MemberExpression/`!flag`/`typeof x`)일 때, 두 피연산자를 뒤집어 cheap 체크가 false면 await을 건너뛰도록 권고한다. 네트워크/디스크 IO를 일찍 차단해 핫패스의 비용을 줄이는 패턴.

❌ 잘못된 예:

```ts
if ((await fetchUser(id)) && featureFlag.enabled) {
  // ...
}
```

✅ 올바른 예:

```ts
if (featureFlag.enabled && (await fetchUser(id))) {
  // ...
}
```

CallExpression / NewExpression / TemplateLiteral with expressions / 또 다른 await이 RHS에 있으면 "cheap"이 아니라고 보고 진단을 내지 않는다.

### `itall/server-parallel-nested-fetching`

`const xs = await Promise.all(items.map(getX))` 같은 stage-1 fetch 직후, 그 결과를 받아서 다시 `const ys = await Promise.all(xs.map(getY))`로 stage-2 fetch를 도는 패턴은 단계 사이에서 waterfall을 만든다 — 모든 항목이 stage-1을 끝내야 stage-2가 시작된다. 각 항목별로 두 fetch를 직렬 체인하면 row 단위로 병렬화된다.

❌ 잘못된 예:

```ts
const xs = await Promise.all(items.map((id) => getX(id)));
const ys = await Promise.all(xs.map((x) => getY(x)));
```

✅ 올바른 예:

```ts
const ys = await Promise.all(items.map((id) => getX(id).then(getY)));
```

같은 블록 스코프 안에서 첫 번째 결과 식별자가 두 번째 `.map()` 수신자로 들어가는 경우만 매치한다. 분기·중간 statement 통과 같은 복잡한 케이스는 false negative 허용.

### `itall/rerender-split-combined-hooks`

`useMemo(() => {...}, [d1, d2, d3])` body 안에 독립적인 두 단계가 같이 묶여 있는데 각 단계가 서로 다른 dep subset만 참조하면, 한 dep만 바뀌어도 모든 단계가 재계산된다. 단계를 별도 `useMemo`로 쪼개면 각 단계는 자기 dep이 바뀔 때만 재계산된다.

❌ 잘못된 예 (`sortOrder`가 바뀌면 filter도 재계산):

```tsx
const sortedProducts = useMemo(() => {
  const filtered = products.filter((p) => p.category === category);
  const sorted = filtered.toSorted((a, b) =>
    sortOrder === "asc" ? a.price - b.price : b.price - a.price,
  );
  return sorted;
}, [products, category, sortOrder]);
```

✅ 올바른 예 (filter는 `[products, category]`에만, sort는 `[filteredProducts, sortOrder]`에만 반응):

```tsx
const filteredProducts = useMemo(
  () => products.filter((p) => p.category === category),
  [products, category],
);

const sortedProducts = useMemo(
  () =>
    filteredProducts.toSorted((a, b) =>
      sortOrder === "asc" ? a.price - b.price : b.price - a.price,
    ),
  [filteredProducts, sortOrder],
);
```

검출 조건은 보수적이다 — 진단을 띄우려면 (1) `useMemo`(또는 `React.useMemo`), (2) deps 2개 이상의 단순 identifier 배열, (3) body 안에 `const X = ...` 2개 이상, (4) **그 중 두 단계가 서로 disjoint한 dep subset만 참조** (어느 한 단계가 모든 dep를 쓰면 "통합" 단계로 보고 skip). `useCallback`/`useEffect`는 다루지 않는다 — body 분리가 의미·순서를 바꿀 위험이 더 크다.

### `itall/server-serialization`

`'use client'` 디렉티브가 있는 파일의 컴포넌트가 destructured object prop을 받았지만 그 안의 필드 한두 개만 읽으면, 부모(보통 Server Component)가 모든 필드를 RSC 경계 너머로 직렬화하고 있다는 강한 신호다. flat prop으로 풀어서 받으면 페이로드가 작아진다.

❌ 잘못된 예:

```tsx
// 'use client';
export function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>; // user의 50개 필드가 모두 직렬화됨
}
```

✅ 올바른 예:

```tsx
// 'use client';
export function Profile({ name }: { name: string }) {
  return <div>{name}</div>;
}

// 호출부 (Server Component):
// <Profile name={user.name} />
```

검출 조건 (보수적):

1. 파일 최상단에 `"use client"` 디렉티브가 있을 때만 발화 (RSC 경계가 명확)
2. Pascal-cased 함수 컴포넌트의 첫 param이 `ObjectPattern` (destructured)
3. 각 destructured binding에 대해 body 전체를 walk — 모든 참조가 `binding.<staticField>` 형태이고
4. 그렇게 접근한 distinct field 개수가 1~2개일 때만 flag

다음과 같으면 발화하지 않는다 (의도된 prop bag으로 간주):

- `binding`을 통째로 다른 함수에 전달 (`audit(user)`)
- `<div {...binding} />` 같은 spread
- `binding[dynamicKey]` 같은 computed 접근
- 3개 이상 필드 접근

> **한계:** 진짜 anti-pattern은 호출부(Server Component 쪽)에 있지만 cross-file 분석이 필요해 한 파일 단위 lint로는 잡지 못한다. 이 룰은 client 쪽에서 보이는 "내가 적게 쓰는데 통째로 받고 있다"는 신호만 잡는다. 자세한 결정 기록은 [`docs/sidecar-eslint-plugin-plan.md`](../../docs/sidecar-eslint-plugin-plan.md) §0-1 그룹 C 참고.

### `itall/no-process-env-direct-access`

`process.env.X`는 `string | undefined`를 반환하고 `NEXT_PUBLIC_` vs 서버 전용 구분도 코드에서 자취가 안 남는다. itall 컨벤션(`nextjs.md` §8)은 한 모듈(`@/lib/env`)에서 Zod로 모든 환경변수를 검증·타입화·내보내고, 다른 파일은 그 모듈만 import하는 것. 이 룰은 그 컨벤션을 강제한다.

❌ 잘못된 예 (컨슈머 파일):

```tsx
export function Banner() {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY; // string | undefined
  return <div data-key={apiKey}>...</div>;
}
```

✅ 올바른 예:

```tsx
import { env } from "@/lib/env";

export function Banner() {
  return <div data-key={env.NEXT_PUBLIC_API_KEY}>...</div>;
}
```

`lib/env.ts`, `src/lib/env.ts`, `app/env.ts`, `config/env.ts`, 또는 루트 `env.ts`처럼 환경변수를 정의하는 파일 자체에서는 `process.env` 접근이 허용된다 (그 모듈이 "한 곳"). 이 외의 파일에서 `process.env.X` 형태(member access)가 등장하면 진단.

### `itall/error-tsx-use-client`

Next.js App Router에서 `error.tsx` / `global-error.tsx`는 Error boundary 역할로 React 라이프사이클(`componentDidCatch`)에 의존하므로 반드시 Client Component여야 한다. `"use client"` directive가 누락되면 빌드는 통과해도 런타임에 깨진다.

❌ 잘못된 예:

```tsx
// app/dashboard/error.tsx
export default function DashboardError({ error, reset }: Props) {
  return <button onClick={reset}>Retry</button>;
}
```

✅ 올바른 예:

```tsx
// app/dashboard/error.tsx
"use client";

export default function DashboardError({ error, reset }: Props) {
  return <button onClick={reset}>Retry</button>;
}
```

파일명이 `(^|/)(global-)?error\.tsx?$`에 매칭되는 경우에만 visitor가 활성화된다. 다른 파일은 비용 없음.

### `itall/tanstack-query-key-array`

TanStack Query는 `queryKey` 배열의 구조적 동등성으로 캐시 identity를 식별한다. 비배열 (`"events"`, identifier 외 expression)은 동작은 하지만 다른 모듈의 `invalidateQueries({ queryKey: ["events"] })`와 매칭이 안 되어 캐시가 조용히 stale 상태가 된다.

❌ 잘못된 예:

```tsx
const { data } = useQuery({ queryKey: "events", queryFn: fetchEvents });
// ...
queryClient.invalidateQueries({ queryKey: ["events"] }); // 매칭 안 됨, 캐시 stale
```

✅ 올바른 예:

```tsx
const { data } = useQuery({ queryKey: ["events", filter], queryFn: () => fetchEvents(filter) });
queryClient.invalidateQueries({ queryKey: ["events"] }); // 매칭됨, prefix invalidation
```

대상 호출: `useQuery`, `useInfiniteQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, `useQueries`, `useMutation`, 그리고 `queryClient.*` 메서드(`invalidateQueries`, `prefetchQuery`, `fetchQuery` 등). 첫 인자가 plain `ObjectExpression`이고 `queryKey`/`mutationKey` property의 값이 ArrayExpression이 아닐 때 발화. `Identifier`(외부 factory 키)나 `CallExpression`(키 빌더 호출)은 conservative skip.

## 개발

```bash
pnpm --filter @it-all-service/eslint-plugin-itall-react build
pnpm --filter @it-all-service/eslint-plugin-itall-react typecheck
pnpm --filter @it-all-service/eslint-plugin-itall-react test
pnpm gen   # rule 추가/삭제/이름변경 후 registry 재생성 (root에서)
```

룰 추가 절차 (codegen 도입 후):

1. `src/rules/<rule-key>.ts` 작성
   - export 이름은 kebab→camelCase (`async-foo-bar` → `asyncFooBar`)
   - `EslintRule` shape, `meta.docs.url`은 GitHub blob URL로
2. `pnpm gen` 실행 — `src/registry.gen.ts`와 `packages/core/src/runners/oxlint/itall-rules.gen.ts`가 자동으로 갱신됨 (default severity `warn`)
3. `tests/plugin-shape.test.ts`에 smoke test 추가
4. (선택) `packages/react-doctor/tests/regressions/itall-sidecar-rules.test.ts`에 E2E 케이스 추가 — silent-failure 회귀 방지용 (v0.4.0 hydration 사고의 교훈)
5. 이 README 룰 목록 갱신
6. 심각도를 `warn` 외로 두려면 `scripts/generate-itall-registry.mjs`의 `SEVERITY_OVERRIDES` 맵에 엔트리 추가 후 `pnpm gen`

`*.gen.ts` 파일은 git에 커밋된다 (upstream과 동일한 방식 — 리뷰 시점에 wiring 변화를 한눈에 볼 수 있어 의도적).

## 라이선스

MIT.
