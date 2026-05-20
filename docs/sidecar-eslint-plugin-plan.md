# 사이드카 ESLint Plugin 통합 계획

> 상태: **13개 룰 구현 + 1개 의도적 미구현** (Vercel react-best-practices 6 + 사내 claude-presets 7)
> 최초 작성일: 2026-05-19 · 마지막 업데이트: 2026-05-20
> 목적: Vercel react-best-practices와 사내 [`IT-ALL-Service/packages` claude-presets](https://github.com/IT-ALL-Service/packages/tree/main/packages/claude-presets/rules)에서 mechanical하게 커버 못 하는 룰 중 안전하게 잡을 수 있는 것을 사내 ESLint plugin으로 추가하고, **단일 react-doctor 점수**에 합산되도록 통합

---

## 겹침 정책 (Overlap Policy)

react-doctor 점수는 모든 진단의 합으로 계산된다. 같은 anti-pattern을 사이드카 룰과 upstream `oxlint-plugin-react-doctor` 룰이 둘 다 잡으면 동일 라인에 진단이 두 번 뜨고 점수가 이중으로 깎인다. 그러므로:

- **사이드카 룰은 upstream과 겹치지 않을 때만 추가한다.** 추가 전 다음을 검토한다:
  1. 같은 anti-pattern을 잡는 upstream 룰이 이미 있는가 (`packages/oxlint-plugin-react-doctor/src/plugin/rules/**`)
  2. upstream 룰이 우리 케이스를 발화시키는가 (셀렉터·threshold·dependency-check 등)
  3. 둘 다 발화한다면, 사이드카는 만들지 않는다.
- **예외 — 사이드카가 더 sharp한 메시지/범위를 제공할 때**: upstream 룰을 core 필터에서 끄고 사이드카만 유지하거나, 사이드카의 심각도를 `off` 기본으로 두고 ad-hoc 사용. 이 경우에도 결정을 이 문서에 결정 기록(decision record)으로 남긴다.

이 정책은 회고적 결정. 룰 5(`async-api-routes`)가 upstream `server-sequential-independent-await`와 직접 겹쳐서 **미구현**으로 확정되며 채택됨.

---

## 현재 진척 (한눈에)

| #   | 룰                                           | 상태                                                                                                                 | 비고                                                                                    |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `itall/rerender-use-ref-transient-values`    | ✅ **구현 완료** (v0.3.0, identifier resolution은 v0.4.0)                                                            | 인라인 핸들러 + 같은 파일의 함수 정의 추적                                              |
| 2   | `itall/async-cheap-condition-before-await`   | ✅ **구현 완료** (v0.5.0)                                                                                            | LogicalExpression(`&&`) 분석                                                            |
| 3   | `itall/rendering-hydration-suppress-warning` | ✅ **구현 완료** (v0.4.0)                                                                                            | new Date/Math.random/Intl 등 + JSXElement 조상 스택                                     |
| 4   | `itall/server-parallel-nested-fetching`      | ✅ **구현 완료** (v0.5.0, `tags: ["test-noise"]`)                                                                    | `Promise.all(...map())` 두 단 sequential 변수 추적                                      |
| 5   | `itall/async-api-routes`                     | ❌ **의도적 미구현** — upstream `react-doctor/server-sequential-independent-await`(+3개부터 `async-parallel`)와 겹침 | 결정 근거는 위 "겹침 정책" · §3-룰5 데시전 레코드                                       |
| 6   | `itall/rerender-split-combined-hooks`        | ✅ **구현 완료** (useMemo 한정, 2026-05-20)                                                                          | dep array의 disjoint subset만 참조하는 step 분리 권고 · §3-룰6                          |
| 7   | `itall/server-serialization`                 | ✅ **구현 완료** (단일 파일, 2026-05-20)                                                                             | `'use client'` 파일에서 destructured prop 1~2 필드만 사용 시 flag · §3-룰7              |
| 8   | `itall/no-process-env-direct-access`         | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `nextjs.md` §8 — `process.env` 직접 접근 금지 · §3-룰8                   |
| 9   | `itall/error-tsx-use-client`                 | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `nextjs.md` §7-1 — error.tsx `"use client"` 누락 검출 · §3-룰9           |
| 10  | `itall/tanstack-query-key-array`             | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `nextjs.md` §3-4 — TanStack Query 키 배열 강제 · §3-룰10                 |
| 11  | `itall/route-segment-explicit-name`          | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `nextjs.md` §4 — 라우팅 파일 default export 이름 강제 · §3-룰11          |
| 12  | `itall/no-document-title-mutation`           | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `nextjs.md` §5 — `document.title` 직접 변경 금지 · §3-룰12               |
| 13  | `itall/component-function-declaration`       | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `react.md` — 컴포넌트 `function` 키워드 강제 · §3-룰13                   |
| 14  | `itall/no-type-prefix-suffix`                | ✅ **구현 완료** (사내, 2026-05-20)                                                                                  | claude-presets `typescript.md` — `IUser`/`FooType` 같은 마커 접두/접미사 금지 · §3-룰14 |

Vercel HIGH 5/5 + MEDIUM 그룹 C 중 mechanical 2개 + 사내 claude-presets 7개 = **13개 구현, 1개 의도적 미구현**. Vercel 70개 룰 audit은 §0-1·§0-2, 사내 룰 audit은 §0-3. 추가 후보 발굴은 사실상 종료, 다음 우선순위는 운영 관측 결과 기반 `warn`→`error` 승격 또는 룰 비활성 검토.

---

## 0-1. GAP 재검토 결과 (2026-05-20)

`v0.5.0` 출시 직전에 "lintability MEDIUM 7개"에 진짜 가성비 있는 룰이 있는지 재검토한 라운드. Vercel 70개 룰을 GitHub API로 직접 enumerate해서 upstream과 이름·의미 양쪽으로 매칭하고, MEDIUM 후보 7개의 prose를 batch 독파했다.

**결과: 추가로 구현 가능한 mechanical 룰은 0개.** PoC HIGH 5개는 처리 완료(4구현+1미구현), 나머지 MEDIUM/LOW는 아래 세 그룹 중 하나에 해당.

### 그룹 A — 🔴 prose-only (lint 불가)

"X API를 써라"라는 missing-call 패턴이라 false positive 폭발. lint 신호로 변환 불가.

- `rendering-resource-hints` — `prefetchDNS`/`preconnect`/`preload` 사용 권고
- `rendering-activity` — 토글되는 expensive 컴포넌트에 React 19 `<Activity>` 사용
- `rendering-content-visibility` — long list에 CSS `content-visibility:auto`
- `rendering-svg-precision`, `client-swr-dedup`, `async-suspense-boundaries`, `js-request-idle-callback`, `bundle-defer-third-party`, `bundle-dynamic-imports` (전체 prose 형태)

### 그룹 B — ❌ upstream 겹침 (겹침 정책에 따라 드롭)

이름 변형 또는 같은 anti-pattern을 upstream이 이미 잡음. 추가하면 점수 이중 차감.

| Vercel                               | upstream                                                        |
| ------------------------------------ | --------------------------------------------------------------- |
| `async-api-routes`                   | `server-sequential-independent-await` (이미 §3-룰5에 결정 기록) |
| `advanced-use-latest`                | `prefer-use-effect-event` (recommendation 텍스트 동일)          |
| `rerender-defer-reads`               | `rerender-defer-reads-hook`                                     |
| `advanced-effect-event-deps`         | `no-effect-event-in-deps`                                       |
| `bundle-analyzable-paths`            | `no-dynamic-import-path`                                        |
| `bundle-barrel-imports`              | `no-barrel-import`                                              |
| `client-event-listeners`             | `effect-needs-cleanup`                                          |
| `client-localstorage-schema`         | `client-localstorage-no-version`                                |
| `rerender-derived-state(-no-effect)` | `no-derived-state-effect` · `rerender-derived-state-from-hook`  |
| `rerender-simple-expression-in-memo` | `no-usememo-simple-expression`                                  |
| `rerender-move-effect-to-event`      | `no-effect-event-handler`                                       |
| `rerender-no-inline-components`      | `no-nested-component-definition`                                |
| `server-no-shared-module-state`      | `server-no-mutable-module-state`                                |
| `server-parallel-fetching`           | `server-sequential-independent-await`                           |
| `advanced-init-once` (부분)          | `rerender-lazy-state-init`                                      |
| `server-cache-react` (부분)          | `server-cache-with-object-literal`                              |

### 그룹 C — 🟡 MEDIUM (가능하지만 ROI 낮음)

cross-file 분석이나 휴리스틱이 필요해 false positive 위험 큼.

- ~~`rerender-split-combined-hooks`~~ ✅ **구현됨 (useMemo 케이스만, 2026-05-20)** — 인프라(capability/tag) 깔린 이후 보수적 한정 버전으로 도입. body 안 `const X = ...` 2개 이상이 dep array의 disjoint subset만 참조할 때만 발화. `useEffect` 케이스는 side-effect 순서·cleanup 위험으로 skip. §3-룰6 데시전 레코드 참고.
- ~~`server-serialization`~~ ✅ **구현됨 (단일 파일 한정, 2026-05-20)** — 호출부(서버) cross-file 분석 대신 callee(`'use client'` 파일)에서 "destructured prop 1~2개 필드만 읽음" 신호로 잡는 좁은 버전. §3-룰7 데시전 레코드 참고. spread/computed/whole-passing은 모두 skip.
- `bundle-conditional` — feature flag 패턴 + 큰 모듈 정적 import 검출. 휴리스틱 필요. 🟡 MEDIUM. **여전히 미도입** — "heavy 모듈"이라는 mechanical 신호가 없어서 false positive 폭발 우려.

### 결론

`rerender-split-combined-hooks` + `server-serialization` 도입으로 사이드카 룰 **6개 구현 + 1개 의도적 미구현(겹침) + 1개 도입 보류**. 추가 작업은:

1. **운영 관측을 통한 후속 결정** — 출시 후 컨슈머 프로젝트에서 false positive 데이터를 모은다. 두 신규 룰(useMemo splitting, RSC 직렬화)이 실 환경에서 적정한 비율의 진단을 내는지 확인.
2. **upstream 업데이트 모니터링** — upstream `oxlint-plugin-react-doctor`가 새 룰을 추가하거나 기존 룰의 범위가 변하면 우리 사이드카 룰들의 겹침 가능성을 재검증.

---

## 0-2. 70 룰 전수 audit (2026-05-20, 재조사)

`server-serialization` 도입 직전, 70개 Vercel 룰을 한 번 더 1개씩 spec 본문 직접 fetch해서 분류한 라운드. 결과 표를 결정 기록으로 보존.

### 분류 요약

| 카테고리                            | 개수   |
| ----------------------------------- | ------ |
| ✅ 사이드카 구현                    | 6      |
| ❌ 사이드카 의도적 미구현 (겹침)    | 1      |
| ✅ upstream 직접 커버 (이름 동일)   | 31     |
| ✅ upstream 의미 커버 (이름 다름)   | 17     |
| 🔴 prose-only (lint 신호 추출 불가) | 8      |
| 🟡 도입 보류 (mechanical 신호 부족) | 7      |
| **합계**                            | **70** |

**사이드카+upstream 점수 반영 합계 = 55개 (78%).** 나머지 15개는 mechanical lint 자체가 불가능하거나 단일 파일 분석 한계.

### 🔴 prose-only (8개)

`async-suspense-boundaries`, `bundle-defer-third-party`, `bundle-dynamic-imports`, `client-swr-dedup`, `js-request-idle-callback`, `rendering-activity`, `rendering-content-visibility`, `rendering-resource-hints` — 전부 "X API를 써라" missing-call 패턴. AST에서 추출할 신호 없음.

### 🟡 도입 보류 (7개, 룰별 사유)

| 룰                            | anti-pattern                                              | 보류 사유                                                                   | 인프라 추가 시?                          |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| `bundle-preload`              | hover/focus 시 `import('./heavy')` preload 안 함          | 모든 onMouseEnter/onFocus에 dynamic import 강제 시 FP 폭발. heavy 신호 부재 | ❌ 모듈 크기 메타 필요 (bundle analyzer) |
| `bundle-conditional`          | feature flag 분기에서 큰 모듈 static import               | "heavy"의 mechanical 정의 부재. 동일 사유                                   | ❌ 동일                                  |
| `async-dependencies`          | `Promise.all` 후 종속 await 체인이 직렬화                 | dependency graph + 의미적 "독립" 판단. ROI 낮음                             | 🟡 매우 한정 형태만, 효용 낮음           |
| `js-cache-function-results`   | render 안 동일 인자 pure 함수 반복 호출                   | pure 함수 판별 불가. cross-render cache는 side effect 위험                  | ❌ purity 어노테이션 필요                |
| `rerender-memo`               | useMemo 결과를 early return 전에 계산                     | "expensive" 판별 휴리스틱 → 무차별 적용 시 FP 폭발                          | ❌ 비용 모델 없으면 불가                 |
| `rerender-use-deferred-value` | 큰 list filter가 input 즉시 재실행                        | "큰 list" 판별 + 의도 vs 누락 구분 불가                                     | ❌ prose성                               |
| `server-cache-lru`            | sequential 요청 간 공유돼야 할 fetch가 매 요청마다 DB hit | cross-request scope, ESLint 단일 파일 분석 범위 밖                          | ❌ 단일 파일 lint 외                     |

### ✅ upstream 의미 커버 (이름 다름) — 17개 매핑

| Vercel                               | upstream                              |
| ------------------------------------ | ------------------------------------- |
| `advanced-use-latest`                | `prefer-use-effect-event`             |
| `advanced-effect-event-deps`         | `no-effect-event-in-deps`             |
| `advanced-init-once` (부분)          | `rerender-lazy-state-init`            |
| `bundle-analyzable-paths`            | `no-dynamic-import-path`              |
| `bundle-barrel-imports`              | `no-barrel-import`                    |
| `client-event-listeners`             | `effect-needs-cleanup`                |
| `client-localstorage-schema`         | `client-localstorage-no-version`      |
| `rerender-defer-reads`               | `rerender-defer-reads-hook`           |
| `rerender-derived-state`             | `rerender-derived-state-from-hook`    |
| `rerender-derived-state-no-effect`   | `no-derived-state-effect`             |
| `rerender-simple-expression-in-memo` | `no-usememo-simple-expression`        |
| `rerender-move-effect-to-event`      | `no-effect-event-handler`             |
| `rerender-no-inline-components`      | `no-nested-component-definition`      |
| `rerender-transitions`               | `rerender-transitions-scroll`         |
| `server-no-shared-module-state`      | `server-no-mutable-module-state`      |
| `server-parallel-fetching`           | `server-sequential-independent-await` |
| `server-cache-react` (부분)          | `server-cache-with-object-literal`    |

### 액션 결론

1. **즉시 도입 가능 mechanical 룰: 0개.** 사이드카 6개 구현으로 mechanical 후보는 사실상 모두 처리됨.
2. **인프라 한 단계 추가로 가능한 룰: 0개.** `server-serialization`의 cross-file 진짜 형태는 여전히 module graph 필요(이번 단일 파일 버전은 callee 신호만). `bundle-*`는 bundle analyzer 통합 필요. ROI 검토 후 결정.
3. **운영 데이터 수집 우선** — 새 룰 발굴 작업 일시 중단. 사이드카 6개의 실 환경 false positive 비율 측정 후:
   - `useEffect` 케이스로 `rerender-split-combined-hooks` 확장
   - `server-serialization` threshold(현재 1~2 필드) 조정 검토
   - `bundle-conditional`/`bundle-preload` — bundle analyzer 통합 시 재도전

---

## 0-3. 사내 룰 (claude-presets) audit (2026-05-20)

Vercel react-best-practices 외에 itall 자체 컨벤션이 [`IT-ALL-Service/packages`의 claude-presets/rules](https://github.com/IT-ALL-Service/packages/tree/main/packages/claude-presets/rules)에 정리돼 있다(`typescript.md`, `react.md`, `nextjs.md`). 약 50개 항목 중 lintable한 것만 분류한 라운드.

### 분류 요약

| 카테고리                             | 개수 | 메모                                                                                                                   |
| ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| ❌ TS-ESLint / upstream 커버 (제외)  | 13   | `any`, `!`, `@ts-ignore`, 반환 타입, `<img>`, fetch 옵션, ...                                                          |
| ✅ 사이드카 도입 Batch 1 (사고 예방) | 3    | `no-process-env-direct-access`, `error-tsx-use-client`, `tanstack-query-key-array`                                     |
| ✅ 사이드카 도입 Batch 2 (스타일)    | 4    | `route-segment-explicit-name`, `no-document-title-mutation`, `component-function-declaration`, `no-type-prefix-suffix` |
| 🟡 MEDIUM (가능하지만 FP 위험)       | 3    | 핸들러 네이밍 `handleXxx`/`onXxx`, `as` 단언 화이트리스트, 3단계+ 상위 경로                                            |
| 🔴 prose-only                        | ~15+ | "Server Component 기본", "State Colocation", "Composition 우선", ...                                                   |

### ❌ TS-ESLint / upstream에 이미 잡힘 (사이드카에 안 넣음)

| 사내 룰                                        | 커버 위치                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `any` 금지                                     | `@typescript-eslint/no-explicit-any`                              |
| Non-null `!` 금지                              | `@typescript-eslint/no-non-null-assertion`                        |
| `@ts-ignore` 금지                              | `@typescript-eslint/ban-ts-comment`                               |
| 함수 반환 타입 명시 (export 경계)              | TS-ESLint `explicit-function-return-type`                         |
| naming convention (camelCase/PascalCase/kebab) | `@typescript-eslint/naming-convention`                            |
| 중첩 배럴 import                               | upstream `no-barrel-import`                                       |
| `next/head` 금지                               | upstream `nextjs-no-head-import`                                  |
| `<img>` 금지                                   | upstream `nextjs-no-img-element`                                  |
| `<Image>` sizes 누락                           | upstream `nextjs-image-missing-sizes`                             |
| 병렬 페칭(Promise.all 강제)                    | upstream `async-parallel` + `server-sequential-independent-await` |
| **fetch 캐싱 옵션 명시** (§3-1)                | upstream **`server-fetch-without-revalidate`**                    |
| **`useState + useEffect + fetch` 금지** (§3-4) | upstream **`no-fetch-in-effect`**                                 |
| Metadata API 사용 (`next/head` 금지 부분)      | upstream `nextjs-missing-metadata`                                |

### ✅ 사이드카 도입 (7개)

**Batch 1 — 사고 예방·운영 자산 가치 우선 (2026-05-20):**

| 룰                             | 신호                                                       | 사유                                                                            |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `no-process-env-direct-access` | `process.env.X` MemberExpression                           | 시크릿 누출 사고 예방 (NEXT*PUBLIC* 오용). env 모듈 외 모든 파일에서 강제       |
| `error-tsx-use-client`         | `error.tsx` 파일 + `"use client"` directive 누락           | 런타임 crash 예방. 파일명 매칭으로 visitor 비용 거의 없음                       |
| `tanstack-query-key-array`     | `useQuery/useMutation/queryClient.*` 첫 인자에서 비배열 키 | 흔한 캐시 매칭 실패 버그 예방. spread/identifier/call value는 conservative skip |

**Batch 2 — 라우팅 컨벤션·스타일 강제 (2026-05-20):**

| 룰                               | 신호                                                                                                                                                   | 사유                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `route-segment-explicit-name`    | `page.tsx`/`layout.tsx`/`loading.tsx`/`not-found.tsx`/`template.tsx`/`default.tsx`의 default export 함수 이름이 `Page`/`Layout`/`Loading` 같은 generic | stack trace·DevTools·Profiler에서 어느 세그먼트인지 식별 가능하도록      |
| `no-document-title-mutation`     | `document.title = ...` AssignmentExpression                                                                                                            | 크롤러/OG bot은 JS 실행 전 HTML만 읽음 → Metadata API 사용 강제          |
| `component-function-declaration` | `const Foo = () => <jsx/>` (PascalCase const + ArrowFunction + JSX 반환)                                                                               | React 가이드: stack trace 라벨 · 호이스팅 가독성 · TSX 제네릭 자연스러움 |
| `no-type-prefix-suffix`          | `interface IUser` / `type FooType` (`Model`/`Entity`/`Dto`는 허용)                                                                                     | TS 컴파일러가 이미 타입임을 앎. 도메인 의미 있는 접미사만 허용           |

### 🔴 prose-only (lint 불가)

대부분 사내 룰 가이드는 의도·맥락 기반: "State Colocation", "useEffect 4단계 검토", "Server Component 기본", "Composition vs Context 선택", "메모이제이션은 Profiler 측정 후" 등. 코드 패턴으로 환원 불가능해 lint 신호 추출이 안 됨. 이런 항목은 PR 리뷰 / 코드 리뷰 / 페어 프로그래밍에서 다룬다.

---

## 0. 배경 (Context)

### 출발점

- `IT-ALL-Service/itall-react-doctor`는 `millionco/react-doctor` fork
- PoC로 GitHub Packages에 `@it-all-service/react-doctor` publish 완료
- school-project에서 install/실행 검증 완료
- 사내 룰 출처: [vercel-labs/agent-skills/skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (70개 prose 룰)

### Vercel ↔ react-doctor 매핑 결과

- 70개 중 **45개**는 이미 react-doctor가 mechanical 커버 (이름 같거나 유사)
- 22개 GAP 중 lintability 평가:
  - 🟢 HIGH (5): 패턴 명확, 1차 구현 대상
  - 🟡 MEDIUM (7): 가능하지만 false positive 위험
  - 🔴 LOW (8): prose 가이드로만 유지

### 결정된 전략

`oxlint-plugin-react-doctor`(178 룰)는 fork하지 않음. 대신 모노레포 안에 **새 ESLint plugin 패키지**(`@it-all-service/eslint-plugin-itall-react`)를 추가하고, 우리 fork CLI에 통합.

---

## 1. 통합 메커니즘 (조사 완료)

### 핵심 사실

- **react-doctor의 메인 엔진은 oxlint** (Rust 기반). ESLint 아님.
- oxlint는 `jsPlugins` 옵션으로 **ESLint 호환 JS plugin**을 실행 가능
- 기존 통합된 ESLint plugin 2개:
  - `eslint-plugin-react-hooks` → namespace `react-hooks-js`
  - `eslint-plugin-react-you-might-not-need-an-effect` → namespace `effect`
- **임의 ESLint plugin 자동 발견 안 됨** — CLI 코드에 하드코딩된 resolver만 존재

### 통합 경로

`packages/core/src/runners/oxlint/plugin-resolution.ts`에 새 resolver 추가:

```ts
export const ITALL_NAMESPACE = "itall";

export const resolveItallReactPlugin = (
  customRulesOnly: boolean,
): ResolvedItallReactPlugin | null => {
  if (customRulesOnly) return null;
  let pluginSpecifier: string;
  try {
    pluginSpecifier = esmRequire.resolve("@it-all-service/eslint-plugin-itall-react");
  } catch {
    return null; // optional peer dep — silently skip if absent
  }
  return {
    entry: { name: ITALL_NAMESPACE, specifier: pluginSpecifier },
    availableRuleNames: readPluginRuleNames(pluginSpecifier),
  };
};
```

`packages/core/src/runners/oxlint/config.ts`에서 wire:

```ts
const itallPlugin = resolveItallReactPlugin(customRulesOnly);
const itallRules = itallPlugin
  ? filterRulesToAvailable(ITALL_RULES, ITALL_NAMESPACE, itallPlugin.availableRuleNames)
  : {};

// ...
if (itallPlugin) jsPlugins.push(itallPlugin.entry);

return {
  // ...
  jsPlugins: [...jsPlugins, pluginPath],
  rules: {
    // ...
    ...itallRules,
    ...enabledReactDoctorRules,
  },
};
```

### 점수 통합

- 새 룰의 진단은 다른 oxlint 진단과 같은 파이프라인을 타고 점수 계산에 들어감
- **별도 점수 계산 코드 수정 불필요** (이 점이 이 접근의 핵심 이점)

---

## 2. 패키지 구조

### 새 패키지: `packages/eslint-plugin-itall-react/`

```
packages/eslint-plugin-itall-react/
├── package.json
├── tsconfig.json
├── vite.config.ts          # vp pack — 다른 패키지와 동일 빌드
├── src/
│   ├── index.ts            # 플러그인 entry, rules export, ITALL_RULES 상수
│   └── rules/
│       ├── rerender-use-ref-transient-values.ts
│       ├── async-cheap-condition-before-await.ts
│       ├── rendering-hydration-suppress-warning.ts
│       ├── server-parallel-nested-fetching.ts
│       └── async-api-routes.ts
└── tests/
    └── rules/
        └── *.test.ts
```

### `package.json` 초안

```json
{
  "name": "@it-all-service/eslint-plugin-itall-react",
  "version": "0.1.0",
  "description": "Team-specific React/Next.js lint rules consumed by @it-all-service/react-doctor",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/**"],
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "scripts": {
    "build": "vp pack",
    "test": "vp test run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "eslint": "^8 || ^9"
  }
}
```

---

## 3. 5개 PoC 룰 상세 명세

### 룰 1: `rerender-use-ref-transient-values` ✅ 구현 완료 (v0.3.0 / identifier resolution v0.4.0)

**Vercel 원문**: [rerender-use-ref-transient-values.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-use-ref-transient-values.md)

**감지 패턴**: 고빈도 이벤트 핸들러 (`mousemove`, `scroll`, `touchmove`, `wheel`, `pointermove`) 안에서 `setState` 호출

**AST 알고리즘**:

1. Listener 후보 수집:
   - `addEventListener("<event>", handler)` — event 이름이 고빈도 목록에 매치
   - JSX attribute `onMouseMove`, `onScroll`, `onTouchMove`, `onWheel`, `onPointerMove` — handler 표현식
2. Handler 본체에서 `setX(...)` 형태 호출 식별
   - `setX`가 `useState`의 두 번째 destructuring 결과인지 scope traversal로 확인
3. 매치되면 진단:
   - 메시지: `"Avoid setState in high-frequency event handlers. Use useRef + direct DOM mutation."`
   - 심각도: `warn`

**테스트 픽스처**:

- ❌ Incorrect: `addEventListener('mousemove', e => setLastX(e.clientX))`
- ❌ Incorrect: `<div onScroll={e => setScrollY(e.currentTarget.scrollTop)} />`
- ✅ Correct: `addEventListener('mousemove', e => { ref.current = e.clientX })`
- ✅ Correct: `<button onClick={e => setCount(c => c + 1)} />` (onClick은 고빈도 아님)

**위험**: scope traversal 정확도. 첫 PoC는 보수적으로 — 같은 함수 body 내 destructuring만 추적.

---

### 룰 2: `async-cheap-condition-before-await` ✅ 구현 완료 (v0.5.0)

**Vercel 원문**: [async-cheap-condition-before-await.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-cheap-condition-before-await.md)

**감지 패턴**: `if (await asyncCall() && syncCheck)` — sync check가 awaited 값에 의존 안 함

**AST 알고리즘**:

1. `IfStatement.test` 또는 `ConditionalExpression.test`가 `LogicalExpression(&&)`
2. LHS가 `AwaitExpression`
3. RHS가 LHS의 awaited 값을 참조 안 함 (변수 미사용 또는 별개 식별자)
4. RHS가 "cheap"인지 휴리스틱: literal, identifier reference, simple member access만 허용. function call은 보수적으로 제외.

**진단**: `"Check '<rhs-expr>' first before awaiting '<lhs-expr>'."`

**위험**: "cheap" 정의 모호. 첫 버전은 RHS가 `MemberExpression`/`Identifier`/`Literal`인 경우만 매치.

---

### 룰 3: `rendering-hydration-suppress-warning` ✅ 구현 완료 (v0.4.0)

**Vercel 원문**: [rendering-hydration-suppress-warning.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rendering-hydration-suppress-warning.md)

**감지 패턴**: JSX text/expression 안에 non-deterministic 값 + 부모 element에 `suppressHydrationWarning` 없음

**Non-deterministic 후보**:

- `new Date()`, `Date.now()`
- `Math.random()`
- `new Intl.*` (DateTimeFormat, NumberFormat, etc.)
- `Intl.DateTimeFormat().resolvedOptions()`

**AST 알고리즘**:

1. JSXElement traverse, expression child에 위 후보 CallExpression/NewExpression 발견
2. 가장 가까운 JSXElement 조상에 `suppressHydrationWarning` 어트리뷰트 없음
3. 진단: `"Wrap non-deterministic value '<expr>' in an element with suppressHydrationWarning."`

**위험**: 의도적 비결정성도 잡힘 → `warn` 심각도로 시작.

---

### 룰 4: `server-parallel-nested-fetching` ✅ 구현 완료 (v0.5.0)

**Vercel 원문**: [server-parallel-nested-fetching.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-parallel-nested-fetching.md)

**감지 패턴**:

```ts
const xs = await Promise.all(items.map(getX));
const ys = await Promise.all(xs.map(getY)); // ← 이 단계 anti-pattern
```

**AST 알고리즘**:

1. `await Promise.all(<arr>.map(<fn>))` 형태 두 개 sequential 검출
2. 첫 번째의 결과 변수가 두 번째의 `.map()` 수신자로 사용됐는지 변수 추적
3. 매치되면 진단:
   - 메시지: `"Chain nested fetch inside the .map(): replace with Promise.all(items.map(id => getX(id).then(getY))) ."`

**위험**: 변수 추적 (간단한 동일 scope만 추적). 더 복잡한 케이스는 false negative 허용.

---

### 룰 5: `async-api-routes` ❌ 의도적 미구현 (Decision Record)

**Vercel 원문**: [async-api-routes.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-api-routes.md)

**원안 감지 패턴**: Next.js API route (`route.ts`)의 HTTP method export 안에서 연속 `await`인데 서로 의존성 없는 경우.

**결정**: 사이드카에서 **구현하지 않는다**. upstream과 직접 겹치기 때문이다.

- `react-doctor/server-sequential-independent-await` ([파일](../packages/oxlint-plugin-react-doctor/src/plugin/rules/server/server-sequential-independent-await.ts))
  - `FunctionDeclaration`/`FunctionExpression`/`ArrowFunctionExpression` 중 `node.async === true`인 모든 함수 body에서 발화
  - 같은 statement-pair walk + 같은 dependency 분석 (`declarationReadsAnyName`로 후속 await가 직전 binding을 읽으면 skip)
  - route.ts의 `GET()` 같은 export async 함수도 그대로 잡힘
- `react-doctor/async-parallel` ([파일](../packages/oxlint-plugin-react-doctor/src/plugin/rules/js-performance/async-parallel.ts))
  - `BlockStatement`에서 `SEQUENTIAL_AWAIT_THRESHOLD = 3` 이상 독립 연속 await
  - 3개 이상 케이스에서 추가 발화

이 둘이 이미 route.ts handler의 독립 sequential await를 잡으므로, 사이드카로 또 잡으면 같은 라인에 진단이 2~3건 중복 등록되어 점수가 이중·삼중으로 깎인다. "겹침 정책"(문서 상단)에 따라 구현하지 않는다.

**미구현 대안**:

- 사용자에게 더 sharp한 메시지가 필요하면 사이드카 룰을 추가하는 대신, upstream `server-sequential-independent-await`의 메시지를 fork 측에서 패치하거나, `apply-severity-controls`에서 route.ts 파일만 심각도 승격 같은 형태로 처리.
- school-project E2E 결과에서 false positive가 많으면 upstream을 끄고 사이드카로 재구현하는 옵션을 다시 검토. 그땐 이 결정 기록을 업데이트.

---

### 룰 7: `server-serialization` ✅ 단일 파일 한정 구현 (2026-05-20, Decision Record)

**Vercel 원문**: [server-serialization.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/server-serialization.md)

**Vercel의 진짜 anti-pattern**: Server Component가 `<Profile user={user} />`처럼 50개 필드 가진 객체를 통째로 Client Component에 prop으로 넘기면, RSC → Client 직렬화 단계에서 안 쓰는 필드까지 모두 HTML 페이로드에 박혀버린다. 호출부에서 `<Profile name={user.name} />`처럼 flat 필드를 전달해야 한다.

**우리가 구현한 좁은 버전**: 호출부(서버) cross-file 분석 대신 **callee(`'use client'` 파일)에서** "destructured prop 1~2개 필드만 읽음" 신호로 잡는다. 즉 진짜 결정은 부모 쪽에 있지만, 자식 쪽에서 강한 신호가 보일 때 진단을 띄운다.

**AST 알고리즘**:

1. Program 진입 시 `"use client"` directive 탐지 — 없으면 visitor 비움 (서버 파일은 RSC 경계에서 receive 안 함)
2. `FunctionDeclaration`/`FunctionExpression`/`ArrowFunctionExpression` 중 Pascal-cased 이름의 컴포넌트만 inspection
3. 첫 param이 `ObjectPattern`이어야 함 (destructured prop)
4. ObjectPattern의 각 property identifier에 대해:
   - body 전체 walk, 그 identifier 참조 수집
   - 모든 참조가 `<id>.<staticField>` 형태인지 확인 (computed access, spread, 다른 함수 인자 등 발견 시 즉시 skip)
   - distinct field 개수가 1 또는 2면 flag

**왜 cross-file 안 했나**: 본격적인 module graph + RSC 경계 추적이 필요한 작업(견적 4~8h 이상)이고, oxlint JS plugin은 단일 파일 컨텍스트에서 동작. cross-file 인덱서를 fork CLI에 추가하려면 캐시·invalidation·tsconfig 통합 등 별도 인프라 항목이 됨. callee 신호만으로도 anti-pattern을 강하게 잡을 수 있다고 판단.

**False positive 경계**:

- 3개 이상 필드를 쓰는 컴포넌트는 합리적인 prop bag으로 간주 (skip)
- spread, computed access, 함수에 그대로 전달 등 "통째 사용" 시그널이 하나라도 있으면 skip
- non-Pascal 함수 이름은 컴포넌트로 안 봄

**향후 재검토 조건**: 사내 RSC 도입이 확대되어 cross-file 분석의 ROI가 정당화되면 module graph 기반 v2 검토. 그때까지는 이 단일 파일 버전이 충분.

---

## 4. 파일 단위 변경 리스트

### 신규 파일

1. `packages/eslint-plugin-itall-react/package.json`
2. `packages/eslint-plugin-itall-react/tsconfig.json`
3. `packages/eslint-plugin-itall-react/vite.config.ts`
4. `packages/eslint-plugin-itall-react/src/index.ts`
5. `packages/eslint-plugin-itall-react/src/rules/rerender-use-ref-transient-values.ts`
6. `packages/eslint-plugin-itall-react/src/rules/async-cheap-condition-before-await.ts`
7. `packages/eslint-plugin-itall-react/src/rules/rendering-hydration-suppress-warning.ts`
8. `packages/eslint-plugin-itall-react/src/rules/server-parallel-nested-fetching.ts`
9. ~~`packages/eslint-plugin-itall-react/src/rules/async-api-routes.ts`~~ — 미구현 (룰 5 데시전 레코드 참고)
10. `packages/eslint-plugin-itall-react/tests/rules/*.test.ts` (각 룰별)

### 수정 파일

1. **`packages/core/src/runners/oxlint/plugin-resolution.ts`**
   - `ITALL_NAMESPACE` 상수 추가
   - `ResolvedItallReactPlugin` 인터페이스 추가
   - `resolveItallReactPlugin` 함수 추가

2. **`packages/core/src/runners/oxlint/config.ts`**
   - import `resolveItallReactPlugin`, `ITALL_NAMESPACE`, `ITALL_RULES`
   - resolver 호출 + `filterRulesToAvailable`
   - `jsPlugins.push(...)` 분기 추가
   - `rules` 맵에 `...itallRules` 머지

3. **`packages/core/src/constants.ts`** (또는 새 위치)
   - `ITALL_RULES: Record<string, OxlintRuleSeverity>` 정의 — 활성화할 룰 키와 기본 심각도

4. **`packages/react-doctor/package.json`**
   - `peerDependencies`에 `@it-all-service/eslint-plugin-itall-react: ^0.1.0` 추가
   - `peerDependenciesMeta.@it-all-service/eslint-plugin-itall-react.optional: true`

5. **`packages/core/package.json`**
   - 새 패키지 의존이 필요한지 확인 (`require.resolve` 기반이라 dependency는 사실 불필요할 수도 — 기존 패턴 참고)

6. **`.github/workflows/publish.yml`**
   - 새 step: plugin 패키지 먼저 publish → CLI 패키지 publish (의존 순서)
   - 또는 `pnpm -r publish --filter=@it-all-service/*` 일괄

7. **`pnpm-workspace.yaml`** — 변경 없음 (`packages/*` wildcard)

8. **`turbo.json`** — 새 패키지가 자동으로 잡히는지 확인. 잡히면 변경 없음.

9. **`.changeset/config.json`**
   - `fixed` 그룹에 새 패키지 추가 (CLI와 함께 버전 락스텝)

---

## 5. Publish 순서 및 의존성

```
1. @it-all-service/eslint-plugin-itall-react@0.1.0 → publish
2. @it-all-service/react-doctor@0.3.0-itall.1 → publish (peer dep 참조)
3. Consumer: pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
```

**주의**: CLI의 peerDep을 optional로 두므로, 컨슈머가 plugin을 install하지 않으면 우리 룰만 비활성화되고 기존 react-doctor 룰은 그대로 동작. fallback 안전.

---

## 6. Open Questions / Risks

### Q1. oxlint JS plugin이 임의 ESLint plugin 형태를 실행 가능한가?

**조사 필요**: 기존 통합된 두 plugin은 둘 다 잘 알려진 공개 ESLint plugin. 우리 plugin이 같은 표준 형태(`{ meta, rules: { [name]: { meta, create } } }`)면 동작할 것으로 추정. **첫 PoC에서 검증해야 함.**

### Q2. 점수 가중치

react-doctor의 점수 계산 코드 (`packages/core/src/calculate-score.ts` 또는 유사) 분석 필요. 우리 룰이:

- 기존 카테고리에 매핑되어 점수 영향이 자연스러운가
- 별도 카테고리 신설이 필요한가

**Action**: 다음 세션 시작 시 `calculate-score.ts` 5분 검토.

### Q3. Rule severity 기본값

PoC는 모두 `warn`으로 시작. 점진적으로 `error`로 승격은 사내 운영 데이터 보고 결정.

### Q4. ESLint plugin 빌드 호환성

`vp pack`(vite-plus)이 ESLint plugin 빌드에 적합한가? 일반 ESLint plugin은 CommonJS export 흔함. 우리는 ESM(`"type": "module"`) 일관성 유지.

**Action**: 첫 빌드 시 `dist/index.js` 형태 확인. 호환 안 되면 esbuild로 폴백.

### Q5. CI 인증

기존 publish workflow는 CLI 한 개만 publish. 새 패키지도 같은 `NPM_TOKEN`으로 publish 가능 — token 권한이 org-level packages:write라 문제 없음.

---

## 7. 구현 순서

### ✅ Phase 1 — 스캐폴딩 + 통합 검증 — 완료 (PR #2, v0.3.0)

1. `packages/eslint-plugin-itall-react/` 디렉토리 + `package.json` + `tsconfig.json` + `vite.config.ts` 생성
2. `src/index.ts`에 최소 export
3. `pnpm install` → 9 workspace 인식
4. `pnpm build` → dist 생성
5. `packages/core/src/runners/oxlint/plugin-resolution.ts`에 `resolveItallReactPlugin` 추가
6. `packages/core/src/runners/oxlint/config.ts`에 wire
7. `packages/react-doctor/package.json`에 optional peer dep 추가
8. local build로 fallback 안전 확인

### ✅ Phase 2 — 첫 룰 구현 — 완료 (PR #2, v0.3.0)

9. `rerender-use-ref-transient-values` 룰 작성
10. plugin shape smoke test 작성
11. ITALL_REACT_RULES에 키 등록

### ✅ Phase 3 — Publish + end-to-end — 완료

12. PR #2 / #3 / #4 머지
13. v0.3.0 release (수동 dispatch로 first publish)
14. school-project에서 install·실행 검증 — 인라인 핸들러 케이스 정상 검출

### ✅ Phase 4a — 룰 정확도 개선 + 두 번째 룰 — 완료 (PR #5, v0.4.0)

15. rerender 룰 — identifier-referenced handler resolution 추가
16. `rendering-hydration-suppress-warning` 룰 신설
17. 패키지 0.4.0 bump · v0.4.0 tag-trigger publish 성공

### ✅ Phase 4b — 남은 룰 — 완료 (v0.5.0)

세 룰을 한 브랜치에 누적해 단일 PR(#9)로 묶었다. 머지 후 겹침 검토 라운드에서 룰 5는 미구현으로 되돌렸다(별도 cleanup PR).

18. **`async-cheap-condition-before-await`** ✅ — `LogicalExpression(&&)` 직접 매칭. RHS의 "cheap" 정의는 Literal/Identifier/MemberExpression/`!`·`typeof`·`void` 단항, TemplateLiteral은 nested expression도 cheap일 때만.
19. **`server-parallel-nested-fetching`** ✅ — 함수 body / Program top-level statement pair walk. `const x = await Promise.all(a.map(f)); const y = await Promise.all(x.map(g))` 매치.
20. ~~`async-api-routes`~~ ❌ — 미구현. upstream `server-sequential-independent-await`가 동일 패턴을 더 넓은 범위에서 잡으므로 점수 이중 차감 위험. §3-룰5 데시전 레코드 참고.

### ⏳ Phase 5 — 운영 (필요 시점에)

21. school-project를 dev dep로 정식 도입 (별도 PR — Dockerfile에 GitHub Packages 인증 필요)
22. 사내 다른 프로젝트(itall-web, admin.itall.com 등) 차례로 도입
23. 룰 false positive 모니터링 후 일부 `error`로 승격 검토

---

## 8. Acceptance Criteria

### PoC 완료 기준 — 모두 충족 ✅

- [x] `@it-all-service/eslint-plugin-itall-react` GitHub Packages에 publish (현재 v0.4.0)
- [x] `@it-all-service/react-doctor` 업데이트, 신규 plugin을 optional peer로 인식
- [x] school-project에서 의도적 violation 파일에서 `itall/rerender-use-ref-transient-values` 진단 출력
- [x] 진단이 별도 리포트가 아니라 **표준 react-doctor 점수/리포트에 통합**되어 출력
- [x] plugin 없이 react-doctor만 install해도 기존 룰은 정상 동작 (fallback)

### 5개 PoC 룰 처리 기준 — 5/5 결정 완료 (4 구현 · 1 미구현)

- [x] `rerender-use-ref-transient-values` (인라인 + identifier-referenced handler 모두 검출)
- [x] `async-cheap-condition-before-await`
- [x] `rendering-hydration-suppress-warning`
- [x] `server-parallel-nested-fetching`
- [x] `async-api-routes` — 미구현 결정 기록(§3-룰5). upstream 겹침으로 점수 이중 차감 회피.

---

## 9. 다음 세션 cold-start 가이드

이 문서만으로 cold-start 가능. 시작 시:

1. 이 문서를 처음부터 읽기
2. Section 1(통합 메커니즘) 확인 — 기존 두 plugin이 어떻게 wire 됐는지가 핵심
3. Section 2(패키지 구조) 따라 스캐폴딩
4. Section 3(룰 1)부터 구현
5. Section 7(구현 순서) Phase 1부터 순차 진행

**전제로 필요한 사전 작업** (이미 끝남):

- `IT-ALL-Service/itall-react-doctor` fork 존재 ✅
- `@it-all-service/react-doctor` GitHub Packages publish 흐름 ✅
- school-project 컨슈머 시나리오 검증 ✅
