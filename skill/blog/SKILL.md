---
name: blog
version: 1.0.0
description: Publish/read/edit/delete posts on tech.sskplay.com via the GitHub Contents API. Use when the user wants to record a learning, tip, or pattern picked up during a Claude session as a public tech memo.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
triggers:
  - blog new
  - blog edit
  - blog list
  - blog rm
  - blog read
  - 블로그에 글 써
  - 이거 블로그에 기록
---

# blog — tech.sskplay.com 원격 publisher

어느 working directory / 세션에서도 호출 가능. 로컬에 repo 가 없어도 동작 — GitHub Contents API 한 번이면 commit + push 까지 끝남. `gh` CLI 인증을 그대로 사용 (별도 토큰 없음).

> 이 스킬은 `ssk-play/tech.sskplay.com` repo 의 `skill/blog/` 에 source 가 있고,
> 글로벌 위치(`~/.claude/skills/blog`)는 거기로의 symlink 다. 스킬을 고치면 블로그
> repo 에 커밋한다. 설치/동기화는 repo README 참고.

## 사전 점검 (preflight) — 매 호출 첫 단계

새 머신에서도 안전하게 실패하도록, 실제 API 호출 전에 한 번 확인:

```bash
command -v gh jq >/dev/null 2>&1 || { echo "need: gh, jq (brew install gh jq)"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }
```

통과 못 하면 사용자에게 무엇을 깔거나 실행해야 하는지 안내하고 멈춘다.

## 대상

- **Repo**: `ssk-play/tech.sskplay.com`
- **Branch**: `main`
- **Path prefix**: `docs/`
- **Live URL**: `https://tech.sskplay.com/<slug>/`
- **인덱스**: `docs/index.md` (Liquid 자동 — 손대지 말 것)

## Front matter 표준

모든 글은 반드시 다음 front matter 로 시작:

```yaml
---
title: "글 제목"
date: 2026-06-09T15:30:00+09:00
---
```

- `title` — 자동 인덱스에 노출됨. 없으면 인덱스에서 누락
- `date` — ISO 8601 with KST (+09:00). 인덱스 정렬 키
- 본문은 **H1 (`# 제목`) 없이** 시작해도 되지만, 기존 글 컨벤션은 H1 포함

## 글쓰기 컨벤션 (프로젝트 CLAUDE.md 와 동일)

- **한 주제 = 한 파일**. 통합 금지.
- **일반화된 패턴 서술**. 특정 앱은 예시로만, 주어는 `<org>/<slug>/<App>` placeholder.
- 한국어 본문, 코드/명령은 영어. 평어체 ("~한다").
- 문서 간 cross-link 는 한 줄 pointer. 중복 금지.

## 슬러그 규칙

- 영문 kebab-case, 짧고 검색 가능하게
- 예: `claude-skill-bootstrap`, `gh-api-contents`, `cloudflare-worker-gate`
- 충돌 검사: 생성 전 반드시 `blog list` 로 확인
- 충돌 시 `-2`, `-3` suffix

## Committer

```
ssk <developer.kss@gmail.com>
```

API 호출마다 `committer.name`/`committer.email` 명시 (gh 의 기본 author 와 다를 수 있으므로).

---

## 명령

### `/blog list` — 모든 글 슬러그 목록

```bash
gh api repos/ssk-play/tech.sskplay.com/contents/docs \
  --jq '.[] | select(.name | endswith(".md")) | select(.name != "index.md") | .name' \
  | sed 's/\.md$//'
```

출력은 슬러그 한 줄씩. 제목이 필요하면 사용자가 `/blog read <slug>` 호출.

### `/blog read <slug>` — 특정 글 본문 읽기

```bash
gh api repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md \
  -H 'Accept: application/vnd.github.raw'
```

raw 가 안 되면 fallback:

```bash
gh api repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md --jq .content | base64 -d
```

### `/blog new "<title>"` — 새 글 작성

절차:

1. **본문 작성**. 사용자가 본문을 직접 줬으면 그대로. "현재 대화 맥락에서 정리" 요청이면 직전 작업/배운 내용을 한국어로 정리. **글쓰기 컨벤션 준수**.
2. **슬러그 결정**. 제목에서 영문 kebab-case 추출. 제목이 한글이면 사용자에게 영문 슬러그를 묻거나 (AskUserQuestion), 영문 키워드로 매핑.
3. **충돌 검사**. `gh api .../contents/docs/<slug>.md` 가 200 이면 충돌 — suffix.
4. **임시 파일에 마크다운 저장** (`/tmp/blog-post.md`):
   ```markdown
   ---
   title: "<title>"
   date: <ISO 8601 + KST>
   ---
   <본문>
   ```
   날짜는 사용자 환경의 `date -u +%Y-%m-%dT%H:%M:%S+00:00` 또는 KST 로 직접 — Claude 가 알고 있는 현재 시각 사용.
