# `bump-version` 스크립트 + `VERSION` 파일 설계

다중 플랫폼 (macOS / Android / iOS / 그 외) 으로 같은 앱을 배포할 때 버전 번호를 **한 곳**에서 관리하기 위한 패턴.

연관 문서: [macos-brew-deploy.md](./macos-brew-deploy.md) (이 패턴 위에 올라가는 macOS Homebrew 배포)

---

## VERSION 단일 소스

레포 루트에 한 줄짜리 `VERSION` 파일.

```
1.2.3+45
```

- 형식: `<semver>+<build>` (semver 는 `X.Y.Z`, build 는 정수)
- **모든 플랫폼**이 이 파일을 읽어 자기 manifest 에 반영
- 직접 편집하지 말고 `bump-version` 스크립트만 사용

### 왜 build counter 를 VERSION 에 포함하는가

흔한 대안은 매 빌드마다 plist / gradle 에서 build counter 를 max()+1 같은 식으로 동적 산출하는 것. 이 방식은:

- 빌드 환경마다(CI vs 로컬, 워크트리 여러 개) 카운터가 어긋남
- VERSION 파일과 매니페스트가 따로 노는 stale state 가능

`<semver>+<build>` 형식으로 VERSION 한 곳에 못박으면 진실 소스가 일원화된다. 매니페스트는 빌드 직전에 VERSION 으로부터 **덮어쓰기** 되므로 어긋날 수 없음.

---

## 핵심 원칙: 책임 분리

| 책임 | 담당 |
|------|------|
| 버전 숫자 결정 (VERSION 파일 갱신) | `bump-version` |
| 플랫폼 manifest 에 propagate | 각 `release-<platform>` (빌드 직전) |
| VERSION 변경 commit | `bump-version` 자체 |
| Manifest 변경 commit | 각 `release-<platform>` |
| 오케스트레이션 (mac+android 순차 실행) | `release` |

이 분리가 핵심인 이유:

- `bump-version` 이 plist / gradle 까지 손대면 빌드 안 하는 플랫폼의 manifest 도 매번 흔들림
- manifest propagate 가 빌드 **직전**에 일어나므로 stale manifest 가 VERSION 과 어긋날 수 없음
- 오케스트레이터가 `git add -A` 로 통째로 커밋하지 않으므로 의도하지 않은 파일이 묻어 들어가지 않음

---

## 모드

| 명령 | 동작 |
|------|------|
| `./bump-version` | 현재 버전 출력만 (no-op) |
| `./bump-version 1.2.0` | semver 명시적 지정, build +1 |
| `./bump-version --bump` | 마지막 semver 세그먼트 +1, build +1 |
| `./bump-version --build-only` | semver 유지, build 만 +1 |
| `./bump-version -h` / `--help` | 헤더 주석 출력 |

`--build-only` 용도: 슬러그 / 배포 스크립트만 바꿨거나 cask 만 다시 만들어야 할 때. 사용자가 받는 앱 동작은 동일하므로 semver 를 올리는 건 의미 과잉.

---

## Self-commit

VERSION 이 실제로 변했을 때만 `Bump version to X.Y.Z+N` 메시지로 자체 커밋. 변경 없으면 무 commit. 오케스트레이터가 `git add -A` 같은 광범위 커밋을 할 필요가 없어 안전.

---

## SemVer 검증

`^[0-9]+\.[0-9]+\.[0-9]+$` regex 로 검사. 비-SemVer 입력은 거부.

---

## 동작 의사코드

```bash
# 입력: VERSION 한 줄 "<semver>+<build>"
# 분해: SEMVER, BUILD ('+' 없으면 BUILD=0 으로 시작)

case "$1" in
    "")             # no-op
    --bump)         # semver last++; build++
    --build-only)   # build++ (semver 유지)
    -h|--help)      # 헤더 주석 출력
    *)              # explicit semver; build++
esac

# regex 검증 (semver, build 둘 다)
echo "${SEMVER}+${BUILD}" > VERSION

# git diff 가 변경 감지하면 자체 commit
```

