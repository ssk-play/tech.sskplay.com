---
title: "apps.sskplay.com 안드로이드 사이드로드 배포 패턴"
date: 2026-06-19T09:34:19+09:00
---
# apps.sskplay.com 안드로이드 사이드로드 배포 패턴

Play 스토어를 거치지 않고 안드로이드 앱(APK)을 직접 배포하고, 앱이 **스스로 업데이트**하게 만드는 패턴 정리. 다른 AI 에이전트에게 "이 앱을 apps.sskplay.com 에 등록/게시하고 앱내 업데이트까지 붙여라"라고 시킬 때의 참조 문서다. 현재 **Monogame Studio**가 이 패턴을 쓴다.

구성 요소는 4개다:

1. **카탈로그 사이트** — `apps.sskplay.com` (GitHub Pages, `ssk-play/apps.sskplay.com` 레포의 `docs/` 서빙)
2. **서명된 APK** — 공유 keystore 로 서명, 안정적인 파일명(`<app>.apk`)으로 게시
3. **`latest.json`** — 버전 메타데이터. 사이트와 앱이 둘 다 이걸 읽는다(릴리스마다 페이지 코드 수정 불필요)
4. **앱내 자동 업데이트** — 설치된 versionCode 와 `latest.json` 을 비교해 새 버전이면 받아서 설치

## 큰 그림

```
[로컬 빌드 / deploy 스크립트]            [GitHub Pages: apps.sskplay.com]        [사용자 기기]
  ├─ bump version.properties             docs/<app>/                            ┌ 최초 설치
  ├─ assembleSideloadRelease  ──APK──▶   ├─ index.html  (latest.json fetch)     │  카탈로그 → 다운로드 → APK
  ├─ write latest.json        ──meta─▶   ├─ <app>.apk                           └ 이후
  └─ git commit + push        ───────▶   └─ latest.json  {version, code, sha…}      앱이 latest.json 폴링
                                              │  Pages 자동 빌드                      → 새 code면 배너 → 자가설치
                                              ▼
                                       https://apps.sskplay.com/<app>/
```

핵심: **사이트는 `latest.json` 을 읽어 버전/용량/다운로드를 동적으로 보여준다.** 그래서 새 빌드 게시는 "APK + latest.json 교체 + push"가 전부이고, 페이지 HTML 은 한 번만 만들면 된다.

## 저장소 구조

`apps.sskplay.com` 레포 기준:

```
docs/
├─ index.html              # 전체 앱 카탈로그(목록)
└─ <app>/                  # 앱 하나당 디렉터리 (예: monogame-studio/)
   ├─ index.html           # 다운로드 페이지 (latest.json 을 fetch)
   ├─ <app>.apk            # 안정적 파일명 — 항상 최신본으로 덮어씀
   ├─ latest.json          # 버전 메타데이터
   └─ assets/              # 아이콘/스크린샷 등
```

- 레포는 **GitHub Pages** 로 서빙되고 `Access-Control-Allow-Origin: *` 라, 앱(다른 오리진)에서 `latest.json` 을 fetch 할 수 있다.
- APK 는 **버전명을 안 붙인 고정 파일명**(`<app>.apk`)으로 둔다. 버전은 `latest.json` 이 source of truth. (구버전 versioned APK 가 남아 있으면 deploy 시 `git rm` 으로 청소.)

## 1. 앱 등록 (카탈로그 페이지)

`docs/<app>/index.html` 을 한 번 만든다. 정적이지만 **버전/용량은 `latest.json` 에서 동적으로** 채운다:

```html
<a id="dl" href="<app>.apk" download>다운로드</a>
<span id="meta"></span>
<script>
  fetch("latest.json", { cache: "no-store" })
    .then(r => r.json())
    .then(m => {
      document.getElementById("dl").href = m.apk;            // <app>.apk
      document.getElementById("meta").textContent =
        `v${m.version} · ${m.sizeLabel}`;
    });
</script>
```

그리고 `docs/index.html`(전체 카탈로그)에 이 앱 링크를 한 줄 추가한다. 이후 릴리스에서는 이 페이지를 **건드리지 않는다**.

