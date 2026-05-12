---
---
# tech.sskplay.com

기술 메모 / 작업 노트 모음.

## 문서

- [macos-brew-deploy.md](./macos-brew-deploy.md) — 셀프-사인 macOS 에이전트 앱을 Homebrew cask 로 배포하는 패턴 (멀티-캐스크 tap, 슬러그 컨벤션, `release-mac` 흐름)
- [macos-universal-binary.md](./macos-universal-binary.md) — Apple Silicon + Intel 양쪽 커버하는 fat binary 빌드 (SPM `--arch`, 검증, deployment target, 의존성 점검)
- [bump-version.md](./bump-version.md) — 다중 플랫폼 앱의 버전 단일 소스 관리 (`VERSION` 파일 + `bump-version` 스크립트 설계, 추후 개선 후보)
- [homebrew-tap-mirror.md](./homebrew-tap-mirror.md) — 멀티-캐스크 tap → legacy single-cask tap 으로 cask 파일 자동 미러링 (GitHub Actions + fine-grained PAT)
