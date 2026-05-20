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