## 2. APK 빌드 + 서명

### 서명 (공유 keystore)

`android/key.properties` (gitignore 필수 — 절대 커밋 금지):

```properties
storeFile=/path/to/shared-release.keystore
storePassword=…
keyAlias=…
keyPassword=…
```

`app/build.gradle.kts`:

```kotlin
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = java.util.Properties().apply {
    if (keystorePropertiesFile.exists()) load(java.io.FileInputStream(keystorePropertiesFile))
}
android {
    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }
    buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("release") } }
}
```

### 플레이버 분리 — 자가설치 권한 격리

사이드로드 빌드만 **자기 자신을 설치**할 수 있어야 하고, (혹시 올릴) Play 스토어 빌드엔 그 권한이 **들어가면 안 된다**. product flavor 로 가른다:

```kotlin
flavorDimensions += "dist"
productFlavors {
    create("sideload") { dimension = "dist" }   // 자가설치 O
    create("play")     { dimension = "dist" }   // 자가설치 X
}
```

`REQUEST_INSTALL_PACKAGES` 권한과 설치용 `FileProvider`/플러그인은 **`src/sideload/AndroidManifest.xml` 에만** 선언한다. `src/play/` 엔 매니페스트를 두지 않으면 main 매니페스트(권한 없음)를 그대로 쓴다. 빌드는 `assembleSideloadRelease`.

## 3. `latest.json` 스펙

```json
{
  "version": "1.0.10",          // 사용자 노출 versionName (x.y.z)
  "versionCode": 11,            // 정수. 앱 업데이트 비교의 기준
  "apk": "monogame-studio.apk", // 다운로드 파일명
  "size": 4882202,              // 바이트
  "sizeLabel": "4.7 MB",
  "sha256": "…",                // 무결성
  "updated": "2026-06-19"
}
```

`versionCode` 가 업데이트 판단의 단일 기준이다. **버전은 한 곳에서만 관리**한다 — `android/version.properties` 를 source of truth 로 두고 build 스크립트가 읽게 하면, deploy 스크립트는 이 평문 파일만 bump 하면 된다(Kotlin/Gradle 파일을 정규식으로 패칭하지 말 것 — 깨지기 쉽다):

```properties
# android/version.properties
versionCode=11
versionName=1.0.10
```

```kotlin
// app/build.gradle.kts
val v = java.util.Properties().apply {
    rootProject.file("version.properties").inputStream().use { load(it) }
}
defaultConfig {
    versionCode = v.getProperty("versionCode").trim().toInt()
    versionName = v.getProperty("versionName").trim()
}
```

## 4. 게시 (deploy 스크립트)

한 방에 끝나는 `deploy.sh` 패턴. 스크립트 위치에서 studio 디렉터리를 자동 도출하면 어디서 실행하든 동작한다:

```bash
set -euo pipefail
STUDIO_DIR="${STUDIO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
CATALOG_DIR="${CATALOG_DIR:-/Users/ssk/work/apps.sskplay.com}"
VERSION_FILE="$STUDIO_DIR/android/version.properties"
PUB="$CATALOG_DIR/docs/<app>"
export JAVA_HOME="…/openjdk@21/…"     # AGP 9 / Gradle 9 는 JDK 21

# ① version.properties 패치 bump (평문이라 sed 한 줄)
code=$(grep -oE 'versionCode=[0-9]+' "$VERSION_FILE" | grep -oE '[0-9]+')
name=$(grep -oE 'versionName=[0-9.]+' "$VERSION_FILE" | grep -oE '[0-9.]+')
IFS=. read -r maj min pat <<<"$name"
sed -i '' -E "s/versionCode=[0-9]+/versionCode=$((code+1))/" "$VERSION_FILE"
sed -i '' -E "s/versionName=[0-9.]+/versionName=$maj.$min.$((pat+1))/" "$VERSION_FILE"

# ② 빌드 + 서명 검증
( cd "$STUDIO_DIR" && npx cap sync android >/dev/null )
( cd "$STUDIO_DIR/android" && ./gradlew --quiet assembleSideloadRelease )
APK="$STUDIO_DIR/android/app/build/outputs/apk/sideload/release/app-sideload-release.apk"
apksigner=$(ls -t "$ANDROID_HOME"/build-tools/*/apksigner | head -1)
"$apksigner" verify "$APK" >/dev/null

# ③ APK 복사 + latest.json 작성
cp "$APK" "$PUB/<app>.apk"
size=$(stat -f%z "$PUB/<app>.apk"); sha=$(shasum -a 256 "$PUB/<app>.apk" | cut -d' ' -f1)
cat > "$PUB/latest.json" <<JSON
{ "version":"…","versionCode":…,"apk":"<app>.apk","size":$size,"sha256":"$sha","updated":"$(date -u +%F)" }
JSON

# ④ 카탈로그 레포에 커밋 + push → Pages 자동 배포
cd "$CATALOG_DIR"
git add docs/<app>/ && git commit -q -m "release v…" && git push origin main
```

