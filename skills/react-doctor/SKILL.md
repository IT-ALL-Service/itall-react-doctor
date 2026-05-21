---
name: react-doctor
description: Use when finishing a feature, fixing a bug, before committing React code, or when the user wants to improve code quality or clean up a codebase. Checks the itall React Doctor score (offline-only fork) and surfaces upstream + 사내 사이드카 룰 위반.
version: "2.0.0"
---

# itall React Doctor

`@it-all-service/react-doctor` (사내 fork of millionco/react-doctor) 로 React 코드를 점검한다. upstream 178개 oxlint 룰 + 사내 사이드카 13개를 한 번에 돌리고 0–100 점수로 결과를 요약.

- 외부 API 호출 / share URL 없음 (offline-only). 점수는 로컬 산식 (`max(0, 100 - errors*10 - warnings*3)`).
- 패키지는 GitHub Packages (`npm.pkg.github.com`)에 있고 `IT_ALL_NPM_TOKEN` 환경변수로 인증 (`~/.zshrc` 또는 `~/.npmrc` 에 export 돼 있어야 함). 워크플로(CI)는 자동.

## After making React code changes

Run **`pnpm doctor:diff`** (consumer 의 `package.json`에 정의돼 있으면 우선) 또는 **`pnpm exec react-doctor . --verbose --diff`** 를 실행하고 점수가 회귀하지 않았는지 확인.

만약 점수가 떨어지면 커밋 전에 회귀를 잡는다. PR 올리면 `itall React Doctor` 워크플로가 같은 결과를 sticky 코멘트로 자동 게시.

## For general cleanup or code improvement

**`pnpm doctor`** 또는 **`pnpm exec react-doctor . --verbose`** 로 전체 스캔. severity 순으로 (error → warning) 고친다.

monorepo 라면 `--project <name>` 으로 대상 워크스페이스를 명시.

## Commands

| 명령                                              | 동작                                                      |
| ------------------------------------------------- | --------------------------------------------------------- |
| `pnpm exec react-doctor . --verbose`              | 전체 스캔                                                 |
| `pnpm exec react-doctor . --verbose --diff`       | base 브랜치 대비 변경분만 스캔                            |
| `pnpm exec react-doctor . --score`                | 점수만 출력 (CI 게이트용)                                 |
| `pnpm exec react-doctor . --project <name>`       | monorepo에서 특정 워크스페이스만                          |
| `pnpm exec react-doctor --help`                   | 전체 옵션                                                 |

(`npx -y @it-all-service/react-doctor@latest` 로 직접 호출하지 않는 이유: 패키지가 private GitHub Packages 라 매번 토큰 인증 + 재다운로드가 필요. dev dependency 로 이미 설치돼 있으니 `pnpm exec` 가 빠르고 안정적.)