---

## 추후 개선 후보

스크립트 안에서 끝나는 개선만 (release-* 나 git tag 같은 외부 책임 제외).

### 1. atomic write 🔴

현재 `echo "$X" > VERSION_FILE` 직접 redirect. 디스크 가득 차거나 SIGINT 들어오면 VERSION 이 빈/잘린 상태로 남을 수 있음.

```bash
TMP="$(mktemp "${VERSION_FILE}.XXXXXX")"
echo "${SEMVER}+${BUILD}" > "$TMP"
mv "$TMP" "$VERSION_FILE"
```

### 2. semver 단위 별 bump 🟡

현재 `--bump` 는 patch 만 올림. minor / major 올릴 때 사용자가 직접 `./bump-version 2.0.0` 입력 → 타이핑 실수 위험.

```bash
--bump | --bump-patch)  PARTS[2]=$((PARTS[2]+1)) ;;
--bump-minor)           PARTS[2]=0; PARTS[1]=$((PARTS[1]+1)) ;;
--bump-major)           PARTS[2]=0; PARTS[1]=0; PARTS[0]=$((PARTS[0]+1)) ;;
```

### 3. no-op 명시 감지 🟡

`./bump-version 1.2.3` 시 현재 VERSION 도 `1.2.3+N` 이면 현재 동작은 build+=1. 의도가 "버전 그대로 유지" 인 경우가 많음.

```bash
if [[ "$1" == "$SEMVER" ]]; then
    echo ">> Already at $SEMVER. Use --build-only to bump build only." >&2
    exit 0
fi
```

### 4. `--set <semver>+<build>` 🟢

핫픽스 backport / 수동 정정 시 build 까지 통째로 지정.

```bash
--set)
    LINE="$2"
    SEMVER="${LINE%%+*}"
    BUILD="${LINE#*+}"
    shift
    ;;
```

### 5. `--print` / `--json` 🟢

CI / 다른 스크립트가 현재 버전 파싱.

```bash
--print)  echo "${SEMVER}+${BUILD}"; exit 0 ;;
--json)   printf '{"semver":"%s","build":%s}\n' "$SEMVER" "$BUILD"; exit 0 ;;
```

### 6. `--dry-run` 🟢

VERSION 에 쓰지도, commit 도 안 하고 결과만 표시.

### 7. CI 빌드 번호 override 🟢

GitHub Actions `GITHUB_RUN_NUMBER` 같은 monotonic 카운터를 build 로 쓰면 머신 간 충돌 자연 해소.

```bash
BUILD="${CI_BUILD_NUMBER:-$BUILD}"
```

### 우선순위

| 등급 | 항목 | 이유 |
|------|------|------|
| 🔴 | 1 atomic write | 한 번 corrupt 되면 손 복구 필요, 비용 거의 없음 |
| 🟡 | 2 semver 단위 bump, 3 no-op 감지 | 자주 쓰는 흐름, 의도 vs 결과 불일치 줄임 |
| 🟢 | 4–7 | 편의 / 자동화 |

---

## 함정과 교훈

- **VERSION 단일 소스 원칙 깨지 말 것**. plist / gradle 의 두 키는 빌드 직전에 VERSION 으로부터 덮어쓴다 — 절대 수동 편집 금지 (커밋 충돌의 원인).
- **bump-version 은 VERSION 만 만진다**. plist / gradle 까지 손대게 만들면 빌드 안 한 플랫폼의 manifest 가 매번 흔들림. 매니페스트 propagate 는 각 release-* 의 책임.
- **build 카운터는 단조 증가**. App Store / 다른 스토어와 공유될 수 있으므로 `--build-only` 라도 항상 +1.

---

## 참고 위치

- 패턴 적용 레포: `~/work/airplay_touch`, `~/work/audiocast`, `~/work/audiocast-driver`
- 주요 스크립트: `{bump-version, release, release-mac, release-android, VERSION}`
