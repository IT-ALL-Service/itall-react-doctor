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

| 룰 키                                     | 기본 심각도 | Vercel 원문                                                                                                                                                       |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itall/rerender-use-ref-transient-values` | `warn`      | [rerender-use-ref-transient-values](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-use-ref-transient-values.md) |

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

JSX 어트리뷰트(`onMouseMove`, `onScroll`, `onTouchMove`, `onWheel`, `onPointerMove`, `onDrag`, `onDragOver`)에서도 동일하게 검출된다.

## 향후 추가 예정

설계 문서([`docs/sidecar-eslint-plugin-plan.md`](../../docs/sidecar-eslint-plugin-plan.md))의 lintability HIGH 룰 4개를 단계적으로 추가:

- `async-cheap-condition-before-await`
- `rendering-hydration-suppress-warning`
- `server-parallel-nested-fetching`
- `async-api-routes`

## 개발

```bash
pnpm --filter @it-all-service/eslint-plugin-itall-react build
pnpm --filter @it-all-service/eslint-plugin-itall-react typecheck
pnpm --filter @it-all-service/eslint-plugin-itall-react test
```

룰 추가 절차:

1. `src/rules/<rule-key>.ts` 작성 — `EslintRule` shape, `meta.docs.url`은 GitHub blob URL로
2. `src/index.ts`의 `rules` 객체에 등록
3. fork CLI의 `packages/core/src/runners/oxlint/plugin-resolution.ts`에 있는 `ITALL_REACT_RULES`에 `itall/<rule-key>: "warn" | "error"` 추가
4. `tests/`에 smoke test 추가
5. 이 README 룰 목록 갱신

## 라이선스

MIT.
