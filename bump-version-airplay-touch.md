# bump-version 설계 비교: airplay-touch vs audiocast

조사일: 2026-05-07
대상:
- `~/work/airplay_touch/bump-version` (개선판)
- `~/work/audiocast/bump-version` (현행)

## 결론 요약

airplay-touch 의 bump-version 이 다음 4가지 면에서 더 깔끔함:

1. VERSION 포맷에 build counter 포함 (`<semver>+<build>`)
2. 책임 분리: bump-version 은 VERSION만 수정, 매니페스트 propagate 는 release-* 책임
3. `--build-only` 모드로 semver 동결 hot-release 지원
4. VERSION 변경 시 자체 commit (orchestrator 의 `git add -A` 보다 안전)

---

## 1. VERSION 포맷

```
audiocast       VERSION:  1.1.19          ← semver only
airplay-touch   VERSION:  1.1.25+29       ← semver + build counter
```

audiocast 는 빌드 카운터를 매번 plist/gradle 의 max() 로 재계산.
airplay-touch 는 VERSION 한 곳에 못박아 진실 소스 일원화.

## 2. 책임 분리 (핵심 차이)

| 항목 | audiocast (현재) | airplay-touch |
|---|---|---|
| `bump-version` | VERSION + plist + build.gradle.kts 모두 수정 | **VERSION 파일만** 수정 |
| `release-mac` | VERSION 만 읽음 | VERSION 읽고 → plist 에 propagate → 빌드 |
| `release-android` | gradle 직접 수정 안 함 | VERSION 읽고 → gradle propagate → 빌드 (fastlane) |

airplay-touch 에서는 `bump-version` 은 "버전 숫자 결정" 만 담당.
매니페스트 적용은 빌드 직전 각 release-* 가 수행 → stale plist 가 VERSION 과
어긋날 수 없음.

## 3. 모드 비교

| 모드 | airplay-touch | audiocast |
|---|---|---|
| 인자 없음 | print only (no-op) | propagate (매니페스트에 다시 쓰기) |
| `<x.y.z>` | semver 변경 + build+=1 | semver 변경 + propagate |
| `--bump` | last segment + build+=1 | last segment + propagate |
| **`--build-only`** | **build 만 +=1 (semver 유지)** | (없음) |
| `-h/--help` | 헤더 주석 → sed 로 추출 | 동일 패턴 있음 |

`--build-only`: semver 안 바꾸고 build 만 올리는 hot-fix 재배포 시 유용.
예: cask 파일만 다시 빌드해야 하는 경우.

## 4. Self-commit

- airplay-touch: VERSION 변경 시 `Bump version to X.Y.Z+N` 자동 commit
  (변경 없으면 무commit)
- audiocast: bump-version 자체는 commit 안 함, `release` orchestrator 가
  `git add -A` 로 커밋 → 의도하지 않은 파일이 같이 커밋될 위험

## 5. SemVer 검증

양쪽 동일 (`^[0-9]+\.[0-9]+\.[0-9]+$` regex)

---

## 참고: airplay-touch bump-version 전체 동작

