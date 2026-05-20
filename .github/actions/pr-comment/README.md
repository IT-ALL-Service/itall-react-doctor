# `itall/react-doctor PR comment` action

PR마다 `@it-all-service/react-doctor` 진단을 sticky 코멘트로 달아주는 composite action. upstream `millionco/react-doctor`의 `action.yml`을 fork에 맞춰 재구성 — GitHub Packages 인증 단계 추가 + 코멘트 마커 namespace 분리.

## 사용 (사내 컨슈머 프로젝트)

```yaml
# consumer-repo/.github/workflows/react-doctor.yml
name: React Doctor

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  packages: read # @it-all-service/react-doctor 설치용
  pull-requests: write # sticky 코멘트 작성용

jobs:
  react-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # diff 모드에서 base 브랜치 비교에 필요

      - uses: IT-ALL-Service/itall-react-doctor/.github/actions/pr-comment@v0.5.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          diff: main
          fail-on: error
          react-doctor-version: 0.5.0 # 운영에선 명시 권장
```

## 입력값

| 입력                   | 기본값     | 설명                                                                              |
| ---------------------- | ---------- | --------------------------------------------------------------------------------- |
| `github-token`         | (required) | `secrets.GITHUB_TOKEN`. 패키지 install + PR 코멘트 양쪽에 사용                    |
| `directory`            | `.`        | 스캔 대상 디렉토리                                                                |
| `project`              | (없음)     | 모노레포에서 특정 워크스페이스만 지정 (콤마 구분)                                 |
| `diff`                 | (없음)     | base 브랜치 지정 시 변경 파일만 스캔                                              |
| `fail-on`              | `error`    | `error` / `warning` / `none`                                                      |
| `annotations`          | `false`    | GitHub Actions 인라인 어노테이션 출력 — Files changed 뷰에 같이 표시하려면 `true` |
| `offline`              | `true`     | react.doctor 외부 API 호출 차단 (사내 사용은 항상 true 권장)                      |
| `react-doctor-version` | `latest`   | `@it-all-service/react-doctor` 버전. 운영에선 `0.5.0` 같은 명시 권장              |
| `node-version`         | `22`       | Node.js 버전                                                                      |

## 출력값

| 출력    | 설명                                                         |
| ------- | ------------------------------------------------------------ |
| `score` | `react-doctor --score` 결과 (0-100). 후속 step에서 사용 가능 |

## sticky 코멘트 동작

- 코멘트 본문 첫 줄에 `<!-- itall-react-doctor -->` HTML 주석 마커 박힘
- 같은 PR에서 워크플로 재실행 시 기존 코멘트가 있으면 **update**, 없으면 **create**
- upstream `react-doctor` action도 같은 PR에 코멘트를 달 수 있도록 마커 namespace를 분리 (`itall-` 접두사)

## 동작 흐름

1. `actions/setup-node` — Node 설치 + `@it-all-service` scope 등록
2. `~/.npmrc`에 `@it-all-service:registry=https://npm.pkg.github.com` + token 기입
3. `npx -y "@it-all-service/react-doctor@<version>" ... --pr-comment --fail-on <level>` 실행
4. 출력을 `RAW_FILE`에 저장, annotation workflow command (`::error::`, `::warning::`) 라인 제거
5. `--score` 별도 실행으로 `outputs.score` 채움
6. `actions/github-script`로 sticky 코멘트 update-or-create

## 제약

- 사내 컨슈머는 IT-ALL-Service organization 안에 있어야 `secrets.GITHUB_TOKEN`이 패키지 read 권한 자동 보유
- 외부 organization에서 쓰려면 organization 권한 PAT(`packages:read`)을 별도 secret으로 전달해야 함
- diff 모드 사용 시 `actions/checkout@v5`에 `fetch-depth: 0` 필수

## 측정 (TODO)

진단·disable 코멘트 비율을 누적해 false positive 데이터를 모으는 별도 스크립트는 `docs/sidecar-eslint-plugin-plan.md` §운영-측정 백로그 참고.
