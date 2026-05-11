# macOS 에이전트 Homebrew 배포 방식

셀프-사인된 macOS 동반 앱(에이전트)을 Apple 공증 없이 사용자에게 안정적으로 전달하기 위한 배포 패턴. `airplay-touch`, `audiocast`, `audiocast-driver` 가 이 방식을 공유한다.

## 큰 그림

```
[로컬 빌드]                [GitHub: jobtools/homebrew-tap]              [사용자 머신]
release-mac                  ├─ releases/<slug>-v<ver>/<App>-<ver>.zip   brew tap jobtools/tap
  ├─ build .app             │     └─ asset = self-signed .app.zip       brew install --cask <slug>
  ├─ pack ditto-zip         │                                            └─ postflight: xattr 제거
  ├─ gh release create  ────┤
  └─ commit Casks/<slug>.rb ─┘
                              │ push 트리거
                              ▼
                      .github/workflows/mirror-<slug>.yml
                              │ verbatim 복사
                              ▼
                  [GitHub: jobtools/homebrew-<slug>] (legacy tap)
```

## 단일 진실 소스: `VERSION` 파일

레포 루트에 한 줄짜리 `VERSION` 파일.

```
1.1.25+30
```

- 형식: `<semver>+<build>` (semver 는 `X.Y.Z`, build 는 정수)
- 모든 플랫폼(macOS / Android)이 이 파일을 읽어 자기 manifest 에 반영
- 직접 편집하지 말고 `bump-version` 스크립트만 사용

### `bump-version` 스크립트

VERSION 파일만 다루는 단일 책임 스크립트. 변경되면 자체적으로 커밋한다.

| 명령 | 효과 |
|------|------|
| `./bump-version` | 현재 버전 출력만 |
| `./bump-version 1.2.0` | semver 명시적 지정, build +1 |
| `./bump-version --bump` | 마지막 semver 세그먼트 +1, build +1 |
| `./bump-version --build-only` | semver 유지, build 만 +1 (슬러그/스크립트 변경 등 코드 변경 없을 때) |

## 디렉터리 / 파일 컨벤션

레포 루트 기준:

```
VERSION                    # 1.1.25+30
bump-version               # VERSION 갱신 + 커밋
release                    # 오케스트레이터 (mac + android)
release-mac                # macOS 전용 배포
release-android            # Android 전용 배포
macos_companion/
  ├─ AirPlayTouchCompanion/Info.plist
  ├─ build.sh              # Swift Package 빌드 + codesign
  └─ build/<App Name>.app  # 빌드 산출물
```

## `release-mac` 가 하는 일

```
1. (옵션) ./bump-version --bump          # --no-bump 면 건너뜀
2. VERSION 읽어서 Info.plist 갱신:
     CFBundleShortVersionString = <semver>
     CFBundleVersion            = <build>
   변경 있을 때만 커밋 ("Bump macOS to v<semver> (build <build>)")
3. 빌드: (cd macos_companion && bash build.sh)
4. 패킹: ditto -c -k --keepParent --sequesterRsrc \
            "<App>.app" "<App>-<ver>.zip"
5. sha256 계산
6. gh release create <slug>-v<ver> --repo jobtools/homebrew-tap \
        --title "macOS <ver>" --notes "..." <zip>
   (이미 존재하면 gh release upload --clobber + edit --draft=false)
7. homebrew-tap 클론 → Casks/<slug>.rb 작성 → 커밋 → push
```

이미 release 가 만들어진 뒤에 cask 파일이 푸시되기 때문에, mirror 워크플로가 fire 됐을 때 cask 의 URL 은 항상 유효하다.

## 슬러그 / 태그 / 파일명 컨벤션

`jobtools/homebrew-tap` 은 여러 앱을 호스팅하는 멀티-캐스크 tap. 충돌을 피하려면 **앱 슬러그 prefix** 가 필수.

