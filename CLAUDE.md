# CLAUDE.md

GitHub Pages 로 https://tech.sskplay.com/ 서빙하는 기술 메모 모음. Pages source: `main` branch, `/docs` path.

## 글쓰기 컨벤션

- **한 주제 = 한 파일**. 통합하지 말 것. 새 주제는 새 .md 로 분리.
- **일반화된 패턴 서술**. 특정 앱 (`airplay-touch`, `audiocast`) 은 예시로만. 주어는 `<org>/<slug>/<App>` placeholder.
- **README 는 1줄 인덱스**. `- [파일.md](./파일.md) — 한 줄 hook` 형식. 새 문서 추가 시 인덱스도 갱신.
- 문서 간 cross-link 는 한 줄 pointer. 같은 내용 중복 금지.
- 한국어 본문, 코드/명령은 영어. 평어체 ("~한다").

## Git

- 각 doc 수정 단위마다 commit + push.
- Author: `ssk <developer.kss@gmail.com>`.
- 커밋 메시지: 영문 제목 1줄 + 빈 줄 + 한글 본문(필요 시). **왜** 위주.

```bash
git -c user.name="ssk" -c user.email="developer.kss@gmail.com" commit -m "..."
```

## 주의

- `docs/CNAME` 건드리지 말 것. 지우면 도메인 풀림.
