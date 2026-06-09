---
title: "Windows exe를 MS Store에 배포하기 (MSIX)"
date: 2026-06-09T16:00:00+09:00
updated: 2026-06-09T18:30:00+09:00
---

# Windows exe를 MS Store에 배포하기 (MSIX)

Microsoft Store는 raw `.exe`를 직접 받지 않는다. 실행 파일을 **MSIX 패키지**로 감싸서 올려야 한다. 핵심 흐름과 비직관적인 함정만 간략히 정리한다.

## 전체 그림

```
exe  →  AppxManifest.xml + 에셋  →  MakeAppx pack  →  .msix  →  Partner Center 업로드
```

설치 프로그램(Inno Setup 등)이나 포터블 zip은 사이드로드/직접배포용이고, **Store 제출용은 MSIX 한 가지**다.

## 왜 Store로 가나 — exe를 "무료로" 서명받는 길

서명 안 된 exe를 그냥 배포하면 Windows SmartScreen이 "알 수 없는 게시자" 경고를 띄운다. 이걸 없애려면 코드 서명 인증서가 필요한데, OV 인증서도 연 수십~수백 달러고 EV는 더 비싸다. 게다가 SmartScreen 평판은 다운로드가 일정량 쌓여야 풀려서, 돈을 내고도 한동안 경고가 남는다.

이 서명 비용을 0으로 만드는 우회로가 몇 가지 있는데(예: 오픈소스 프로젝트용 무료 서명 프로그램 등), 그 중 가장 확실한 게 **MS Store 배포**다. Store에 올리면 Microsoft가 자기 인증서로 **재서명**해 주고, Store를 통해 설치된 앱은 SmartScreen 경고가 없다. 인증서를 직접 사거나 갱신·관리할 필요가 전혀 없다 — 서명을 Microsoft에게 위임하는 셈이다. 게다가 현재 개인 개발자 계정 등록은 무료라, 금전적 비용은 사실상 0이다. (대신 치르는 건 심사라는 시간 비용. 심사 경험은 글 끝에.)

## 1. Partner Center에서 Identity 발급