| 항목 | 컨벤션 | 예시 |
|------|--------|------|
| Cask 이름 | `<slug>` | `airplay-touch`, `audiocast` |
| 릴리스 태그 | `<slug>-v<semver>` | `airplay-touch-v1.1.25` |
| zip 파일명 | `<App-Display-Name>-<semver>.zip` | `AirPlay-Touch-1.1.25.zip` |
| cask 파일 | `Casks/<slug>.rb` | `Casks/airplay-touch.rb` |
| Mirror 워크플로 | `.github/workflows/mirror-<slug>.yml` | `mirror-airplay-touch.yml` |

⚠️ **하지 말 것**: generic 한 `mac-v*` 태그. 다른 macOS 앱과 슬롯이 충돌한다 (airplay-touch 가 처음에 이걸 쓰다가 audiocast 합류 후 `airplay-touch-v*` 로 이전한 이력 있음).

## Cask 파일 템플릿

`release-mac` 이 heredoc 으로 생성하는 `Casks/<slug>.rb`:

```ruby
cask "<slug>" do
  version "<semver>"
  sha256  "<zip-sha256>"

  url "https://github.com/jobtools/homebrew-tap/releases/download/<slug>-v#{version}/<App-Display-Name>-#{version}.zip"
  name "<App Display Name>"
  desc "<한 줄 설명>"
  homepage "https://github.com/jobtools/homebrew-tap"

  depends_on macos: ">= :sonoma"

  app "<App Display Name>.app"

  uninstall quit: "<bundle id>"

  postflight do
    # Sequoia 가 첫 실행을 거부하지 않도록 quarantine 속성 제거
    [
      "#{staged_path}/<App Display Name>.app",
      "#{appdir}/<App Display Name>.app",
    ].each do |path|
      system_command "/usr/bin/xattr",
                     args: ["-dr", "com.apple.quarantine", path],
                     must_succeed: false
    end
  end

  caveats <<~CAVEATS
    <App> 는 셀프-사인 (Apple 공증 없음).

    설치 시 quarantine 은 자동 제거됨. macOS 가 여전히 거부하면
    System Settings → Privacy & Security → "Open Anyway" 한 번 클릭.
  CAVEATS

  zap trash: [
    "~/Library/Application Support/<App Display Name>",
  ]
end
```

### 왜 셀프-사인 + xattr 제거?

- Apple Developer 공증($99/년) 없이도 사용자가 우클릭 → Open 안 하고 일반 설치 흐름으로 쓸 수 있게 하는 트릭
- Homebrew 가 다운로드한 zip 에는 `com.apple.quarantine` xattr 이 붙는데, postflight 에서 이걸 벗기면 macOS Gatekeeper 가 첫 실행을 허락
- 단, **사용자가 Homebrew 를 거쳐 받았다는 신뢰 체인** 위에서만 합당. 직접 zip URL 을 배포해선 안 됨

## Legacy tap 미러링

오래 전 `jobtools/homebrew-<slug>` 같은 단일 앱 tap 으로 받아간 사용자를 위해, 새 tap (`jobtools/homebrew-tap`) 의 cask 변경을 legacy tap 으로 자동 복제.

### Mirror 워크플로 (`homebrew-tap/.github/workflows/mirror-<slug>.yml`)

```yaml
on:
  push:
    branches: [main]
    paths: ['Casks/<slug>.rb']
  workflow_dispatch:

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { path: source }
      - uses: actions/checkout@v4
        with:
          repository: jobtools/homebrew-<slug>
          path: legacy
          token: ${{ secrets.LEGACY_TAP_PUSH_TOKEN }}
      - working-directory: legacy
        run: |
          mkdir -p Casks
          cp ../source/Casks/<slug>.rb Casks/<slug>.rb
          if git diff --quiet Casks/<slug>.rb; then
            exit 0
          fi
          VERSION=$(sed -nE 's/.*version "([^"]+)".*/\1/p' Casks/<slug>.rb | head -1)
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add Casks/<slug>.rb
          git commit -m "Mirror <slug> v${VERSION:-unknown} from homebrew-tap"
          git push
```

### 필요한 시크릿

`jobtools/homebrew-tap` 레포 시크릿에 다음을 등록:

- `LEGACY_TAP_PUSH_TOKEN` — `jobtools/homebrew-<slug>` 에 `contents: write` 권한이 있는 **fine-grained PAT**

### 미러는 slug-agnostic

워크플로가 cask 파일을 verbatim 복사하므로, 본 레포 `release-mac` 에서 슬러그/URL 만 바꿔도 legacy tap 까지 자동 전파된다. 따로 손댈 일 없음.

## 배포 절차 (체크리스트)

```bash
# 1. 코드/스크립트 변경 커밋
git add ... && git commit -m "..."

# 2. 버전 결정
./bump-version --build-only        # 슬러그/배포 스크립트만 바꿨을 때
./bump-version --bump              # 기능/버그픽스 동반

# 3. 빌드 + 배포 (mac 만)
./release-mac --no-bump

#    혹은 전체 (mac + android)
./release                          # 내부적으로 bump-version --bump 호출하므로 2번 건너뜀
```

릴리스 후 확인:

```bash
gh release view <slug>-v<ver> --repo jobtools/homebrew-tap
gh run list --repo jobtools/homebrew-tap --workflow mirror-<slug>.yml --limit 1
```

## 사용자 설치 / 업그레이드

```bash
brew tap jobtools/tap
brew install --cask <slug>

# 업그레이드
brew upgrade --cask <slug>
```

기존에 legacy tap 으로 받은 사용자도 `brew upgrade` 한 번이면 자동으로 새 URL 의 zip 을 받는다 (mirror 가 cask 를 동기화해 두었으므로).

## 새 macOS 앱을 이 tap 에 추가하는 절차

1. 앱 레포에 `VERSION`, `bump-version`, `release-mac`, `macos_companion/build.sh` 를 본 패턴대로 만든다 (`airplay-touch` 의 것을 복사해서 슬러그만 바꾸면 됨)
2. `release-mac` 의 컨벤션 4개 (cask 이름, 태그 prefix, zip 이름, cask 내 URL) 가 모두 같은 슬러그를 쓰는지 검사
3. `jobtools/homebrew-tap` 에:
   - `Casks/<new-slug>.rb` (최초 1회는 첫 release 가 자동 생성)
   - `.github/workflows/mirror-<new-slug>.yml` (legacy tap 운영하는 경우만)
4. (legacy tap 필요한 경우) `jobtools/homebrew-<new-slug>` 레포 생성 + PAT 발급 + tap 레포 시크릿 등록
5. 첫 `./release-mac` 실행

## 함정과 교훈

- **Generic 태그는 금지**. `mac-v*` 처럼 슬러그 없는 태그는 한 tap 에 두 번째 앱이 들어오는 순간 폭발. 처음부터 `<slug>-v*` 로 시작.
- **순서 중요**: cask 푸시 전에 release 가 존재해야 한다. `release-mac` 은 이 순서를 지키지만 직접 수정할 때 헷갈리지 말 것.
- **VERSION 단일 소스**. Info.plist 의 두 키는 빌드 직전에 VERSION 으로부터 덮어쓴다 — 절대 수동 편집하지 말 것 (커밋 충돌의 원인이 되었음).
- **Sequester rsrc 옵션**. `ditto -c -k --keepParent --sequesterRsrc` 가 핵심. Finder 의 압축이나 zip 명령은 macOS 메타데이터를 잃을 수 있어 cask 가 못 푼다.
- **xattr 제거는 사용자 신뢰의 대가**. brew 가 sha256 으로 무결성을 보장한다는 가정 하에서만 정당. 다른 채널로 zip 뿌리지 말 것.
- **build 카운터는 단조 증가**. App Store / 다른 스토어와 공유될 수 있으므로 `--build-only` 라도 항상 +1.

## 참고 위치

- 코드: `~/work/airplay_touch/{release,release-mac,bump-version,VERSION}`, `~/work/audiocast/{release,release-mac,...}`
- Tap 레포: <https://github.com/jobtools/homebrew-tap>
- Legacy tap (airplay-touch): <https://github.com/jobtools/homebrew-airplay-touch>
