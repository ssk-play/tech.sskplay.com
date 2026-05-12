---
---
# macOS 에이전트 Homebrew 배포 패턴

셀프-사인된 macOS 동반 앱(에이전트)을 Apple 공증 없이 사용자에게 안정적으로 전달하기 위한 배포 패턴 정리. 현재 `airplay-touch`, `audiocast`, `audiocast-driver` 가 이 패턴을 공유한다.

## 큰 그림

```
[로컬 빌드]                [GitHub: <org>/homebrew-tap]                 [사용자 머신]
release-mac                  ├─ releases/<slug>-v<ver>/<App>-<ver>.zip   brew tap <org>/tap
  ├─ build .app             │     └─ asset = self-signed .app.zip       brew install --cask <slug>
  ├─ pack ditto-zip         │                                            └─ postflight: xattr 제거
  ├─ gh release create  ────┤
  └─ commit Casks/<slug>.rb ─┘
                              │ push 트리거
                              ▼
                      .github/workflows/mirror-<slug>.yml
                              │ verbatim 복사
                              ▼
                   [GitHub: <org>/homebrew-<slug>] (legacy tap)
```

## 디렉터리 / 파일 컨벤션

앱 레포 기준:

```
VERSION                      # 버전 소스   → bump-version.md
bump-version                 # 버전 갱신   → bump-version.md
release                      # 오케스트레이터 (mac + android)
release-mac                  # macOS 전용 배포  ← 이 문서의 주제
release-android              # Android 전용 배포 (해당 시)
macos_companion/             # 또는 mac/, macos/ 등
  ├─ <Target>/Info.plist
  ├─ build.sh                # Swift Package 빌드 + codesign
  └─ build/<App Name>.app    # 빌드 산출물
```

> 버전 관리(`VERSION` / `bump-version`)는 별도 문서로 분리 → [bump-version.md](./bump-version.md). 이 문서는 이미 결정된 semver 를 어떻게 빌드 / 배포하는지에만 집중한다.

---

## `release-mac` 단계별 동작

```
1. 버전 결정 (옵션) — bump-version 호출, --no-bump 로 건너뛰기 가능
2. semver → Info.plist propagate + build 카운터 +1, 변경 있을 때만 커밋
     CFBundleShortVersionString = <semver>
     CFBundleVersion            = <prev build> + 1
3. 빌드: (cd <mac-dir> && bash build.sh)
4. 패킹: ditto -c -k --keepParent --sequesterRsrc \
            "<App>.app" "<App>-<ver>.zip"
5. sha256 계산
6. gh release create <slug>-v<ver> --repo <org>/homebrew-tap \
        --title "macOS <ver>" --notes "..." <zip>
   (이미 존재하면 gh release upload --clobber + edit --draft=false)
7. homebrew-tap 클론 → Casks/<slug>.rb 작성 → 커밋 → push
```

릴리스가 먼저 만들어지고 cask 파일이 나중에 push 되기 때문에, mirror 워크플로가 fire 됐을 때 cask 의 download URL 은 항상 유효하다.

---

> 빌드 단계에서 arm64 + x86_64 양쪽 커버하는 fat binary 만들기는 별도 문서 → [macos-universal-binary.md](./macos-universal-binary.md). `swift build -c release` 만 호출하면 host arch only 라는 함정 + 검증 명령 + deployment target 정합성까지.

---

## 슬러그 / 태그 / 파일명 컨벤션

`<org>/homebrew-tap` 은 여러 앱을 호스팅하는 멀티-캐스크 tap. 충돌을 피하려면 **앱 슬러그 prefix** 가 필수.

| 항목 | 컨벤션 | 예시 |
|------|--------|------|
| Cask 이름 | `<slug>` | `airplay-touch`, `audiocast` |
| 릴리스 태그 | `<slug>-v<semver>` | `airplay-touch-v1.1.25` |
| zip 파일명 | `<App-Display-Name>-<semver>.zip` | `AirPlay-Touch-1.1.25.zip` |
| cask 파일 | `Casks/<slug>.rb` | `Casks/airplay-touch.rb` |
| Mirror 워크플로 | `.github/workflows/mirror-<slug>.yml` | `mirror-airplay-touch.yml` |

⚠️ **하지 말 것**: generic 한 `mac-v*` 태그. 다른 macOS 앱과 슬롯이 충돌한다 (실제로 airplay-touch 가 처음에 `mac-v*` 로 시작했다가 audiocast 합류 후 `airplay-touch-v*` 로 이전해야 했던 이력 있음).

---

## Cask 파일 템플릿

`release-mac` 이 heredoc 으로 생성하는 `Casks/<slug>.rb`:

