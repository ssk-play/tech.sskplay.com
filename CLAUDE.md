# CLAUDE.md

이 레포에서 작업할 때의 컨텍스트.

## 목적

기술 메모 / 작업 노트 모음. GitHub Pages (public) 로 https://tech.sskplay.com/ 서빙.

- Repo: `ssk-play/tech.sskplay.com` (public)
- Pages source: branch `main`, path `/` (root)
- 도메인: `tech.sskplay.com` (CNAME 파일로 지정, Cloudflare DNS → `ssk-play.github.io`)

## 글쓰기 컨벤션

- **한 주제 = 한 파일**. 통합하지 말 것. 새 주제는 새 .md 파일로 분리하는 것을 기본값으로 한다 (과거에 통합 → 분리 리팩토링한 이력 있음).
- **일반화된 패턴 서술**. 특정 앱 (`airplay-touch`, `audiocast`) 은 예시로만 인용. 본문 주어는 `<org>/<slug>/<App>` 같은 placeholder.
- **README 는 1줄 인덱스**. 각 문서당 `- [파일.md](./파일.md) — 한 줄 hook` 형식. 긴 설명은 README 가 아니라 해당 문서 첫 단락에.
- 문서 사이 cross-link 는 한 줄 pointer 로 충분. 같은 내용을 두 문서에 적지 말 것.
- 한국어 본문, 코드 블록 / 명령은 영어. 평어체 ("~한다", "~할 것").

## Git 워크플로

- 각 doc 수정 단위마다 commit + push (CI / Pages rebuild 가 자동 fire).
- Author / Committer:
  - name: `ssk`
  - email: `developer.kss@gmail.com`
- 커밋 메시지: 영문 제목 1줄 + 빈 줄 + 한글 본문(필요 시). 무엇이 바뀌었는지보다 **왜** 바뀌었는지 위주.

```bash
git -c user.name="ssk" -c user.email="developer.kss@gmail.com" \
    commit -m "..."
```

## Pages 배포 주의

- `CNAME` 파일 (root 에 있음, 내용: `tech.sskplay.com`) 건드리지 말 것. 지우면 도메인 풀림.
- main 에 push 하면 GitHub Actions `pages build and deployment` 가 자동 실행 (~45초).
- 연속 push 시 이전 빌드는 cancelled 되고 마지막 commit 기준으로 다시 빌드 — 정상 동작.
- HTTPS 인증서는 GitHub 이 Let's Encrypt 로 자동 발급 / 갱신. 수동 작업 불필요.

확인 명령:

```bash
gh run list --repo ssk-play/tech.sskplay.com --limit 3
curl -sI https://tech.sskplay.com/ | head -5
```

## 현재 문서 목록

| 파일 | 주제 |
|------|------|
| `README.md` | 인덱스 |
| `macos-brew-deploy.md` | 셀프-사인 macOS 앱을 Homebrew cask 로 배포 |
| `macos-universal-binary.md` | arm64 + x86_64 fat binary 빌드 |
| `bump-version.md` | 다중 플랫폼 semver 단일 소스 + `bump-version` 스크립트 |
| `homebrew-tap-mirror.md` | 멀티-캐스크 tap → legacy tap 자동 미러링 |

새 문서를 추가하면 `README.md` 인덱스에도 1줄 추가할 것.

## 안 하는 것

- README 에 본문 내용 직접 작성 (인덱스만 유지)
- 한 .md 안에 여러 주제 묶기 (분리 선호)
- 특정 프로젝트 / 앱 고유 정보 (이건 해당 앱 레포의 README 나 CLAUDE.md 영역)
- 히스토리 force push (이미 author 정정 1회 했음. 추가 rewrite 는 사용자 명시 승인 필요)
