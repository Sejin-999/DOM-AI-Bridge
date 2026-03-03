# Source Files Guide

이 문서는 DOM-AI-Bridge의 주요 소스 파일이 어떤 역할을 하는지 빠르게 파악하기 위한 안내서입니다.
오픈소스 기여 시 "어떤 파일을 먼저 봐야 하는지"를 기준으로 정리했습니다.

## Runtime Entry Points

| Path | Role |
|---|---|
| `manifest.json` | 확장 프로그램 진입 설정. content script 로드 순서, all-frames 주입, popup/background 연결을 정의합니다. |
| `background/background.js` | Service Worker. 탭 활성 상태 관리와 i18n 상태/메시지 제공을 담당합니다. |
| `popup/popup.html` | 확장 팝업 UI 마크업/스타일입니다. |
| `popup/popup.js` | 팝업 동작 로직. content script와 통신하고 선택 목록/검색/내보내기/UI 상태를 제어합니다. |

## Shared

| Path | Role |
|---|---|
| `shared/i18n.js` | popup/content 공용 i18n 클라이언트. background에서 locale/messages를 받아와 번역을 적용합니다. |

## Content Layer Overview

content 스크립트는 아래 순서로 로드됩니다.

1. `content/dom-utils.js`
2. `content/selector.js`
3. `content/overlay-state.js`
4. `content/overlay-highlight.js`
5. `content/overlay-counter.js`
6. `content/overlay-popover.js`
7. `content/overlay.js`
8. `content/content-state.js`
9. `content/content-frame.js`
10. `content/content-handlers.js`
11. `content/content-actions.js`
12. `content/content.js`

## Content: DOM/Selector

| Path | Role |
|---|---|
| `content/dom-utils.js` | 요소 데이터 수집, safe query 유틸, 자체 UI 제외 판별, export(AI/JSON/Markdown/Plain) 생성 로직을 제공합니다. |
| `content/selector.js` | CSS selector 생성 엔진. ID/시맨틱 속성/클래스/path 전략으로 유일한 selector를 생성합니다. |

## Content: Overlay Modules

| Path | Role |
|---|---|
| `content/overlay-state.js` | overlay 공유 상태 컨테이너(`window.__AGT_OVERLAY`)와 상수/유틸을 초기화합니다. |
| `content/overlay-highlight.js` | hover/selected/search 하이라이트 박스 렌더링과 위치 업데이트(rAF)를 담당합니다. |
| `content/overlay-counter.js` | 상단 선택 카운터 UI, 드래그 이동, 카운터 표시/애니메이션을 담당합니다. |
| `content/overlay-popover.js` | 주석 입력 popover UI 생성/제거/키 입력 처리를 담당합니다. |
| `content/overlay.js` | overlay 모듈을 결합하는 어댑터. 초기 DOM 생성/제거 및 전역 이벤트를 등록합니다. |

## Content: Selection/State Modules

| Path | Role |
|---|---|
| `content/content-state.js` | content 전역 상태 컨테이너(`window.__AGT_CONTENT`)와 공용 상수/유틸을 정의합니다. |
| `content/content-frame.js` | top frame ↔ iframe 간 postMessage 브릿지, frame 집계, frame-aware selection ID 처리를 담당합니다. |
| `content/content-handlers.js` | 마우스/키보드/blur 이벤트 처리, 활성화/비활성화 라이프사이클, 선택 플로우를 담당합니다. |
| `content/content-actions.js` | undo/redo, 삭제/전체삭제, 검색, storage, runtime message 처리 등 비즈니스 액션을 담당합니다. |
| `content/content.js` | 최종 진입점. SPA 라우트 감지, 초기화, 모듈 연결, storage/i18n 변경 구독을 담당합니다. |

## Quick Contribution Map

| 작업 목적 | 먼저 볼 파일 |
|---|---|
| selector 생성 품질 개선 | `content/selector.js`, `content/dom-utils.js` |
| 하이라이트/박스 위치 문제 | `content/overlay-highlight.js`, `content/overlay.js` |
| 선택 카운터/뱃지 UI | `content/overlay-counter.js`, `popup/popup.js` |
| 주석 입력 UX | `content/overlay-popover.js`, `popup/popup.js` |
| iframe 선택/집계 버그 | `content/content-frame.js`, `content/content-handlers.js`, `content/content-actions.js` |
| 팝업 목록/검색/내보내기 | `popup/popup.js`, `content/dom-utils.js` |
| 다국어 텍스트 | `_locales/*/messages.json`, `shared/i18n.js`, `background/background.js` |

## Notes for Contributors

- content 모듈은 전역 네임스페이스(`window.__AGT`, `window.__AGT_OVERLAY`, `window.__AGT_CONTENT`)를 공유하므로 로드 순서가 중요합니다.
- 프레임 관련 기능 수정 시 top frame/child frame 양쪽 메시지 흐름(`content/content-frame.js`)을 같이 확인해야 합니다.
- popup은 항상 top frame(`frameId: 0`) 기준으로 통신하므로, state 집계는 content 쪽에서 완결되어야 합니다.
