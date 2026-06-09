---
title: "Claude 세션에서 정적 블로그에 원격으로 글 쓰는 skill"
date: 2026-06-09T13:50:45+09:00
---
# Claude 세션에서 정적 블로그에 원격으로 글 쓰는 skill

Claude 를 쓰다 배운 걸 그때그때 블로그에 남기고 싶다. 매번 repo 를 clone 하고 파일 만들고 commit/push 하고 인덱스까지 손보면 마찰이 커서 안 쓰게 된다. 목표는 하나다 — **어느 디렉토리, 어느 세션에서든 로컬 clone 없이 한 명령으로 publish 한다.** 글로벌 Claude Code skill 하나로 푼 패턴이다.

대상은 `<org>/<repo>` 의 GitHub Pages (Jekyll, `main` 브랜치 `/docs` 경로) 블로그다.

## 새 컴퓨터에서 처음 세팅

새 머신에서 이 skill 을 쓰려면 세 가지만 갖추면 된다. skill source 는 블로그 repo 안(`<repo>/skill/<name>/`)에 있고, 글로벌 위치는 거기로의 symlink 다.

```bash
# 1. 의존성 + 인증 (PAT 은 OS keychain 에 저장됨)
brew install gh jq
gh auth login

# 2. 블로그 repo clone (위치는 어디든)
gh repo clone <org>/<repo> ~/work/<repo>

# 3. skill 을 글로벌 위치로 symlink
ln -s ~/work/<repo>/skill/<name> ~/.claude/skills/<name>
```

이걸로 끝이다. 새 Claude 세션에서 skill 이 잡힌다. 다른 머신은 `git pull` 만 하면 symlink 가 최신 skill 을 가리키니, 세팅은 머신당 한 번뿐이다.

skill 폴더를 Pages source(`/docs`) 바깥에 두는 것만 지키면 된다. 그래야 사이트 빌드에 끌려 들어가지 않는다. 이렇게 repo 에 동봉하면 skill 수정이 글과 **같은 커밋 흐름**으로 버전 관리되고, 비밀이 없어 그냥 커밋해도 안전하다(인증은 아래처럼 `gh` 에 위임).

매 호출 첫 단계에 preflight 를 둬서 세팅이 덜 된 머신에서도 친절하게 멈추게 한다.

```bash
command -v gh jq >/dev/null 2>&1 || { echo "need: gh, jq"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }
```

## CRUD 는 GitHub Contents API 한 겹으로

`gh` CLI 가 이미 인증돼 있으니 글 조작은 Contents API 직접 호출로 끝난다. clone·로컬 작업트리 없이 commit + push 까지 한 호출에 일어난다.

| 동작 | 호출 |
|---|---|
| Create | `PUT /contents/docs/<slug>.md` (sha 없이) |
| Read | `GET /contents/docs/<slug>.md` + `Accept: application/vnd.github.raw` |
| Update | `PUT /contents/docs/<slug>.md` (현재 `sha` 포함) |
| Delete | `DELETE /contents/docs/<slug>.md` (현재 `sha` 포함) |

update/delete 는 항상 현재 `sha` 를 요구한다. GET 으로 sha 를 먼저 받아 실어 보내는 2-step 이고, 이게 낙관적 잠금 역할을 한다 — 그 사이 다른 곳에서 수정됐으면 `409` 로 덮어쓰기를 막는다.

본문은 base64 로 싣는다. 가장 흔한 함정:

```bash
# 줄바꿈이 섞이면 422 Invalid request. 반드시 제거한다.
base64 < /tmp/post.md | tr -d '\n'
```

## 인덱스는 빌드 타임에 자동 생성한다

블로그 홈은 글 목록이다. CRUD 마다 이 목록을 손으로 갱신하면 빠뜨리거나 어긋난다. 그래서 Liquid 가 모든 페이지의 front matter 를 순회하게 해서 **인덱스를 빌드 타임에 만든다.**

```liquid
{% assign posts = site.pages | where_exp:"p","p.title" | sort:"date" | reverse %}
{% for p in posts %}{% unless p.path == "index.md" %}- [{{ p.title }}]({{ p.url | relative_url }}) — {{ p.date | date: "%Y-%m-%d" }}
{% endunless %}{% endfor %}
```

글 파일 하나만 PUT 해도 인덱스가 따라온다. **CRUD 가 인덱스를 건드릴 일이 없으니 sync 버그도 없다.** 대신 모든 글이 `title`·`date` front matter 를 갖는다는 규약을 세운다.

함정 하나: `where_exp` 식 문자열 안에서 작은따옴표를 쓰면 Liquid 파서가 `Expected end_of_string but found id` 로 죽는다. 식은 큰따옴표로 감싸고 내부엔 따옴표를 두지 않는다.

## 인증은 gh 에 위임 — skill 에 비밀 없음

skill 파일엔 토큰을 절대 넣지 않는다. 인증은 전적으로 `gh` 에 맡긴다 — PAT 은 OS keychain 에 있고 skill 은 `gh api` 를 부를 뿐이다. 그래서 **skill 파일 자체엔 비밀이 없어 그냥 복사하거나 git 에 커밋해도 안전**하다.

## 운영 메모

- **Pages 빌드 지연**: API 응답은 즉시 200 이지만 사이트 반영은 빌드(30–60초)가 끝나야 보인다. 필요하면 `curl -sI <url> -o /dev/null -w '%{http_code}'` 로 200 까지 폴링한다.
- **PR 안 만든다**: single-user 면 main 직접 커밋이 맞다. 잘못 올려도 정적 사이트라 revert 가 빠르다.
- **백업은 git 자체**다. 따로 없다.

## 정리

자동화로 마찰과 sync 버그를 동시에 없앤다 — 글 조작은 Contents API 한 겹, 인덱스는 빌드 타임 생성, skill 은 repo 에 동봉해 한 흐름으로 관리, 인증은 `gh` 에 위임. 마찰이 사라지면 비로소 기록하게 된다.