먼저 [Partner Center](https://partner.microsoft.com/dashboard)에 개발자 계정을 등록(현재 개인 계정은 무료)하고, 앱 이름을 예약한다. 그러면 그 앱에 묶인 **3개 값**을 발급받는다 — 이게 매니페스트의 신원이 된다.

- `Identity/Name` — 예: `12345Publisher.MyApp`
- `Identity/Publisher` — 예: `CN=ABCD1234-...`
- `PublisherDisplayName` — 사람이 읽는 게시자명

이 값들은 코드에 하드코딩하지 말고 별도 파일(`identity.local` 등)로 빼서 매니페스트에 치환 주입하는 게 깔끔하다. 로컬 사이드로드 테스트용으로는 가짜 identity(`<App>.Dev` / `CN=<App>-Dev`)를 쓰면 된다.

## 2. AppxManifest.xml

패키지의 핵심. placeholder를 두고 빌드 때 `sed`로 치환하는 패턴이 흔하다.

```xml
<Identity Name="__IDENTITY_NAME__"
          Publisher="__PUBLISHER_CN__"
          Version="__VERSION__" />
<Properties>
  <DisplayName>My App</DisplayName>
  <PublisherDisplayName>__PUBLISHER_DISPLAY__</PublisherDisplayName>
</Properties>
<Applications>
  <Application Id="App" Executable="myapp.exe" EntryPoint="Windows.FullTrustApplication">
    ...
  </Application>
</Applications>
```

`Windows.FullTrustApplication`이 포인트 — 일반 Win32 exe를 그대로 패키징할 때 쓰는 진입점이다.

## 3. 버전은 4-part, Revision은 0

MSIX 버전은 반드시 `Major.Minor.Build.Revision` 4자리다. 앱이 `1.2.3`을 쓴다면 매니페스트엔 `1.2.3.0`으로 넣는다. **마지막 Revision은 0으로 둔다** — Store가 내부적으로 예약하는 자리다.

## 4. 비주얼 에셋

Store는 정해진 스케일의 아이콘을 요구한다(`Square44x44Logo.scale-100.png`, `scale-200.png` 등). 주의할 함정 하나: `MakeAppx`는 매니페스트가 참조하는 **무수식(base) 파일명**이 패키지에 실제로 있어야 통과시킨다. scale 변형만 있으면 검증에서 떨어지므로, `scale-100`을 base 이름으로도 복사해 둔다.

```bash
for f in Assets/*.scale-100.png; do cp "$f" "${f%.scale-100.png}.png"; done
```

## 5. 패키징 — MakeAppx (Windows SDK)

`MakeAppx.exe`는 Windows 10/11 SDK에 들어 있다(`C:\Program Files (x86)\Windows Kits\10\bin\10.*\x64\`). exe + 매니페스트 + 에셋을 staging 폴더에 모아 pack한다.

```bash
MakeAppx.exe pack /d <staging_dir> /p <out.msix> /o
```

> Git Bash에서 돌릴 땐 `MSYS_NO_PATHCONV=1`을 앞에 붙여야 한다. 안 그러면 MSYS가 `/d`, `/p` 같은 슬래시 인자를 드라이브 경로로 오인해 망가뜨린다.

## 6. 서명 — Store 제출엔 불필요 (가장 비직관적인 부분)

가장 헷갈리는 지점. **Partner Center에 올릴 .msix는 서명하지 않는다.** Microsoft가 인증 과정에서 자기 인증서로 재서명하기 때문이다. 직접 서명해서 올리면 오히려 거부된다.

서명이 필요한 경우는 **로컬 사이드로드 테스트**뿐이다. 이땐 self-signed 인증서를 만들어 `SignTool`로 서명하고, 그 인증서를 `TrustedPeople`에 신뢰 등록한 뒤 `Add-AppxPackage`로 설치한다.

```powershell
# 1) self-signed code signing 인증서 생성 (매니페스트의 Publisher와 Subject 일치 필수)
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
          -Subject 'CN=MyApp-Dev' -CertStoreLocation 'Cert:\CurrentUser\My'
# 2) SignTool로 서명
SignTool.exe sign /fd SHA256 /f dev-cert.pfx /p <pw> out.msix
# 3) 설치
Add-AppxPackage -Path out.msix
```

## 7. 업로드 & 인증

Partner Center 대시보드의 앱 → 새 제출(submission)에 unsigned `.msix`를 올린다. 통과하면 게시된다. 실제 심사 소요 시간은 아래 경험 참고.

## 8. 경험 공유 — 심사 소요 시간

실제 앱 하나를 Store에 올리며 겪은 수치.

- **첫 심사 결과까지 약 4일.**
- **재심사 결과는 하루 정도.**
- **탈락 약 4회** 후 통과.
- **통과 후 업데이트 심사는 하루 정도.**

탈락하더라도 무엇이 왜 문제인지 사유를 구체적으로 안내해 주니, 그대로 고쳐 재제출하면 된다.

## 정리

| 단계 | 도구 | 핵심 |
|---|---|---|
| Identity | Partner Center | Name/Publisher/DisplayName 발급 |
| 매니페스트 | AppxManifest.xml | `FullTrustApplication` 진입점, 4-part 버전 |
| 패키징 | MakeAppx (SDK) | base 아이콘 파일명 필수, Git Bash는 `MSYS_NO_PATHCONV=1` |
| 서명 | (생략) / SignTool | **Store 제출은 unsigned**, 사이드로드만 서명 |
| 업로드 | Partner Center | unsigned 올리면 MS가 재서명 (= 무료 서명) |
| 심사 | Partner Center | 첫 심사 ~4일, 재심사 ~1일, 탈락 시 사유 안내 |

이 과정을 `MakeAppx → (조건부) SignTool` 한 스크립트로 묶어두면, identity 파일 유무로 store/dev 모드를 자동 분기시켜 매번 동일하게 빌드할 수 있다.
