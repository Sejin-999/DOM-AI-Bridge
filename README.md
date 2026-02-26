<div align="right">
  <a href="./README.md"><b>🇰🇷 한국어</b></a> &nbsp;|&nbsp;
  <a href="./README.en.md">🇺🇸 English</a>
</div>

<br>

<div align="center">
  <img src="./icons/icon128.png" width="72" alt="DOM AI Bridge" />
  <h1>DOM AI Bridge</h1>
  <p>웹 페이지의 DOM 요소를 직접 클릭해서 선택하고, AI 프롬프트로 바로 내보내는 Chrome 익스텐션</p>
  <p>가상 DOM에 의존하지 않고 실제 DOM을 직접 읽기 때문에, <b>모든 웹 환경에서 동작합니다.</b></p>
  <p>🌐 <a href="https://dom-ai-bridge.pages.dev/">공식 사이트</a> (개발중)</p>

  <br>

  <a href="https://github.com/Sejin-999/DOM-AI-Bridge">
    <img src="https://img.shields.io/badge/version-1.0.1-blue" alt="version" />
  </a>
  <img src="https://img.shields.io/badge/manifest-v3-green" alt="manifest v3" />
  <img src="https://img.shields.io/badge/license-MIT-gray" alt="license" />
</div>

<br>

![DOM AI Bridge 메인 화면](./docs/images/1.png)

---

<details>
<summary><b>💡 왜 만들었나요?</b></summary>

<br>

