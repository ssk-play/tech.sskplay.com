---
---
# `bump-version` 스크립트 + `VERSION` 파일 설계

다중 플랫폼 (macOS / Android / iOS / 그 외) 으로 같은 앱을 배포할 때 **semver 만** 한 곳에서 관리하기 위한 패턴. 빌드 카운터는 플랫폼마다 독립.

연관 문서: [macos-brew-deploy.md](./macos-brew-deploy.md) (이 패턴 위에 올라가는 macOS Homebrew 배포)

---

## VERSION 단일 소스 (semver)

레포 루트에 한 줄짜리 `VERSION` 파일.

```
1.2.3
```

- 형식: `<semver>` = `X.Y.Z` (SemVer)
- **모든 플랫폼**이 이 파일에서 semver 를 읽어 자기 manifest 에 반영
- 직접 편집하지 말고 `bump-version` 스크립트만 사용

### 빌드 카운터는 VERSION 에 두지 않는다

빌드 카운터는 **플랫폼별 매니페스트가 권위 소스**:

| 플랫폼 | 빌드 카운터 위치 |
|--------|------------------|
| macOS  | `Info.plist` → `CFBundleVersion` |
| iOS    | `Info.plist` → `CFBundleVersion` |
| Android | `build.gradle(.kts)` → `versionCode` |

이유:

- **플랫폼 독립 release** 가능. macOS 만 핫픽스 재배포해도 Android build 카운터를 건드릴 필요 없음.
- 각 스토어 (App Store / Play Store / Homebrew) 가 요구하는 **단조 증가 규약**과 자연 부합. 한쪽 플랫폼만 build 가 앞서 가도 무관.
- 공유 카운터로 묶어 두면 lockstep 강제 → 한 플랫폼 빌드 실패 / 잠시 보류 시에도 다른 쪽 카운터가 빈다.
- 빌드 카운터가 매니페스트와 같은 파일에 있으니 stale state 가 구조적으로 없음.

### Semver 만 단일 소스인 이유

빌드는 독립이어도 semver 는 "이 코드가 표현하는 사용자 가시 버전" 이라 모든 플랫폼이 같아야 한다. semver 가 어긋나면 같은 코드가 플랫폼별로 다른 "버전" 으로 출시되어 사용자 혼란.

---

## 핵심 원칙: 책임 분리

| 책임 | 담당 |
|------|------|
| Semver 결정 (VERSION 파일 갱신) | `bump-version` |
| Semver → 플랫폼 manifest 로 propagate | 각 `release-<platform>` (빌드 직전) |
| 플랫폼 build 카운터 +1 | 각 `release-<platform>` (빌드 직전) |
| VERSION 변경 commit | `bump-version` 자체 |
| Manifest 변경 commit (semver + build 동시) | 각 `release-<platform>` |
| 오케스트레이션 (mac+android 순차 실행) | `release` |

이 분리가 핵심인 이유:

- `bump-version` 이 plist / gradle 까지 손대면 빌드 안 하는 플랫폼의 manifest 도 매번 흔들림
- propagate 가 빌드 **직전**에 일어나므로 stale manifest 가 VERSION 과 어긋날 수 없음
- 오케스트레이터가 `git add -A` 로 통째로 커밋하지 않으므로 의도하지 않은 파일이 묻어 들어가지 않음
- build 카운터가 플랫폼 매니페스트 안에 있으므로 `release-<platform>` 이 자기 manifest 만 보면 됨 (cross-platform coupling 0)

---

## 모드

| 명령 | 동작 |
|------|------|
| `./bump-version` | 현재 semver 출력만 (no-op) |
| `./bump-version 1.2.0` | semver 명시적 지정 |
| `./bump-version --bump` | 마지막 semver 세그먼트 +1 (patch bump) |
| `./bump-version -h` / `--help` | 헤더 주석 출력 |

이전 디자인의 `--build-only` 는 더 이상 필요 없음. 빌드 카운터 +1 은 각 `release-<platform>` 의 책임. 슬러그 / 배포 스크립트만 바꿔서 동일 semver 로 재배포할 때도 그냥 `./release-<platform>` 만 다시 돌리면 됨.

---

## Self-commit

