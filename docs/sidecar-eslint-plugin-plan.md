# 사이드카 ESLint Plugin 통합 계획

> 상태: **2/5 룰 구현 완료** — `@it-all-service/react-doctor@0.4.0` / `@it-all-service/eslint-plugin-itall-react@0.4.0` publish됨
> 최초 작성일: 2026-05-19 · 마지막 업데이트: 2026-05-20
> 목적: Vercel react-best-practices에서 react-doctor가 mechanical하게 커버 못 하는 룰 중 lintability 높은 5개를 사내 ESLint plugin으로 추가하고, **단일 react-doctor 점수**에 합산되도록 통합

---

## 현재 진척 (한눈에)

| #   | 룰                                           | 상태                                                      | 비고                                                |
| --- | -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| 1   | `itall/rerender-use-ref-transient-values`    | ✅ **구현 완료** (v0.3.0, identifier resolution은 v0.4.0) | 인라인 핸들러 + 같은 파일의 함수 정의 추적          |
| 2   | `itall/async-cheap-condition-before-await`   | ⏳ 남음                                                   | LogicalExpression(`&&`) 분석                        |
| 3   | `itall/rendering-hydration-suppress-warning` | ✅ **구현 완료** (v0.4.0)                                 | new Date/Math.random/Intl 등 + JSXElement 조상 스택 |
| 4   | `itall/server-parallel-nested-fetching`      | ⏳ 남음                                                   | `Promise.all(...map())` 두 단 sequential 변수 추적  |
| 5   | `itall/async-api-routes`                     | ⏳ 남음                                                   | route.ts HTTP method export 안의 독립 await 검출    |

**남은 우선순위:**

1. **#3 `async-cheap-condition-before-await`** — 가장 단순. `LogicalExpression(&&)` 패턴 직접 매칭, scope 분석 거의 없음.
2. **#4 `server-parallel-nested-fetching`** — 중간. 변수 1개만 추적하면 됨.
3. **#5 `async-api-routes`** — 가장 복잡. 파일 경로 인식 + 의존성 분석 필요.

각 룰의 spec/AST 알고리즘은 §3에 그대로 보존(구현 완료된 룰은 §3에 ✅ 표시).

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

### 룰 2: `async-cheap-condition-before-await` ⏳ 남음

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

### 룰 4: `server-parallel-nested-fetching` ⏳ 남음

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

### 룰 5: `async-api-routes` ⏳ 남음

**Vercel 원문**: [async-api-routes.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-api-routes.md)

**감지 패턴**: Next.js API route (`route.ts`)의 HTTP method export 안에서 연속 `await`인데 서로 의존성 없는 경우

**AST 알고리즘**:

1. 파일명이 `route.ts` 또는 `route.tsx`인지 확인 (또는 ESLint `settings`로 패턴 받기)
2. Export된 함수 중 이름이 `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` 인 것
3. 함수 body 내 연속 `await CallExpression` (VariableDeclaration 형태)
4. 의존성 분석: 후속 await의 인자에서 이전 await의 결과 변수 참조하는지
5. 의존성 없는 연속 await가 2개 이상이면 진단

**진단**: `"Start parallel: '<var1>' and '<var2>' are independent. Use Promise.all or start promises early."`

**위험**: 파일 패턴 인식이 ESLint context로 가능한가? `context.getFilename()`으로 가능.

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
9. `packages/eslint-plugin-itall-react/src/rules/async-api-routes.ts`
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

### ⏳ Phase 4b — 남은 3개 룰 (3-6h, 분리 권장)

각 룰별로 별도 PR을 추천. 작성 순서는 lintability·구현 난이도 기준:

18. **`async-cheap-condition-before-await`** — 가장 단순 (1-2h). §3-룰2 spec 참고. `LogicalExpression(&&)` 패턴 직접 매칭.
19. **`server-parallel-nested-fetching`** — 중간 (1-2h). §3-룰4 spec 참고. 변수 1개 추적.
20. **`async-api-routes`** — 가장 복잡 (2-3h). §3-룰5 spec 참고. `context.getFilename()`으로 route.ts 인식 + 의존성 분석.

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

### 풀 5개 룰 구현 기준 — 2/5

- [x] `rerender-use-ref-transient-values` (인라인 + identifier-referenced handler 모두 검출)
- [ ] `async-cheap-condition-before-await`
- [x] `rendering-hydration-suppress-warning`
- [ ] `server-parallel-nested-fetching`
- [ ] `async-api-routes`

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