```bash
# 입력: VERSION 파일 → 한 줄 "<semver>+<build>"
# 분해: SEMVER, BUILD 따로 추출 ('+' 없으면 BUILD=0 으로 시작)

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

## 채택 시 audiocast 변경 단위 (제안)

각각 단위 커밋:

1. VERSION 포맷 `1.1.19` → `1.1.19+23` 으로 마이그레이션 + bump-version
   에서 build counter 분해/조합 로직 추가
2. bump-version 에서 plist/gradle 직접 수정 부분 제거 (VERSION 만 수정)
3. release-mac, release-android 에 VERSION 읽어 매니페스트 propagate
   하는 단계 추가
4. `--build-only` 모드 추가
5. bump-version self-commit 추가, `release` orchestrator 의 `git add -A`
   제거

---

# bump-version 자체에 더 추가할 만한 것

airplay-touch 에도 없는, bump-version 스크립트 안에서 끝나는 개선안만.
release-* 나 git-tag 같은 외부 책임은 제외.

## 1. atomic write

현재 양쪽 모두 `echo "$X" > VERSION_FILE` 직접 redirect. 디스크가 가득
차거나 SIGINT 가 들어오면 VERSION 이 빈/잘린 상태로 남을 수 있음.
임시 파일 → mv 로 원자성 확보.

```bash
TMP="$(mktemp "${VERSION_FILE}.XXXXXX")"
echo "${SEMVER}+${BUILD}" > "$TMP"
mv "$TMP" "$VERSION_FILE"
```

## 2. semver 단위 별 bump

현재 `--bump` 는 last segment (= patch) 만 올림. major/minor 올릴 때
사용자가 직접 `./bump-version 2.0.0` 식으로 입력해야 함. 의미적으로
타이핑 실수 위험.

```bash
--bump | --bump-patch)  PARTS[2]=$((PARTS[2]+1)) ;;
--bump-minor)           PARTS[2]=0; PARTS[1]=$((PARTS[1]+1)) ;;
--bump-major)           PARTS[2]=0; PARTS[1]=0; PARTS[0]=$((PARTS[0]+1)) ;;
```

## 3. `--set <semver>+<build>` 명시 모드

핫픽스 backport / 수동 정정 시 build 까지 통째로 지정하고 싶을 때.
현재는 build 가 항상 +=1 되어 임의 값 셋팅 불가.

```bash
--set)
    LINE="$2"
    SEMVER="${LINE%%+*}"
    BUILD="${LINE#*+}"
    shift
    ;;
```

## 4. `--print` / `--json` 출력 모드

CI / 다른 스크립트가 현재 버전을 파싱해 쓰려면 표준 형식이 필요.
현재 인자 없이 호출하면 print 같은 동작이지만 명시 플래그가 깔끔.

```bash
--print)  echo "${SEMVER}+${BUILD}"; exit 0 ;;
--json)   printf '{"semver":"%s","build":%s}\n' "$SEMVER" "$BUILD"; exit 0 ;;
```

## 5. `--dry-run`

VERSION 에 쓰지도, commit 도 안 하고 "이렇게 될 것" 만 표시.
처음 쓰거나 무서울 때.

```bash
DRY=0; [[ "${1:-}" == "--dry-run" ]] && { DRY=1; shift; }
...
if [[ $DRY -eq 1 ]]; then
    echo "DRY: would write ${SEMVER}+${BUILD}"
    exit 0
fi
```

## 6. no-op 명시 감지

`./bump-version 1.1.19` 호출 시 현재 VERSION 도 `1.1.19+29` 라면
airplay-touch 동작은 build+=1 → `1.1.19+30`. 사용자가 의도한 건
"버전 그대로 유지" 인 경우가 많음. 같은 semver 인지 검사하고 메시지.

```bash
if [[ "$1" == "$SEMVER" ]]; then
    echo ">> Already at $SEMVER. Use --build-only to bump build only." >&2
    exit 0
fi
```

## 7. CI 빌드 번호 override

GitHub Actions 등에서 `GITHUB_RUN_NUMBER` 같은 monotonic 카운터를
build 로 쓰면 머신 간 충돌이 자연 해소. env 가 있으면 우선.

```bash
BUILD="${CI_BUILD_NUMBER:-$BUILD}"
```

## 우선순위

| 등급 | 항목 | 이유 |
|---|---|---|
| 🔴 | 1 atomic write | 한 번 corrupt 되면 손으로 복구해야 함, 비용 거의 없음 |
| 🟡 | 2 semver 단위 bump | 자주 쓰는 흐름, 타이핑 실수 줄임 |
| 🟡 | 6 no-op 감지 | 의도와 결과가 다를 수 있는 흔한 실수 |
| 🟢 | 3 `--set`, 4 print/json, 5 dry-run, 7 CI override | 편의·자동화 |
