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

GitHub Packages 인증 PAT을 만들어 환경변수로 노출해둔다. PAT은 **classic**, 스코프 `read:packages`, 발급 후 **IT-ALL-Service org SSO authorize** 버튼 클릭 필수 (안 누르면 org-restricted 패키지에 403). 컨벤션상 환경변수 이름은 `IT_ALL_NPM_TOKEN` 으로 통일한다.

```bash
# ~/.zshrc 또는 ~/.bashrc
export IT_ALL_NPM_TOKEN=<PAT>
```

PAT 평문을 `~/.npmrc` 에 직접 박지 말고 placeholder 로만 두는 게 안전 (실수로 다른 파일에 commit / 화면 캡처 등 사고 방지):

```ini
# ~/.npmrc
//npm.pkg.github.com/:_authToken=${IT_ALL_NPM_TOKEN}
```

소비할 프로젝트 루트에는 scope 라우팅 + 같은 placeholder 만 추가 — 이건 커밋해도 안전하다.

```ini
# .npmrc (프로젝트 루트, 커밋 가능)
@it-all-service:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${IT_ALL_NPM_TOKEN}
```

그다음 설치 + 실행:

```bash
pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
pnpm exec react-doctor
```

사이드카 plugin은 optional peer dep으로 묶여 있어서, 안 깔아도 CLI는 그대로 동작한다 (사내 룰만 빠짐).

### CI에서 PR마다 진단을 코멘트로 받기

repo root에 `action.yml`이 있어서 컨슈머 워크플로에서 한 줄로 호출할 수 있다. PR마다 sticky 코멘트로 결과가 달리고, 같은 PR을 재실행해도 코멘트가 쌓이지 않고 업데이트만 된다.

토큰은 **두 가지**를 분리해서 쓴다. 같은 토큰 하나로 못 묶는 이유는 `npm.pkg.github.com` 이 GitHub Actions의 기본 `GITHUB_TOKEN` 과 GitHub App installation token 양쪽 다 거부하는 케이스가 있어서, install 은 PAT 가 사실상 유일한 안정 경로이기 때문.

| 작업                              | 토큰                                                                                | 비고                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `@it-all-service/*` install       | **PAT** (`IT_ALL_NPM_TOKEN` secret, `read:packages`, SSO authorized)                | `GITHUB_TOKEN` / App token 은 `npm.pkg.github.com` 401 |
| sticky PR 코멘트 작성             | **GitHub App** (`actions/create-github-app-token@v2`, App secrets `APP_ID` + `PRIVATE_KEY`) | 봇 명의로 깔끔, 사용자 PAT 노출 0                     |

```yaml
# .github/workflows/react-doctor.yml (컨슈머 프로젝트)
name: React Doctor

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write # 실제 코멘트는 아래 App token 으로 — 안전망

jobs:
  react-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 } # diff 모드에서 base 비교에 필요

      - name: Create GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.PRIVATE_KEY }}
          owner: IT-ALL-Service
          repositories: |
            itall-react-doctor
            <consumer-repo-name>

      - uses: IT-ALL-Service/itall-react-doctor@v0
        with:
          github-token: ${{ steps.app-token.outputs.token }}   # PR 코멘트 작성
          npm-auth-token: ${{ secrets.IT_ALL_NPM_TOKEN }}      # GitHub Packages install
          diff: main
          project: <workspace-name>  # monorepo면
          fail-on: warning
          annotations: "true"
```

새 컨슈머 셋업 시 추가로:
- itall-react-doctor 쪽 Settings → Packages → 각 패키지 → Manage Actions access 에 컨슈머 repo `Read` 추가
- GitHub App (예: "react-doctor") 을 itall-react-doctor + 컨슈머 repo 양쪽에 install
- 컨슈머 repo Secrets: `IT_ALL_NPM_TOKEN` (PAT), `APP_ID`, `PRIVATE_KEY` 저장

`@v0`은 publish 워크플로가 v0.x 릴리스마다 자동으로 같은 commit으로 이동시키는 major moving tag다. 컨슈머는 새 minor/patch가 나올 때마다 워크플로를 고칠 필요가 없다. 정확한 버전에 고정하고 싶으면 `@v0.6.1` 형태로 바꿀 수 있다.

CLI 패키지 버전도 default가 `latest`라 따로 명시 안 해도 된다 (안정성이 중요하면 `react-doctor-version: 0.6.1` 같은 명시 옵션 있음). 자세한 입력값·동작은 [`action.yml`](./action.yml) 본문에 인라인 주석으로 정리돼 있다.

### offline-only

`0.6.0`부터 외부 `react.doctor` scoring API / share URL / "React Review" CTA 통합이 모두 제거됐다. diagnostics 메타데이터를 외부 서버로 보낼 일이 없고, 점수는 로컬에서 `max(0, 100 - errors*10 - warnings*3)` 산식으로 계산한다. `--offline` 플래그와 `offline` config 필드, action `offline` 입력은 deprecation noop으로 남겨두지만 새 워크플로에서는 빼는 게 좋다.

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

태그 push 하나로 publish · moving tag 갱신 · GitHub Release 생성까지 자동으로 묶여 돈다.

1. PR 에서 두 패키지의 `package.json` version 을 같이 bump 하고 머지
2. 로컬에서 새 태그를 만들고 push:
   ```bash
   git checkout main && git pull
   git tag v<버전>           # 예: git tag v0.6.1
   git push origin v<버전>
   ```
3. 태그 push 가 `.github/workflows/publish.yml` 을 트리거. 워크플로가 순서대로:
   - 태그와 `packages/react-doctor` version 일치 검증
   - 사이드카 → CLI 순서로 GitHub Packages 에 publish
   - `v<major>` (예: `v0`) moving tag 를 새 commit 으로 force-push
   - `gh release create $TAG --generate-notes` 로 GitHub Release 자동 생성 (이전 태그부터의 커밋을 모아 노트 자동 작성, `-rc.x` 같은 pre-release 태그는 `--prerelease` 마크)

ad-hoc 재시도가 필요하면 같은 워크플로를 `workflow_dispatch` 로 수동 실행할 수 있다 (`dry-run` 옵션도 그때만 지원). `workflow_dispatch` 는 moving tag · GitHub Release 생성 단계를 모두 skip 하므로 옛 commit 에서 re-publish 해도 `v0` 가 뒤로 가지 않음.

## upstream과 다른 점

- 패키지 스코프가 `@it-all-service/*`이고 publish 대상이 GitHub Packages
- 사이드카 ESLint plugin이 동일 점수 파이프라인에 합류 (룰 13개 추가)
- upstream의 docs 사이트(`packages/website`)와 leaderboard 스크립트는 fork에서 제거
- upstream의 `action.yml`은 처음에 제거했다가 사내 컨슈머용으로 다시 부활. GitHub Packages 인증 단계가 추가됐고, sticky 코멘트 마커도 `<!-- itall-react-doctor -->`로 namespace 분리. Marketplace에는 등록하지 않고 `uses: IT-ALL-Service/itall-react-doctor@v0`처럼 ref만 잡아서 호출

upstream 본문 룰 목록과 CLI 플래그 전체는 [`packages/react-doctor/README.md`](./packages/react-doctor/README.md)에서 다룬다.

## 라이선스

MIT (upstream과 동일). [LICENSE](./LICENSE) 참고.
