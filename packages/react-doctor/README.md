# @it-all-service/react-doctor

itall 팀이 운영하는 [`millionco/react-doctor`](https://github.com/millionco/react-doctor) fork. React/Next.js 코드베이스의 보안·성능·정확성·접근성·번들·아키텍처 이슈를 진단해 **0–100 점수**로 환산한다.

upstream과의 핵심 차이: 사내 ESLint plugin([`@it-all-service/eslint-plugin-itall-react`](../eslint-plugin-itall-react))이 같은 점수 파이프라인에 합류해 fork 전용 룰까지 단일 리포트에 통합된다.

## 설치

전제: `IT-ALL-Service` org의 GitHub Packages를 읽을 수 있는 PAT(`read:packages`)을 사용자 홈 `~/.npmrc`에 등록.

```bash
echo "//npm.pkg.github.com/:_authToken=<PAT>" >> ~/.npmrc
```

사용할 프로젝트 루트에 scope 라우팅 추가(커밋 안전, auth 토큰 포함 금지):

```ini
# .npmrc
@it-all-service:registry=https://npm.pkg.github.com
```

설치:

```bash
pnpm add -D @it-all-service/react-doctor @it-all-service/eslint-plugin-itall-react
```

사이드카 plugin은 optional peer dep이라 생략 가능. 생략 시 사내 룰만 빠지고 upstream 178개 룰은 그대로 동작한다.

## 사용

```bash
pnpm exec react-doctor
```

워크스페이스 안에서 돌리면 스캔할 프로젝트를 고르는 프롬프트가 뜬다. CI에선 다음 플래그 조합을 자주 쓴다:

```bash
pnpm exec react-doctor -y --fail-on error --pr-comment
```

전체 플래그는 `pnpm exec react-doctor --help` 참고.

## 상세 옵션 요약

| 플래그                      | 설명                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| `-y, --yes`                 | 인터랙티브 프롬프트 건너뛰고 모든 워크스페이스 프로젝트 스캔      |
| `--full`                    | 변경 파일만 스캔하는 diff 모드 무시하고 전체 스캔                 |
| `--diff [base]`             | base 브랜치와 차이 나는 파일만 스캔 (기본: 자동 감지)             |
| `--staged`                  | git 인덱스에 staged된 파일만 스캔 (pre-commit 훅용)               |
| `--offline`                 | react.doctor 점수 API와 share URL 건너뛰기 (외부 송신 차단)       |
| `--fail-on <level>`         | 진단 발견 시 종료 코드: `error`(기본), `warning`, `none`          |
| `--pr-comment`              | PR sticky 코멘트용 출력 — `design` 같은 weak-signal 카테고리 제외 |
| `--annotations`             | GitHub Actions annotation 형식으로 진단 출력                      |
| `--explain <file:line>`     | 특정 위치에서 룰이 왜 fired/suppressed인지 진단                   |
| `--respect-inline-disables` | `// oxlint-disable*` 코멘트 존중 (기본 활성)                      |
| `--project <name>`          | 특정 워크스페이스만 스캔 (콤마 구분)                              |
| `--json`, `--json-compact`  | JSON 리포트 출력                                                  |
| `--score`                   | 점수만 출력                                                       |

## 출력 예시

```
✔ Detecting framework. Found Next.js.
✔ Detecting React version. Found React ^19.1.2.
✔ Found 79 source files.
✔ Running lint checks.

State & Effects 2 issues
  ⚠ Chain state updates
    Avoid chaining state changes...
    components/Foo.tsx:116

  React Doctor (www.react.doctor)
  Score: 92 (Great)
  2 issues across 1/79 files  in 479ms
```

`--offline` 모드면 외부 점수 API를 호출하지 않고 진단 개수만 출력한다.

## 룰 카테고리

upstream 178개 룰 카테고리(react-native·tanstack 포함). 자세한 분류는 fork의 [`docs/sidecar-eslint-plugin-plan.md`](../../docs/sidecar-eslint-plugin-plan.md)에 정리돼 있다.

사이드카 plugin이 추가하는 사내 룰은 [`@it-all-service/eslint-plugin-itall-react`](../eslint-plugin-itall-react)의 README 참고.

## 점수 산정

upstream 점수 계산 로직을 그대로 사용한다(`packages/core`). 사이드카 plugin 진단도 동일 파이프라인을 통해 카테고리별로 가중치가 매겨져 단일 점수에 반영된다.

## upstream으로의 기여

upstream 본가에 기여하려면 [millionco/react-doctor](https://github.com/millionco/react-doctor)에 PR을 열어야 한다. 이 fork는 사내 정책·룰을 위한 거고, 일반적으로 적용 가능한 개선은 upstream에 PR을 보내는 게 맞다.

## 라이선스

MIT — upstream과 동일. [LICENSE](../../LICENSE) 참고.