5. **사용자 확인** (AskUserQuestion). 슬러그, 제목, 본문 첫 줄 보여주고 publish 여부 물음. 짧은 글이면 생략 가능 — 사용자가 명시적으로 "바로 올려" 라고 하면.
6. **PUT 호출**:
   ```bash
   SLUG="<slug>"
   TITLE="<title>"
   jq -n \
     --arg msg "Add post: $TITLE" \
     --arg content "$(base64 < /tmp/blog-post.md | tr -d '\n')" \
     '{message: $msg, content: $content, committer: {name: "ssk", email: "developer.kss@gmail.com"}}' \
     | gh api -X PUT "repos/ssk-play/tech.sskplay.com/contents/docs/$SLUG.md" --input -
   ```
7. **결과 URL 출력**: `https://tech.sskplay.com/<slug>/`
8. **빌드 대기 (선택)**: Pages 빌드 30-60초. 사용자가 확인 원하면:
   ```bash
   for i in $(seq 1 20); do
     code=$(curl -sI "https://tech.sskplay.com/<slug>/" -o /dev/null -w '%{http_code}')
     [ "$code" = "200" ] && echo "live" && break
     sleep 5
   done
   ```

### `/blog edit <slug>` — 기존 글 수정

1. **현재 sha + 본문 fetch**:
   ```bash
   gh api repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md > /tmp/blog-meta.json
   SHA=$(jq -r .sha /tmp/blog-meta.json)
   jq -r .content /tmp/blog-meta.json | base64 -d > /tmp/blog-post.md
   ```
2. **사용자가 지시한 수정 적용** (Edit/Write 로 `/tmp/blog-post.md`). 본문만 고치고 front matter 의 `title`/`date` 는 보존. `updated:` 추가하고 싶다면 별도 키.
3. **PUT with sha**:
   ```bash
   TITLE=$(grep -m1 '^title:' /tmp/blog-post.md | sed 's/^title: *//;s/^"//;s/"$//')
   jq -n \
     --arg msg "Update post: $TITLE" \
     --arg content "$(base64 < /tmp/blog-post.md | tr -d '\n')" \
     --arg sha "$SHA" \
     '{message: $msg, content: $content, sha: $sha, committer: {name: "ssk", email: "developer.kss@gmail.com"}}' \
     | gh api -X PUT "repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md" --input -
   ```

### `/blog rm <slug>` — 글 삭제

위험 동작이므로 반드시 사용자 확인 (AskUserQuestion) 후 진행.

```bash
SHA=$(gh api repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md --jq .sha)
jq -n \
  --arg msg "Remove post: <slug>" \
  --arg sha "$SHA" \
  '{message: $msg, sha: $sha, committer: {name: "ssk", email: "developer.kss@gmail.com"}}' \
  | gh api -X DELETE "repos/ssk-play/tech.sskplay.com/contents/docs/<slug>.md" --input -
```

---

## 동작 원칙

- **인덱스 갱신 안 함**. `docs/index.md` 는 Liquid 가 `site.pages` 자동 순회 — CRUD 가 인덱스 건드릴 일 없음.
- **PR 안 만듦**. main 직접 commit. single-user 라 리뷰 단계 불필요. 사고나면 revert.
- **Draft 안 씀**. 처음부터 publish. 필요해지면 `_drafts/` 폴더로 별도 흐름 추가.
- **로컬 clone 불필요**. 모든 동작은 GitHub Contents API. working directory 무관.
- **base64 호환성**. macOS/Linux 모두 `base64 < file | tr -d '\n'` 으로 정규화.

## 실패 모드

| 증상 | 원인 | 대응 |
|---|---|---|
| `command not found: gh/jq` | 의존성 미설치 | `brew install gh jq` |
| `gh auth status` 실패 | 미인증 | `gh auth login` |
| `404 Not Found` on PUT | repo path 오타 | `repos/ssk-play/tech.sskplay.com` 확인 |
| `409 Conflict` | sha mismatch (다른 곳에서 수정됨) | 다시 fetch → 재시도 |
| `422` with "sha wasn't supplied" | 기존 파일에 sha 없이 PUT | GET → sha → PUT |
| `422` with "Invalid request" | base64 줄바꿈 포함 | `tr -d '\n'` 누락 — 추가 |
| Pages 빌드 실패 | front matter YAML 오류 | `gh run list --repo ssk-play/tech.sskplay.com` |
| 60초 후에도 404 | 빌드 진행 중 또는 실패 | Actions 탭 확인 |

## CLAUDE.md 의 글쓰기 컨벤션은 source of truth

이 스킬과 프로젝트 `CLAUDE.md` 가 충돌하면 `CLAUDE.md` 가 우선. 글 스타일 변경은 그쪽에서.
