# Homebrew Tap 미러링

멀티-캐스크 tap 에 있는 cask 파일을 별도 single-cask tap 으로 자동 복제하는 패턴.

연관 문서: [macos-brew-deploy.md](./macos-brew-deploy.md) (이 미러를 활용하는 macOS 배포 흐름)

---

## 언제 필요한가

새 멀티-캐스크 tap (`<org>/homebrew-tap`) 으로 옮긴 후에도, **이전 single-cask tap (`<org>/homebrew-<slug>`) 로 이미 받아간 사용자** 가 정상적으로 `brew upgrade` 받을 수 있게 하기 위해.

```
새 tap (소스):  <org>/homebrew-tap          ← release-mac 이 cask 갱신
                       │
                       │ push paths: Casks/<slug>.rb
                       ▼
            mirror-<slug>.yml (GitHub Actions)
                       │
                       │ verbatim copy
                       ▼
legacy tap (목적지): <org>/homebrew-<slug>  ← 옛 사용자들이 tap 한 위치
```

옛 사용자는 그대로 `<org>/homebrew-<slug>` 를 tap 한 상태로 두면서도 새 URL / 새 sha256 의 zip 을 자동으로 받게 된다.

---

## 워크플로 (`<org>/homebrew-tap/.github/workflows/mirror-<slug>.yml`)

```yaml
name: Mirror <slug> cask to legacy tap

on:
  push:
    branches: [main]
    paths: ['Casks/<slug>.rb']
  workflow_dispatch:

permissions:
  contents: read

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source tap
        uses: actions/checkout@v4
        with:
          path: source

      - name: Checkout legacy tap
        uses: actions/checkout@v4
        with:
          repository: <org>/homebrew-<slug>
          path: legacy
          token: ${{ secrets.LEGACY_TAP_PUSH_TOKEN }}

      - name: Sync cask file
        working-directory: legacy
        run: |
          mkdir -p Casks
          cp ../source/Casks/<slug>.rb Casks/<slug>.rb
          if git diff --quiet Casks/<slug>.rb; then
            echo "Cask already in sync — nothing to do."
            exit 0
          fi
          VERSION=$(sed -nE 's/.*version "([^"]+)".*/\1/p' Casks/<slug>.rb | head -1)
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add Casks/<slug>.rb
          git commit -m "Mirror <slug> v${VERSION:-unknown} from homebrew-tap"
          git push
```

---

## 필요한 시크릿

`<org>/homebrew-tap` 레포 시크릿에 등록:

- `LEGACY_TAP_PUSH_TOKEN` — `<org>/homebrew-<slug>` 에 `contents: write` 권한이 있는 **fine-grained PAT**

PAT 발급:

1. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Repository access: `<org>/homebrew-<slug>` 만
3. Permissions: Repository permissions → Contents: Read and write
4. 토큰을 `<org>/homebrew-tap` Secrets 에 `LEGACY_TAP_PUSH_TOKEN` 으로 저장

---

## 미러는 slug-agnostic

워크플로가 cask 파일을 verbatim 복사한다. 따라서:

- 본 레포 `release-mac` 에서 슬러그 / 태그 / URL 만 바꿔도 legacy tap 까지 자동 전파됨
- 워크플로 자체는 손댈 필요 없음 (앱 추가 시에는 새 yml 파일 하나만 추가)

---

## 사용자 입장에서의 흐름

```bash
# 옛 사용자 (legacy tap)
brew tap <org>/<slug>            # 예: brew tap jobtools/airplay-touch
brew upgrade --cask <slug>       # 새 URL/sha 가 자동 반영된 cask 사용

# 새 사용자
brew tap <org>/tap               # 멀티-캐스크 tap
brew install --cask <slug>
```

옛 사용자가 굳이 `brew untap` / `brew tap <org>/tap` 으로 옮기지 않아도 정상 업그레이드.

---

## 새 앱에 미러 추가 절차

1. legacy single-app tap 레포 생성 (`<org>/homebrew-<new-slug>`) — 빈 main 브랜치면 충분
2. fine-grained PAT 발급 후 `<org>/homebrew-tap` Secrets 에 추가 (시크릿 이름은 공유 가능: 모든 앱이 같은 `LEGACY_TAP_PUSH_TOKEN` 을 써도 됨. PAT scope 에 각 legacy 레포가 다 포함되어 있다면)
3. `<org>/homebrew-tap` 에 `.github/workflows/mirror-<new-slug>.yml` 추가 (위 템플릿)
4. `Casks/<new-slug>.rb` 가 push 되면 워크플로가 fire 되어 legacy tap 초기화

---

## 함정과 교훈

- **순서**: 본 레포 push → mirror workflow → legacy push 순으로 fire. mirror 가 cask 만 복사하므로 cask 안의 URL 에 가리키는 release / zip 은 이미 GitHub Releases 에 올라가 있어야 한다 (그래서 `release-mac` 은 release 부터 만들고 cask 를 마지막에 push).
- **PAT 만료**: fine-grained PAT 은 max 1년. 만료 시 mirror 가 silent 하게 실패하지 않도록 Actions 알림 / cron 모니터 설정 권장.
- **legacy tap 의 손수 편집 금지**: mirror 가 force 가 아닌 일반 push 라 conflict 나면 멈춤. legacy 레포는 mirror 가 단독 소유.
- **변경 없을 때 commit 안 함**. `git diff --quiet` 가드가 핵심. cask 미변경 무 commit 으로 history 깨끗.
