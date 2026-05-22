# itall-react-doctor

IT-ALL-Service에서 사용하는 React/Next.js 코드 진단 도구입니다. [`millionco/react-doctor`](https://github.com/millionco/react-doctor)를 기반으로 하며, upstream 룰과 사내 룰을 한 번에 실행해 코드 품질 점수와 진단 결과를 보여줍니다.

## 구성

| 패키지                                                                              | 역할                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`@it-all-service/react-doctor`](./packages/react-doctor)                           | CLI. React/Next.js 프로젝트를 스캔하고 점수와 진단 결과를 출력합니다.    |
| [`@it-all-service/eslint-plugin-itall-react`](./packages/eslint-plugin-itall-react) | 사내 React/Next.js 룰 모음. CLI에 optional peer dependency로 연결됩니다. |

## 사용하기

GitHub Packages에서 `@it-all-service/*` 패키지를 설치할 수 있도록 프로젝트 루트에 scope registry를 설정합니다.

```ini
# .npmrc
@it-all-service:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${IT_ALL_NPM_TOKEN}
```

`IT_ALL_NPM_TOKEN`에는 `read:packages` 권한과 IT-ALL-Service SSO 승인이 된 토큰을 넣습니다. 토큰 값은 `.npmrc`에 직접 적지 말고 환경변수나 CI secret으로 관리합니다.

```bash
ni -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
```

```bash
pnpm exec itall-react-doctor
```

사내 룰이 필요 없으면 `@it-all-service/eslint-plugin-itall-react`는 생략할 수 있습니다.

## GitHub Actions

루트의 [`action.yml`](./action.yml)을 컨슈머 저장소에서 호출하면 PR마다 React Doctor 결과가 sticky comment로 남습니다.

```yaml
name: React Doctor

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  react-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: IT-ALL-Service/itall-react-doctor@v0
        with:
          github-token: ${{ github.token }}
          npm-auth-token: ${{ secrets.IT_ALL_NPM_TOKEN }}
          diff: main
          fail-on: warning
          annotations: "true"
```

필요한 준비:

- 컨슈머 저장소를 GitHub Packages의 `Manage Actions access`에 `Read` 권한으로 추가
- 컨슈머 저장소 secret에 `IT_ALL_NPM_TOKEN` 저장
- 봇 계정이나 GitHub App으로 PR 코멘트를 작성하려면 `github-token`에 해당 토큰 전달

`@v0`은 v0.x 릴리스마다 최신 commit으로 이동하는 major tag입니다. 정확한 버전에 고정하려면 `@v0.6.1`처럼 태그를 지정합니다.

## 사내 룰

사내 룰은 현재 13개입니다.

- Vercel `react-best-practices` 기반 룰 6개
- IT-ALL-Service `claude-presets` 기반 룰 7개

룰 목록과 예시는 [`packages/eslint-plugin-itall-react/README.md`](./packages/eslint-plugin-itall-react/README.md)에 있습니다. 선정 기준과 제외한 룰의 결정 기록은 [`docs/sidecar-eslint-plugin-plan.md`](./docs/sidecar-eslint-plugin-plan.md)를 참고합니다.

## 로컬 개발

기본 명령은 `@antfu/ni`의 `ni` / `nr`를 사용합니다. 로컬에 `nr`가 없다면 이 저장소의 `packageManager`가 pnpm이므로 `pnpm <script>`로 같은 스크립트를 실행하면 됩니다.

```bash
ni
nr gen
nr build
nr typecheck
nr test
nr lint
nr format:check
```

```bash
pnpm install
pnpm gen
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

사이드카 룰을 추가할 때는 보통 다음 파일을 함께 수정합니다.

1. `packages/eslint-plugin-itall-react/src/rules/<rule-key>.ts`
2. `packages/eslint-plugin-itall-react/tests/plugin-shape.test.ts`
3. `packages/react-doctor/tests/regressions/itall-sidecar-rules.test.ts`
4. [`packages/eslint-plugin-itall-react/README.md`](./packages/eslint-plugin-itall-react/README.md)

룰 registry를 갱신해야 하면 `nr gen`을 실행합니다.

## 릴리스

릴리스는 태그 push로 진행합니다.

1. 두 패키지의 `package.json` 버전을 함께 올리고 main에 머지
2. `v<버전>` 태그 생성 및 push
3. `.github/workflows/publish.yml`이 GitHub Packages publish, `v<major>` moving tag 갱신, GitHub Release 생성을 수행

예시:

```bash
git checkout main
git pull
git tag v0.6.1
git push origin v0.6.1
```

## upstream과 다른 점

- 패키지 스코프는 `@it-all-service/*`이고 publish 대상은 GitHub Packages입니다.
- 사내 ESLint plugin 진단이 React Doctor 점수 파이프라인에 함께 반영됩니다.
- upstream docs site와 leaderboard 스크립트는 제거했습니다.
- 사내 컨슈머용 composite action을 제공합니다.

CLI 옵션과 upstream 룰 설명은 [`packages/react-doctor/README.md`](./packages/react-doctor/README.md)를 참고합니다.

## 라이선스

MIT. [LICENSE](./LICENSE) 참고.
