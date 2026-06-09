# tech.sskplay.com

기술 메모 / 작업 노트. GitHub Pages 로 <https://tech.sskplay.com/> 서빙.

- **Pages source**: `main` branch, `/docs` path
- **글 추가/수정/삭제**: 아래 `/blog` 스킬 (로컬 clone 없이 GitHub Contents API)
- 글쓰기 컨벤션은 [`CLAUDE.md`](./CLAUDE.md) 참고

## `/blog` 스킬 — Claude 세션에서 원격 publish

`skill/blog/` 에 source 가 있는 글로벌 Claude Code 스킬. 어느 repo / 세션에서든
`/blog new "제목"` 으로 현재 대화 맥락을 글로 정리해 publish 한다. CRUD 전부 지원
(`new` / `read` / `list` / `edit` / `rm`).

### 새 머신에 설치

```bash
# 1. 의존성
brew install gh jq
gh auth login            # PAT 은 macOS Keychain 에 저장됨

# 2. 이 repo clone (어디든)
gh repo clone ssk-play/tech.sskplay.com ~/work/tech.sskplay.com

# 3. 스킬을 글로벌 위치로 symlink
ln -s ~/work/tech.sskplay.com/skill/blog ~/.claude/skills/blog
```

이걸로 끝. 새 Claude 세션에서 `/blog` 가 잡힌다.

### 동기화

스킬 source 가 이 repo 안에 있으므로, 스킬을 고치면 다른 글과 동일하게
커밋/푸시한다. 다른 머신은 `git pull` 만 하면 symlink 가 자동으로 최신을 가리킨다.

### 동작 요약

- 모든 동작은 GitHub Contents API (`PUT`/`GET`/`DELETE /contents/docs/<slug>.md`)
- 비밀 없음 — 인증은 `gh` (Keychain). 스킬 파일은 그냥 복사해도 안전
- 홈 인덱스(`docs/index.md`)는 Liquid 가 front matter 를 자동 순회 — 글 추가 시 인덱스 손댈 필요 없음
