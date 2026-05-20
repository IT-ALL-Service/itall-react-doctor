# itall-react-doctor

[`millionco/react-doctor`](https://github.com/millionco/react-doctor)의 사내 fork. itall이 운영하는 React / Next.js 프로젝트를 자동으로 점검해주는 lint 도구.

upstream의 178개 oxlint 룰에 itall 팀이 직접 짠 룰 13개를 사이드카로 얹어서, `pnpm exec react-doctor` 한 번에 점수와 진단을 받는다. 같은 점수 파이프라인을 타기 때문에 사내 룰과 upstream 룰이 어디서 나왔든 결과는 한 번에 합쳐져 나온다.

저장소는 pnpm 모노레포로, GitHub Packages에 publish 가능한 두 패키지를 묶어둔다.

| 패키지                                                                              | 역할                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`@it-all-service/react-doctor`](./packages/react-doctor)                           | CLI. upstream 178개 룰 + 사이드카 룰을 한 번에 돌리고 단일 점수로 보여준다 |
| [`@it-all-service/eslint-plugin-itall-react`](./packages/eslint-plugin-itall-react) | 사내 ESLint 룰 모음. CLI에 사이드카로 주입돼 같이 동작                     |

## 컨슈머 프로젝트에서 쓰기

### 설치

먼저 `~/.npmrc`에 GitHub Packages 토큰을 한 번만 깔아둔다 (PAT은 `read:packages` 스코프).

```bash
echo "//npm.pkg.github.com/:_authToken=<PAT>" >> ~/.npmrc
```

소비할 프로젝트 루트에는 scope 라우팅만 추가 — 이건 커밋해도 안전하다.

```ini
# .npmrc
@it-all-service:registry=https://npm.pkg.github.com
```

그다음 설치 + 실행:

```bash
pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
pnpm exec react-doctor
```

사이드카 plugin은 optional peer dep으로 묶여 있어서, 안 깔아도 CLI는 그대로 동작한다 (사내 룰만 빠짐).

### CI에서 PR마다 진단을 코멘트로 받기

`.github/actions/pr-comment` composite action을 호출하면 PR마다 sticky 코멘트로 결과가 달린다. 같은 PR을 재실행해도 코멘트가 쌓이지 않고 업데이트만 된다.

```yaml
# .github/workflows/react-doctor.yml (컨슈머 프로젝트)
name: React Doctor

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  packages: read # @it-all-service 패키지 install용
  pull-requests: write # sticky 코멘트 작성용

jobs:
  react-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 } # diff 모드에서 base 비교에 필요
      - uses: IT-ALL-Service/itall-react-doctor/.github/actions/pr-comment@v0.5.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          diff: main
          react-doctor-version: 0.5.0
```

자세한 입력값·동작은 [action README](./.github/actions/pr-comment/README.md) 참고.

## 사이드카 룰

지금 13개 룰이 사이드카에 들어가 있다. 출처는 두 갈래:

- **Vercel `react-best-practices`** — upstream react-doctor가 아직 mechanical하게 잡지 못하는 패턴 (6개)
- **사내 `claude-presets`** — 사고 예방·운영 자산 가치가 높은 itall 자체 컨벤션 (7개)

전체 표·각 룰의 동작·검출 알고리즘은 [`packages/eslint-plugin-itall-react/README.md`](./packages/eslint-plugin-itall-react/README.md)에 있다. 어떤 룰을 왜 골랐는지 / 왜 어떤 룰은 안 만들었는지(겹침 정책, prose-only, 측정 백로그 등)는 [`docs/sidecar-eslint-plugin-plan.md`](./docs/sidecar-eslint-plugin-plan.md)에 결정 기록으로 남겨두고 있다.

## 로컬 개발

```bash
pnpm install
pnpm gen        # 사이드카 룰 추가/제거 후
pnpm build      # 모든 패키지 빌드
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

빌드는 [Turborepo](https://turbo.build/) + [vite-plus](https://www.npmjs.com/package/vite-plus)에 맡겨두고 있다. PR을 올리면 CI가 위 명령들을 다 돌리니 사전에 통과시켜놓으면 좋다.

### 사이드카에 룰 하나 더 추가하고 싶다면

1. `packages/eslint-plugin-itall-react/src/rules/<rule-key>.ts` 만들고 `defineItallRule({...})`로 작성
2. `pnpm gen` 한 번 — `registry.gen.ts` + `core/runners/oxlint/itall-rules.gen.ts`가 자동 갱신
3. `tests/plugin-shape.test.ts`에 smoke 테스트, `packages/react-doctor/tests/regressions/itall-sidecar-rules.test.ts`에 E2E 케이스 추가
4. README 룰 표 갱신

자세한 절차는 사이드카 README의 "개발" 섹션에 정리돼 있다.

## 릴리스

태그 push로 자동 publish하는 흐름이다.

1. PR에서 두 패키지의 `package.json` version을 같이 bump하고 머지
2. GitHub UI → **Releases → Draft a new release** → 태그명 `v<버전>` (예: `v0.5.0`) → 노트 작성 → **Publish release**
3. 태그 push가 `.github/workflows/publish.yml`을 트리거. 워크플로가 태그와 `packages/react-doctor`의 version이 일치하는지 먼저 검증하고, 사이드카 → CLI 순서로 publish

ad-hoc 재시도가 필요하면 같은 워크플로를 `workflow_dispatch`로 수동 실행할 수 있다 (`dry-run` 옵션도 그때만 지원).

## upstream과 다른 점

- 패키지 스코프가 `@it-all-service/*`이고 publish 대상이 GitHub Packages
- 사이드카 ESLint plugin이 동일 점수 파이프라인에 합류 (룰 13개 추가)
- upstream의 docs 사이트(`packages/website`)와 leaderboard 스크립트는 fork에서 제거
- upstream의 Marketplace `action.yml`은 처음에 제거했다가 사내 컨슈머용으로 `.github/actions/pr-comment`에 다시 부활시킴 (Marketplace 등록은 안 함, repo 경로로만 호출)

upstream 본문 룰 목록과 CLI 플래그 전체는 [`packages/react-doctor/README.md`](./packages/react-doctor/README.md)에서 다룬다.

## 라이선스

MIT (upstream과 동일). [LICENSE](./LICENSE) 참고.
