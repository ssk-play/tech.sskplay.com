---
---
# macOS Universal Binary (arm64 + x86_64)

하나의 `.app` 으로 Apple Silicon 과 Intel Mac 양쪽을 커버하기 위한 fat binary 빌드 패턴. Swift Package Manager 기본 동작이 host arch 만 빌드하기 때문에 의도하지 않게 단일 arch 배포가 되기 쉽다.

배포 흐름 안에서의 위치: [macos-brew-deploy.md](./macos-brew-deploy.md) 의 빌드 단계.

---

## Pitfall: 기본은 single-arch

```bash
swift build -c release            # ⚠️ host arch 만 빌드
```

Apple Silicon 머신에서 빌드하면 arm64 only 가 나온다. 이 결과를 그대로 cask / 직접 zip 으로 배포하면 Intel Mac 사용자는 설치는 되더라도 실행 안 됨 (Rosetta 없이는).

CI 가 ARM 러너든 Intel 러너든, 한 쪽 arch 가 무성의하게 빠지기 쉬운 함정.

---

## 올바른 빌드 명령

SPM 에서 multi-arch 를 명시:

```bash
swift build -c release --arch arm64 --arch x86_64
```

출력 경로가 single-arch 빌드와 다름:

| 빌드 | 결과물 경로 |
|------|-------------|
| `swift build -c release` | `.build/release/<binary>` |
| `swift build -c release --arch arm64 --arch x86_64` | `.build/apple/Products/Release/<binary>` (fat) |

`build.sh` 안의 빌드 명령 + 바이너리 복사 경로 **둘 다** 갱신해야 한다:

```bash
swift build -c release --arch arm64 --arch x86_64

# ...

cp ".build/apple/Products/Release/${BUNDLE_NAME}" \
   "${APP_BUNDLE}/Contents/MacOS/${BUNDLE_NAME}"
```

---

## 검증

빌드 직후 두 도구로 확인:

```bash
file <app>.app/Contents/MacOS/<bin>
# 기대: Mach-O universal binary with 2 architectures: [x86_64...] [arm64]

lipo -info <app>.app/Contents/MacOS/<bin>
# 기대: Architectures in the fat file: ... are: x86_64 arm64
```

`Non-fat file ... arm64` 또는 `... x86_64` 로 나오면 single-arch 빌드인 것.

CI 에 한 줄 assertion 으로 박아두면 회귀 방지:

```bash
lipo -info "<app>.app/Contents/MacOS/<bin>" | grep -q 'x86_64 arm64\|arm64 x86_64' \
    || { echo "Not universal!"; exit 1; }
```

---

## macOS deployment target 결정

`Package.swift` 의 `.macOS(.vNN)` 가 다음 둘과 정합해야 한다:

- 코드가 실제로 호출하는 API 의 최소 OS 버전
- cask 의 `depends_on macos: ">= :sonoma"` 같은 선언

너무 낮으면 신규 API 사용 시 컴파일 실패. 너무 높으면 universal 의 의미가 줄어든다: 예) macOS 15 Sequoia 는 2019 이전 Intel Mac (Coffee Lake 이전) 을 drop 했으므로, deployment target 을 Sequoia 로 두면 universal 이어도 실제로 혜택 받는 Intel Mac 모델이 좁아진다.

| Deployment target | Intel Mac 지원 범위 |
|-------------------|---------------------|
| macOS 12 Monterey | 2015 MacBook, 2014 Mac mini 등 폭넓음 |
| macOS 13 Ventura  | 2017 ~ |
| macOS 14 Sonoma   | 2018 ~ |
| macOS 15 Sequoia  | 2019 (Coffee Lake) ~ |

cask 의 `depends_on macos:` 와 Package.swift 의 deployment target 을 같은 값으로 유지할 것.

---

## 외부 의존성도 universal 인지

SPM 의 source-only 의존성은 같은 `--arch` 옵션으로 같이 빌드되므로 자동으로 fat. 하지만 다음은 별도 확인 필요:

- pre-built XCFramework 형태로 배포되는 SDK
- C / Objective-C 라이브러리를 wrap 한 system module
- 동적 라이브러리 (`.dylib`) / 프레임워크 (`.framework`)

빌드 후 `.app` 안의 모든 동적 객체에 `lipo -info` 를 일괄 적용:

```bash
find "<app>.app" \( -name '*.dylib' -o -name '*.framework' \) \
    -exec sh -c 'echo "--- $1"; lipo -info "$1" 2>&1' _ {} \;
```

single-arch dylib 이 하나라도 있으면 실제 실행 시 해당 arch 에서 dlopen 실패.

---

## 함정과 교훈

- **명시하지 않으면 잊는다**. `swift build -c release` 만 적어두면 빌더 머신 arch 에 묶인다. `--arch` 두 개를 항상 적어둘 것.
- **출력 경로 바뀜**. fat 빌드는 `.build/apple/Products/Release/` 로 결과물이 이동. `cp .build/release/...` 가 그대로면 single-arch 잔재를 복사하게 됨.
- **CI 어서션 권장**. zip 만드는 단계 전에 `lipo -info | grep` 로 검증. arm64 only zip 이 한 번 배포되면 Intel 사용자 모두 깨짐.
- **의존성도 검사**. 본 바이너리만 fat 이고 dylib 이 single-arch 면 런타임에 폭발. `find ... lipo -info` 한 줄로 일괄 점검 가능.
- **Deployment target 과 짝짓기**. cask 의 `depends_on macos:` 와 Package.swift `.macOS(.vNN)` 가 어긋나면 사용자가 받아도 실행 거부.

---

## 참고 위치

- 적용 예: `~/work/airplay_touch/macos_companion/build.sh`