저는 한국에서 백엔드 개발자로 일하고 있습니다.
최근 바이브 코딩을 공부하면서 [Agentation](https://agentation.dev/)을 접했고, 흥미롭게 활용해왔습니다.

기존 Agentation은 React 기반 프로젝트에서 특히 강력한 개발 경험을 제공하지만,
저는 Thymeleaf, JSP 같은 Java 진영의 프론트엔드와 Vanilla JavaScript를 주로 사용하다 보니
적용 과정에서 제약과 불편함이 있었습니다.

그래서 특정 프레임워크에 종속되지 않고,
어떤 웹 환경에서도 바로 사용할 수 있는 Agentation 스타일의 도구가 필요하다고 판단해
이 프로젝트를 시작하게 되었습니다.

</details>

---

## 사용 방법

**4단계면 됩니다.**

| 단계 | 설명 |
|------|------|
| 1. 익스텐션 실행 | 팝업에서 **Start Selecting** 클릭 |
| 2. 요소 선택 | 페이지에서 원하는 DOM 요소 클릭 |
| 3. 주석 입력 | 팝업에서 *"이 부분 이렇게 바꿔줘"* 입력 |
| 4. 내보내기 | 포맷 선택 후 **Copy** → AI에 붙여넣기 |

<table>
  <tr>
    <td align="center"><b>① 요소 선택</b></td>
    <td align="center"><b>② 검색 기능</b></td>
  </tr>
  <tr>
    <td><img src="./docs/images/1.png" alt="기본 화면" /></td>
    <td><img src="./docs/images/2.png" alt="요소 선택" /></td>
  </tr>
</table>

---

## 내보내기 포맷

선택한 요소들을 목적에 맞는 포맷으로 바로 변환합니다.

### 🤖 AI용 (Claude, Cursor 등 AI 프롬프트에 최적화)

```markdown
# UI Annotations
**Page:** https://example.com
**Elements:** 2

---
**[1] BUTTON** `button.primary`
Text: "로그인"
> 버튼 색상을 파란색으로 변경해주세요

---
**[2] H1** `#main-title`
Text: "환영합니다"
> 폰트 사이즈를 키워주세요
```

### 👨‍💻 개발자용 (셀렉터 전략, 위치 등 상세 정보 포함)

```markdown
## DOM Selections — https://example.com
> Total: 2 elements

### 1. BUTTON — "로그인"
- **Selector**: `button.primary`
- **Strategy**: class
- **Position**: (120, 340) 80×36px
- **Annotation**: 버튼 색상을 파란색으로 변경해주세요
```

### 🔗 공유용 (디자이너, 기획자와 텍스트로 공유)

```
UI 주석 — https://example.com
총 2개 요소

1. BUTTON (button.primary)
   텍스트: "로그인"
   주석: 버튼 색상을 파란색으로 변경해주세요
```

---

## 주요 기능

### DOM 선택 & 주석
- 클릭으로 요소 선택, 순번 배지 자동 표시
- 주석 입력 팝오버 (Enter로 빠르게 추가)
- Undo / Redo 지원 (최대 50단계)
- CSS 셀렉터 자동 생성 (ID → 시맨틱 속성 → 클래스 → 경로 순)

### 검색
- CSS 셀렉터로 페이지 내 요소 검색 및 하이라이트

### 설정

<table>
  <tr>
    <td align="center"><b>언어 설정</b></td>
    <td align="center"><b>하이라이트 색상</b></td>
    <td align="center"><b>WebHook</b></td>
  </tr>
  <tr>
    <td><img src="./docs/images/3.png" alt="언어 설정" /></td>
    <td><img src="./docs/images/4.png" alt="색상 설정" /></td>
    <td><img src="./docs/images/5.png" alt="WebHook 설정" /></td>
  </tr>
</table>

- **다국어**: 한국어 / English / 日本語
- **색상 커스터마이징**: 선택/검색 하이라이트 색상 변경
- **WebHook**: 외부 서버로 주석 데이터 자동 전송 (최대 3개 타겟)
- **단축키**: `Ctrl/Cmd + Shift + X` 토글, `Esc` 종료, `Ctrl+Z` 실행 취소

---

## 설치 방법

### Chrome Web Store (준비 중)
> 심사 완료 후 링크가 업데이트됩니다.

### 개발자 모드로 직접 설치

```bash
# 1. 레포 클론
git clone https://github.com/Sejin-999/DOM-AI-Bridge.git

# 2. Chrome 주소창에 입력
chrome://extensions/

# 3. 우측 상단 "개발자 모드" 활성화
# 4. "압축 해제된 확장 프로그램 로드" 클릭
# 5. 클론한 폴더 선택
```

---

## AI 에이전트와 연결하기

DOM AI Bridge는 두 가지 플로우를 지원합니다.

### 수동 플로우 (기본)

```
익스텐션에서 Copy → AI 도구에 직접 붙여넣기
```

### 로컬 브리지 서버 (자동화)

[DOM-AI-Bridge-Server](https://github.com/Sejin-999/DOM-AI-Bridge-Server)를 함께 사용하면
**Claude Code, Cursor 같은 CLI 기반 AI 에이전트에 바로 전달**할 수 있습니다.

```
익스텐션 WebHook → 로컬 서버(127.0.0.1:4180) → 브리지 클라이언트 → AI 에이전트
```

브리지 클라이언트는 4가지 전달 방식을 지원합니다:

| 모드 | 설명 |
|------|------|
| `stdout` | 콘솔에 출력 |
| `clipboard` | 클립보드에 복사 |
| `frontmost` | 현재 포커스된 앱에 자동 붙여넣기 (Cursor, Claude 등) |
| `tmux` | 지정한 tmux pane에 전송 |

→ 서버 레포: [Sejin-999/DOM-AI-Bridge-Server](https://github.com/Sejin-999/DOM-AI-Bridge-Server)

### 개발 예정: MCP 서버

MCP 서버 연동을 통해 **DOM 선택 → AI → 코드 반영**까지 더 깊은 자동화를 지원할 예정입니다.

---

## Privacy

- 모든 데이터는 **로컬에서만 처리**
- 외부 서버에 사용자 데이터 저장 없음
- 폐쇄망 환경에서도 사용 가능

자세한 내용: [개인정보처리방침](./PRIVACY.md)

---

## 오픈소스

누구나 코드에 접근하고 개선에 참여할 수 있습니다.

- 메인 저장소: [Sejin-999/DOM-AI-Bridge](https://github.com/Sejin-999/DOM-AI-Bridge)
- 서버 저장소: [Sejin-999/DOM-AI-Bridge-Server](https://github.com/Sejin-999/DOM-AI-Bridge-Server)

### 기여 방법

PR은 두 가지 유형으로 받습니다.

| 유형 | PR 제목 형식 | 설명 |
|------|-------------|------|
| 기능 추가 | `Feat: 기능 설명` | 새로운 기능 구현 또는 버그 수정 |
| 언어 번역 | `Lang: 언어명` | 새로운 언어 번역 추가 또는 기존 번역 개선 |

프로젝트가 도움이 되었다면 GitHub ⭐ Star로 응원해주세요!