```ruby
cask "<slug>" do
  version "<semver>"
  sha256  "<zip-sha256>"

  url "https://github.com/<org>/homebrew-tap/releases/download/<slug>-v#{version}/<App-Display-Name>-#{version}.zip"
  name "<App Display Name>"
  desc "<한 줄 설명>"
  homepage "https://github.com/<org>/homebrew-tap"

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
- **사용자가 Homebrew 를 거쳐 받았다는 신뢰 체인** 위에서만 합당. 직접 zip URL 을 따로 배포해서는 안 됨

---

## Legacy tap 미러링 (선택)

옛 single-cask tap (`<org>/homebrew-<slug>`) 으로 이미 받아간 사용자를 위해, 새 멀티-캐스크 tap 의 cask 변경을 legacy tap 으로 자동 복제하는 GitHub Actions 워크플로를 운영할 수 있다. 워크플로 / PAT / 추가 절차 자세히는 → [homebrew-tap-mirror.md](./homebrew-tap-mirror.md)

요약:
- mirror 워크플로는 cask 파일을 verbatim 복사 (slug-agnostic) — 본 레포 `release-mac` 만 잘 바꾸면 자동 전파
- `release-mac` 이 release 부터 만들고 cask 를 마지막에 push 하는 순서이므로 mirror 가 fire 됐을 때 download URL 은 항상 유효

---

## 배포 절차 (체크리스트)

```bash
# 1. 코드/스크립트 변경 커밋
git add ... && git commit -m "..."

# 2. (semver 변경이 필요하면 bump-version.md 참고)

# 3. 빌드 + 배포
./release-mac --no-bump            # semver 그대로 두고 build +1 재배포
./release-mac                      # 동시에 semver bump
./release                          # mac + android 전체
```

릴리스 후 확인:

```bash
gh release view <slug>-v<ver> --repo <org>/homebrew-tap
gh run list --repo <org>/homebrew-tap --workflow mirror-<slug>.yml --limit 1
```

---

## 사용자 설치 / 업그레이드

```bash
brew tap <org>/tap
brew install --cask <slug>

# 업그레이드
brew upgrade --cask <slug>
```

기존에 legacy tap 으로 받은 사용자도 `brew upgrade` 한 번이면 자동으로 새 URL 의 zip 을 받는다 (mirror 가 cask 를 동기화해 두었으므로).

---

## 새 macOS 앱을 이 패턴에 추가하는 절차

1. 앱 레포에 `release-mac`, `<mac-dir>/build.sh` 를 본 패턴대로 만든다 (기존 앱 것을 복사해서 슬러그만 바꾸면 됨). 버전 파이프라인(`VERSION`, `bump-version`) 설정은 [bump-version.md](./bump-version.md) 참고.
2. `release-mac` 의 컨벤션 4개 (cask 이름, 태그 prefix, zip 이름, cask 내 URL) 가 모두 같은 슬러그를 쓰는지 검사
3. `<org>/homebrew-tap` 에:
   - `Casks/<new-slug>.rb` (최초 1회는 첫 release 가 자동 생성)
   - `.github/workflows/mirror-<new-slug>.yml` (legacy tap 운영하는 경우만)
4. (legacy tap 필요한 경우) `<org>/homebrew-<new-slug>` 레포 생성 + PAT 발급 + tap 레포 시크릿 등록
5. 첫 `./release-mac` 실행

---

## 함정과 교훈

- **Generic 태그는 금지**. `mac-v*` 처럼 슬러그 없는 태그는 한 tap 에 두 번째 앱이 들어오는 순간 폭발. 처음부터 `<slug>-v*` 로 시작.
- **순서 중요**: cask 푸시 전에 release 가 존재해야 한다. `release-mac` 은 이 순서를 지키지만 직접 수정할 때 헷갈리지 말 것.
- **Sequester rsrc 옵션 필수**. `ditto -c -k --keepParent --sequesterRsrc` 가 핵심. Finder 의 압축이나 zip 명령은 macOS 메타데이터를 잃을 수 있어 cask 가 못 푼다.
- **xattr 제거는 사용자 신뢰의 대가**. brew 가 sha256 으로 무결성을 보장한다는 가정 하에서만 정당. 다른 채널로 zip 뿌리지 말 것.
- **Universal binary 잊지 말 것**. `swift build -c release` 만 호출하면 host arch 만 빌드됨 (Apple Silicon 빌더 → arm64 only → Intel Mac 사용자 실행 불가). 자세히는 [macos-universal-binary.md](./macos-universal-binary.md).

---

## 참고 위치

- 패턴 적용 레포: `~/work/airplay_touch`, `~/work/audiocast`, `~/work/audiocast-driver`
- 주요 스크립트: `{release, release-mac}` (버전 파이프라인은 bump-version.md)
- Tap 레포: <https://github.com/jobtools/homebrew-tap>
- Legacy tap 예: <https://github.com/jobtools/homebrew-airplay-touch>