VERSION 이 실제로 변했을 때만 `Bump version to X.Y.Z` 메시지로 자체 커밋. 변경 없으면 무 commit. 오케스트레이터가 `git add -A` 같은 광범위 커밋을 할 필요가 없어 안전.

---

## SemVer 검증

`^[0-9]+\.[0-9]+\.[0-9]+$` regex 로 검사. 비-SemVer 입력은 거부.

---

## 동작 의사코드

```bash
# 입력: VERSION 한 줄 "<semver>"
SEMVER="$(tr -d '[:space:]' < VERSION)"

case "$1" in
    "")             # no-op (print only)
    --bump)         # semver last segment ++
    -h|--help)      # 헤더 주석 출력
    *)              # explicit semver
esac

# regex 검증
echo "$SEMVER" > VERSION

# git diff 가 변경 감지하면 자체 commit "Bump version to $SEMVER"
```

---

## `release-<platform>` 와의 계약

`bump-version` 이 VERSION 한 곳에 semver 만 보장하는 대신, 각 `release-<platform>` 스크립트는 **빌드 직전**에 다음을 책임진다:

1. VERSION 에서 semver 를 읽어 자기 매니페스트의 사용자 가시 필드에 propagate (예: `CFBundleShortVersionString`, gradle `versionName`)
2. 자기 매니페스트의 빌드 카운터 필드를 +1 (예: `CFBundleVersion`, gradle `versionCode`)
3. 매니페스트가 실제로 변했을 때만 commit (`Bump <platform> to v<semver> (build <N>)`)

구현 코드는 각 플랫폼 배포 문서 참고 (macOS → [macos-brew-deploy.md](./macos-brew-deploy.md)).

---

## 추후 개선 후보

스크립트 안에서 끝나는 개선만 (release-* 나 git tag 같은 외부 책임 제외).

### 1. atomic write 🔴

현재 `echo "$X" > VERSION_FILE` 직접 redirect. 디스크 가득 차거나 SIGINT 들어오면 VERSION 이 빈/잘린 상태로 남을 수 있음.

```bash
TMP="$(mktemp "${VERSION_FILE}.XXXXXX")"
echo "$SEMVER" > "$TMP"
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

`./bump-version 1.2.3` 시 현재 VERSION 도 `1.2.3` 이면 변경 없음 → 그냥 print only. 메시지로 명시.

```bash
if [[ "$1" == "$SEMVER" ]]; then
    echo ">> Already at $SEMVER (no change)." >&2
    exit 0
fi
```

### 4. `--print` / `--json` 🟢

CI / 다른 스크립트가 현재 semver 파싱.

```bash
--print)  echo "$SEMVER"; exit 0 ;;
--json)   printf '{"semver":"%s"}\n' "$SEMVER"; exit 0 ;;
```

### 5. `--dry-run` 🟢

VERSION 에 쓰지도, commit 도 안 하고 결과만 표시.

### 우선순위

| 등급 | 항목 | 이유 |
|------|------|------|
| 🔴 | 1 atomic write | 한 번 corrupt 되면 손 복구 필요, 비용 거의 없음 |
| 🟡 | 2 semver 단위 bump, 3 no-op 감지 | 자주 쓰는 흐름, 의도 vs 결과 불일치 줄임 |
| 🟢 | 4 print/json, 5 dry-run | 편의 / 자동화 |

---

## 함정과 교훈

- **VERSION 은 semver 만**. build 도 한 곳에 모으려 하지 말 것 (플랫폼 lockstep 강제 → 핫픽스 못 함).
- **build 카운터는 매니페스트 안에서 단조 증가**. 각 `release-<platform>` 이 +1 만 책임. 절대 reset / 수동 편집 금지 (App Store / Play Store 가 거부).
- **bump-version 은 VERSION 만 만진다**. plist / gradle 까지 손대게 만들면 빌드 안 한 플랫폼의 manifest 가 매번 흔들림. 매니페스트 propagate 는 각 release-* 의 책임.
- **Semver 동기화**. 한 코드가 표현하는 버전은 플랫폼 공통이어야 함 — VERSION 한 곳에서 읽어 모든 플랫폼이 같은 값을 쓰는 이유.

---

## 참고 위치

- 패턴 적용 레포: `~/work/airplay_touch`, `~/work/audiocast`, `~/work/audiocast-driver`
- 주요 스크립트: `{bump-version, release, release-mac, release-android, VERSION}`
