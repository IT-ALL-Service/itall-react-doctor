# 세션 히스토리 — fork 셋업 & 사이드카 plugin PoC

> 기간: 2026-05-19 ~ 2026-05-20
> 결과: `@it-all-service/react-doctor@0.4.1` / `@it-all-service/eslint-plugin-itall-react@0.4.1` 정식 publish, 사내 룰 2개 mechanical 동작 + school-project e2e 검증 완료
> 문서 목적: 결정의 **why**, 사고/복구 과정, 코드/git에서 재구성 불가능한 컨텍스트를 보존

---

## 1. 출발점 & 최종 결과

### 출발점

- 사내(`IT-ALL-Service`)에 [`millionco/react-doctor`](https://github.com/millionco/react-doctor) fork (`IT-ALL-Service/itall-react-doctor`) 신설
- 목표: 우리 팀(IT-ALL) 컨텍스트에 맞춘 React/Next.js lint 도구를 GitHub Packages로 사내 배포
- 출처 룰: [Vercel `react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) 70개 prose 룰

### 최종 결과

- 두 패키지 정식 publish, 컨슈머 install·실행 검증 완료
- 178개 upstream oxlint 룰 + 사내 사이드카 2개 룰을 **단일 점수 파이프라인**으로 통합
- 릴리스 자동화 (tag push 트리거)
- 설계 문서 + 세션 로그 docs/ 보존

---

## 2. 주요 결정 (with rationale)

### 결정 1. 패키지 스코프 — `@it-all-service`

- 원안 후보: `@itall`, `@it-all`, `@it-all-service`
- 선택: **`@it-all-service`** (GitHub org 이름과 일치 필수). `@itall`은 GitHub Packages가 거부했을 것.
- 루트 패키지명은 `itall-react-doctor` (publish 안 함, fork 식별용)

### 결정 2. `oxlint-plugin-react-doctor`는 fork 안 함

- 178개 룰 검사 코드는 upstream을 그대로 따라감
- 이유: upstream 룰은 잘 운영되고, fork하면 upstream 변경 따라가기 부담 큼
- 대신 **사내 룰은 별도 ESLint plugin 사이드카**로 추가 (`@it-all-service/eslint-plugin-itall-react`)

### 결정 3. 통합 메커니즘 — oxlint JS plugin path

- react-doctor의 메인 엔진이 oxlint(Rust). ESLint 아님.
- oxlint는 `jsPlugins` 옵션으로 ESLint 호환 JS plugin을 실행 가능
- 기존 통합된 두 plugin(`eslint-plugin-react-hooks`, `eslint-plugin-react-you-might-not-need-an-effect`)이 같은 경로
- 우리 사이드카 plugin도 **동일 경로**로 통합 → 진단이 자연스럽게 같은 점수 파이프라인을 탐
- CLI의 `packages/core/src/runners/oxlint/plugin-resolution.ts`에 resolver + namespace + rule list 등록 패턴 그대로 복제

### 결정 4. 22개 GAP 중 5개만 mechanical로 (HIGH lintability)

- Vercel 70개 ↔ react-doctor 178개 매핑: 45개 이미 커버됨, 22개 GAP
- 22개 GAP을 lintability 평가로 분류:
  - 🟢 HIGH (5): 패턴 명확 → mechanical 구현
  - 🟡 MEDIUM (7): false positive 위험 → 보수적
  - 🔴 LOW (8): prose-only 권고문 → lint 안 함
- 🟢 5개 → 사이드카 plugin 룰로 추가 (현재 2/5 완료)

### 결정 5. 릴리스 트리거 — `workflow_dispatch` → `tag push`

- 초기엔 수동 dispatch (안전한 출발)
- 패키지가 안정화되면서 GitHub Release(tag push) 트리거로 전환 — 릴리스 노트 자동 보존
- 안전장치: workflow 첫 단계가 `tag name` vs `package.json version` 일치 검증 → 어긋나면 즉시 실패
- 수동 dispatch는 보존 (ad-hoc/재시도/dry-run용)

### 결정 6. 일반 semver 사용 — `-itall.0` suffix 제거

- 초기: `0.3.0-itall.0` prerelease suffix로 fork 표시
- 결정: 스코프(`@it-all-service`)가 이미 fork 식별 → suffix 잉여
- v0.4.0부터 일반 `MAJOR.MINOR.PATCH`

### 결정 7. 두 패키지 버전 정렬

- `react-doctor` + `eslint-plugin-itall-react` 같은 버전 사용
- `.changeset/config.json`의 `fixed` 그룹으로 자동 정렬
- 이유: 컨슈머가 항상 짝 맞는 쌍을 받게

---

## 3. 사고 & 복구

### 사고 1. PAT 노출 (2026-05-19)

- 컨슈머 프로젝트(`school-project/.npmrc`)에 `_authToken=ghp_lC9d...` 직접 입력 → 채팅 transcript + hook 로그에 노출
- `.gitignore`에 `.npmrc` 없어서 git add 시 origin push 위험
- 즉시 폐기 + 재발급 + secret 갱신
- 학습: PAT은 **반드시 `~/.npmrc` 또는 CI secret에만**. 프로젝트 `.npmrc`엔 registry 라우팅만.
- 메모리: `feedback_npmrc_pat_placement.md`

### 사고 2. v0.3.0 태그가 머지 전에 생성됨

- PR #4(version 정렬) 머지 전에 release를 만들어 태그를 push → 워크플로 트리거됨
- 워크플로의 안전장치(tag/version 일치 검증)가 작동해서 11초 만에 실패 (의도된 동작)
- 복구: PR 머지 후 수동 dispatch로 publish
- 학습: Release는 **반드시 버전 정렬 PR 머지 후**에 만들기

### 사고 3. v0.4.0 신규 룰 silent failure

- `itall/rendering-hydration-suppress-warning`이 컨슈머 환경에서 **단 한 건도 발화 안 함**
- school-project 로컬 검증 중 발견 (testing 안 했으면 못 잡았을 가능성)
- 원인 1: oxlint JS plugin 로더는 `JSXElement`/`JSXExpressionContainer`를 top-level visitor selector로 fire하지 않음 (ESLint와 다른 동작)
- 원인 2: `inspectJsxContext`가 parent chain에서 `FunctionDeclaration`을 만나면 무조건 early-return — 컴포넌트 함수가 chain의 정상 위치에 있어도 false negative
- 복구: `NewExpression`/`CallExpression` 셀렉터로 교체 + `node.parent` 체인 walk + JSX 진입 후 function-like 통과 허용 (v0.4.1 PR #7)
- 학습: oxlint JS plugin에서 동작 보장된 셀렉터는 기존 upstream 룰이 사용한 것들만. 직접 검증 필수.

### 사고 4. PR #6 머지 시 vp 포맷 미적용 → 후속 PR CI 깨짐

- 설계 문서를 처음 commit할 때 `pnpm format` 안 돌리고 push
- PR #6 머지 후, 후속 fix PR의 CI가 docs 파일 format 위반으로 실패
- 복구: fix 브랜치 main rebase → `pnpm format` → 8줄 화이트스페이스 수정 커밋
- 학습: 새 파일 추가 시 항상 `pnpm format` 먼저

---

## 4. 변경 사항 인벤토리

### 신규 패키지

- `packages/eslint-plugin-itall-react/` — 사내 룰 모음. publish 대상.

### 신규 파일 (코드)

- `packages/eslint-plugin-itall-react/src/index.ts` — plugin entry
- `packages/eslint-plugin-itall-react/src/types.ts` — rule shape types
- `packages/eslint-plugin-itall-react/src/rules/rerender-use-ref-transient-values.ts` — 첫 룰
- `packages/eslint-plugin-itall-react/src/rules/rendering-hydration-suppress-warning.ts` — 두 번째 룰
- `packages/eslint-plugin-itall-react/tests/plugin-shape.test.ts` — smoke test
- `.github/workflows/publish.yml` — publish 워크플로

### 신규 파일 (문서)

- `docs/sidecar-eslint-plugin-plan.md` — 통합 설계 + 5개 룰 spec
- `docs/session-history-2026-05-19_20.md` — 이 문서

### 수정 파일

- 루트 `package.json` — name → `itall-react-doctor`, URL 갱신, leaderboard 스크립트 제거
- `packages/react-doctor/package.json` — name → `@it-all-service/...`, version, publishConfig, peer dep
- `packages/core/src/runners/oxlint/plugin-resolution.ts` — `resolveItallReactPlugin` + `ITALL_REACT_RULES`
- `packages/core/src/runners/oxlint/config.ts` — 사이드카 plugin wire
- `.changeset/config.json` — repo + fixed 그룹
- README 3개 재작성 (루트 + react-doctor + eslint-plugin-itall-react)

### 삭제 파일

- `packages/website/` (8.3M, upstream docs 사이트)
- `TODOS.md`, `action.yml`, `assets/`
- `scripts/update-leaderboard.ts` + 워크플로
- `packages/react-doctor/tests/github-action.test.ts` (action.yml 검증 테스트)

---

## 5. PR / Release / 버전 타임라인

| 순서 | PR  | 변경                                        | 머지       | Release                  |
| ---- | --- | ------------------------------------------- | ---------- | ------------------------ |
| 1    | #1  | 리브랜딩 + publish workflow 초안            | 2026-05-19 | (manual dispatch 0.2.1)  |
| 2    | #2  | 사이드카 plugin scaffold + 첫 룰 PoC        | 2026-05-19 | v0.3.0 (manual dispatch) |
| 3    | #3  | publish workflow를 tag push로 전환          | 2026-05-19 | -                        |
| 4    | #4  | 두 패키지 0.3.0 정렬 (`-itall.0` 제거)      | 2026-05-20 | -                        |
| 5    | #5  | rerender 룰 정확도 개선 + hydration 룰 추가 | 2026-05-20 | **v0.4.0**               |
| 6    | #6  | 사이드카 plugin 설계 문서                   | 2026-05-20 | -                        |
| 7    | #7  | hydration 룰 silent failure 수정            | 2026-05-20 | **v0.4.1**               |

---

## 6. 현재 머지된 상태 (main 기준)

### 컨슈머 사용법

```bash
# ~/.npmrc — 사용자 홈 (한 번만)
echo "//npm.pkg.github.com/:_authToken=<PAT>" >> ~/.npmrc

# project/.npmrc — 커밋 가능
@it-all-service:registry=https://npm.pkg.github.com

# install
pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react

# run
pnpm exec react-doctor
```

### 릴리스 절차

1. 버전 bump PR (두 패키지 동시) → 머지
2. GitHub UI → Releases → Draft → tag `v<버전>` → 노트 작성 → Publish
3. workflow가 tag/version 일치 검증 후 자동 publish (sidecar → CLI 순서)

### 활성 룰 (사내)

| 룰                                           | 심각도 | 검출                                               |
| -------------------------------------------- | ------ | -------------------------------------------------- |
| `itall/rerender-use-ref-transient-values`    | warn   | 고빈도 이벤트 핸들러 안 useState 셋터              |
| `itall/rendering-hydration-suppress-warning` | warn   | JSX 안 비결정적 값 + suppressHydrationWarning 없음 |

---

## 7. 남은 작업

### 단기 (다음 세션)

- 남은 3개 lintability HIGH 룰 (설계 문서 §3 spec 참조):
  1. `async-cheap-condition-before-await` (난이도 낮음, 1-2h)
  2. `server-parallel-nested-fetching` (난이도 중간, 1-2h)
  3. `async-api-routes` (난이도 높음, 2-3h)

### 중기

- school-project 정식 도입 (별도 PR, Dockerfile에 GitHub Packages 인증 빌드 시크릿 주입)
- 다른 사내 프로젝트(itall-web, admin.itall.com, ...) 차례 적용
- 룰 false positive 모니터링 → 일부 `warn` → `error` 승격 검토

### 장기

- 🟡 MEDIUM lintability 룰 7개 중 가성비 좋은 것 추가 (`advanced-init-once`, `rerender-split-combined-hooks` 등)
- 점수 가중치 카테고리 검토 (`packages/core/src/calculate-score.ts` 등)
- 컨슈머 CI 통합 표준화 (각 프로젝트마다 적용)

---

## 8. 학습 요약

### oxlint JS plugin 호환성

- `node.parent` **사용 가능** (upstream `rn-no-inline-object-in-list-item` 룰이 활용)
- 동작 보장 셀렉터: `CallExpression`, `NewExpression`, `Identifier`, `JSXAttribute`, `Program`
- **동작 안 함 셀렉터** (또는 fire 안 함): `JSXElement` enter/exit, `JSXExpressionContainer` (top-level)
- 새 룰 만들 때 셀렉터가 정말 fire되는지 **반드시 검증** (DEBUG report unconditional로 확인)

### react-doctor 통합 패턴

- 3개 파일만 수정하면 새 ESLint plugin이 oxlint JS plugin 경로로 합류
  - `plugin-resolution.ts`: `resolveXxxPlugin` + namespace + rules constant
  - `config.ts`: jsPlugins.push + rules 머지
- 진단은 자동으로 같은 점수 파이프라인을 탐

### 운영 패턴

- 릴리스: 버전 정렬 PR → 머지 → Release 생성 (이 순서가 깨지면 워크플로 fail-fast)
- PAT은 `~/.npmrc` 또는 CI secret. 프로젝트 `.npmrc`엔 registry 라우팅만.
- 새 파일 추가 시 `pnpm format` 선행

---

## 9. 외부 참조

- [Vercel react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- [Upstream react-doctor](https://github.com/millionco/react-doctor)
- [oxlint](https://oxc-project.github.io/)
- 우리 fork: [IT-ALL-Service/itall-react-doctor](https://github.com/IT-ALL-Service/itall-react-doctor)
- 우리 packages: [@it-all-service/react-doctor](https://github.com/IT-ALL-Service/itall-react-doctor/packages), [@it-all-service/eslint-plugin-itall-react](https://github.com/IT-ALL-Service/itall-react-doctor/packages)
- 설계 문서: [docs/sidecar-eslint-plugin-plan.md](./sidecar-eslint-plugin-plan.md)
