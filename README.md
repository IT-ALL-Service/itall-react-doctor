# itall-react-doctor

`millionco/react-doctor`의 사내 fork. itall 팀이 운영하는 React/Next.js 프로젝트에 맞게 다듬은 lint 도구.

이 저장소는 두 개의 publish 가능 패키지를 묶은 pnpm 모노레포다.

| 패키지                                                                              | 설명                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@it-all-service/react-doctor`](./packages/react-doctor)                           | upstream과 동일한 178개 oxlint 룰 + 사내 사이드카 룰을 함께 돌려 단일 점수를 산출하는 CLI                                                        |
| [`@it-all-service/eslint-plugin-itall-react`](./packages/eslint-plugin-itall-react) | 위 CLI에 함께 주입되는 사내 ESLint 룰 모음. Vercel `react-best-practices` 중 upstream react-doctor가 아직 mechanical하게 잡지 못하는 패턴을 보완 |

## 컨슈머에서 쓰기

전제: GitHub `IT-ALL-Service` org의 GitHub Packages를 읽을 수 있는 PAT(`read:packages`)이 `~/.npmrc`에 설정돼 있어야 한다.

```bash
# 사용자 홈 (한 번만)
echo "//npm.pkg.github.com/:_authToken=<PAT>" >> ~/.npmrc
```

소비할 프로젝트 루트에 scope 라우팅 추가(이 파일은 커밋 안전):

```ini
# .npmrc
@it-all-service:registry=https://npm.pkg.github.com
```

설치 후 실행:

```bash
pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
pnpm exec react-doctor
```

사이드카 plugin은 optional peer dep으로 묶여 있어서 설치하지 않으면 사내 룰만 빠지고 나머지 178 룰은 그대로 동작한다.

## 로컬 개발

```bash
pnpm install
pnpm build      # 모든 패키지 빌드
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

빌드 흐름은 [Turborepo](https://turbo.build/)와 [vite-plus](https://www.npmjs.com/package/vite-plus)에 위임돼 있다. 변경 사항을 만들면 위 6개 명령이 전부 통과해야 PR이 CI를 통과한다.

## 릴리스

기본 플로우는 **tag push 트리거**다.

1. PR에서 두 패키지(`packages/react-doctor`, `packages/eslint-plugin-itall-react`)의 `package.json` version을 동일하게 bump하고 머지.
2. GitHub UI에서 **Releases → Draft a new release** → 태그명 `v<버전>`(예: `v0.3.0-itall.1`) → 노트 작성 → **Publish release**.
3. 태그 push가 `.github/workflows/publish.yml`을 자동 트리거한다. 워크플로는 태그와 `packages/react-doctor`의 version이 일치하는지 먼저 검증한 뒤, 사이드카 → CLI 순서로 publish.

ad-hoc/재시도가 필요하면 동일 워크플로를 `workflow_dispatch`로 수동 트리거할 수 있고, 그 경우에 한해 `dry-run` 옵션을 지원한다.

## upstream과의 차이

- 패키지 스코프(`@it-all-service/*`)와 publish 대상이 GitHub Packages
- 사이드카 ESLint plugin이 동일 score 파이프라인에 합류
- upstream의 docs 사이트(`packages/website`)와 leaderboard, GHA 정의는 fork에서 제거

upstream 본문 룰 목록과 사용법은 [`packages/react-doctor/README.md`](./packages/react-doctor/README.md)에서 다룬다.

## 라이선스

MIT (upstream과 동일). [LICENSE](./LICENSE) 참고.