## 5. 앱내 자동 업데이트

앱(Capacitor)이 켜질 때 `latest.json` 을 폴링해, 설치본보다 versionCode 가 크면 배너를 띄우고 한 번에 받아서 설치한다.

```js
// 설치된 build = App.getInfo().build (= versionCode)
const info = await App.getInfo();
const meta = await (await fetch(LATEST_URL, { cache: "no-store" })).json();
if (parseInt(meta.versionCode) > parseInt(info.build)) showUpdateBanner(meta);
```

설치는 **네이티브 플러그인(사이드로드 플레이버 전용)** 으로:

1. `latest.json` 의 APK 를 앱 `cacheDir` 에 다운로드
2. `FileProvider.getUriForFile(ctx, "$packageName.fileprovider", apk)`
3. `ACTION_VIEW` 인텐트 (`FLAG_GRANT_READ_URI_PERMISSION`) → 시스템 PackageInstaller → "알 수 없는 출처" 확인 → 설치

```java
Intent i = new Intent(Intent.ACTION_VIEW)
    .setDataAndType(uri, "application/vnd.android.package-archive")
    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
ctx.startActivity(i);
```

> Play 플레이버엔 이 플러그인/권한이 dex 에 없어야 한다. `MainActivity` 에서 `Class.forName(...)` 으로 **리플렉션 등록**하면, 클래스가 없는 play 빌드에선 조용히 건너뛴다.

버전 라벨을 탭하면 즉시 재확인하게 해두면 디버깅이 편하다.

## 함정 / 메모

- **Capacitor `server.url` 이 원격이면 웹/JS 는 원격에서 로드된다.** 즉 JS 버그 픽스는 APK 재배포 없이 웹만 배포하면 기기에 반영된다. 네이티브 변경(권한·플러그인·라이브러리)만 새 APK 가 필요. (Monogame Studio 는 에디터를 `monogame.cc/dev` 에서 원격 로드한다.)
- **네이티브 구글 로그인은 클래식 GMS 피커**(`useCredentialManager:false`)를 쓴다. 일부 삼성/One UI 기기에서 시스템 Credential Manager UI 가 init 중 크래시 → `signInWithGoogle()` 이 에러 없이 무한 대기한다. 클래식 피커는 그 시스템 UI 를 안 거친다.
- **AGP 9 + Capacitor 8**: Capacitor 가 생성하는 네이티브 플러그인 모듈은 자체 buildscript 에 AGP 8.13 을 박아둔다. 루트에서 `resolutionStrategy` 로 전 모듈 AGP 를 통일(force)하면 AGP 9.2 빌드가 통과한다. Kotlin 은 AGP 9 빌트인이라 `kotlin.android` 플러그인을 따로 적용하면 에러.
- **시크릿**: `key.properties`/`local.properties` 는 절대 커밋 금지(.gitignore). keystore 비밀번호를 로그/PR 에 찍지 말 것. `google-services.json` 은 클라이언트 식별자라 private 레포면 커밋해도 무방.
- **권한**: 자가설치엔 `REQUEST_INSTALL_PACKAGES` + `FileProvider` 가 사이드로드 매니페스트에만 있어야 한다. 인터넷 권한도 확인.
