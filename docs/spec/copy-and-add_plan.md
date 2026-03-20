# PLAN: Copy & Add 구현 계획

**스펙:** docs/spec/copy-and-add.md
**작성일:** 2026-03-20
**상태:** In Progress

---

## 진행 방식

각 Phase를 Dev Codex(구현) → Reviewer Codex(검수) 순서로 진행.
리뷰 FAIL 항목은 재수정 후 재검수.

---

## Phase 1 — 기반

**대상 파일:**
- `content/content-state.js`
- `_locales/ko/messages.json`
- `_locales/en/messages.json`
- `_locales/ja/messages.json`

**작업 내용:**

1. `content-state.js`
   - `State.accumulateMode: true` 추가
   - 상수 `ACCUMULATE_MODE_STORAGE_KEY: 'agt_accumulate_mode'` 추가

2. `_locales` 3개 파일에 아래 7개 키 추가

   | 키 | 용도 |
   |----|------|
   | `overlay_popover_copy_add` | 스플릿 버튼 좌측 레이블 |
   | `overlay_popover_add_only` | 드롭다운 항목 레이블 |
   | `popup_settings_accumulate_title` | 설정 섹션 제목 |
   | `popup_settings_accumulate_label` | 체크박스 레이블 |
   | `popup_settings_accumulate_desc` | 설정 설명 |
   | `overlay_toast_copied` | 복사 성공 토스트 메시지 |
   | `overlay_toast_copy_failed` | 복사 실패 토스트 메시지 |

---

## Phase 2 — 팝오버 UI

**대상 파일:**
- `content/overlay-popover.js`

**작업 내용:**
- `showAnnotationPopover` 시그니처에 `onCopyAdd` 5번째 파라미터 추가
- 버튼을 스플릿 버튼으로 교체
  - 좌측: `id="__agt-copy-add-btn__"` — "복사 후 추가"
  - 우측: `id="__agt-dropdown-trigger__"` — "▾" 드롭다운 트리거
  - 드롭다운: `id="__agt-dropdown-menu__"` → `id="__agt-add-only-item__"` "추가만"
- 키보드 재정의
  - `Enter` → `doCopyAdd()`
  - `Alt+Enter` → `doAddOnly()`
  - `Shift+Enter` → 줄바꿈 (기존 유지)
  - `Esc` → 드롭다운 열려있으면 드롭다운만 닫기, 닫혀있으면 `doCancel()`
    - **주의:** Esc 처리는 textarea뿐만 아니라 popoverEl 전체에 capture 리스너로 붙여야 함
- `refreshOverlayI18n` 갱신 — `#__agt-copy-add-btn__`, `#__agt-add-only-item__` 텍스트 갱신

---

## Phase 3 — 비즈니스 로직

**대상 파일:**
- `content/content-actions.js`
- `content/content-frame.js`
- `content/content-handlers.js`
- `content/content.js`

**작업 내용:**

1. `content-actions.js`
   - `handleCopyAdd(data, annotationText)` 추가
     - `accumulateMode=OFF` → 기존 선택 전체 초기화 후 추가
     - `accumulateMode=ON` → 기존 유지하고 추가
     - `exportAI([data])` 호출 → 빈 문자열이면 클립보드 skip
     - `navigator.clipboard.writeText()` → 성공/실패 토스트
   - `showContentToast(type)` 추가
     - `document.documentElement`에 append
     - `data-agt-own="1"` 필수
     - 1.5초 후 fade-out + remove
   - `SET_ACCUMULATE_MODE` 메시지 핸들러 추가
     - `C.State.accumulateMode` 갱신
     - `C.IS_TOP_FRAME`이면 `broadcastCommandToChildFrames` 호출

2. `content-frame.js`
   - frame bridge cmd에 `SET_ACCUMULATE_MODE` 핸들러 추가
   - `SET_MARKER_VISIBILITY` 패턴과 동일하게

3. `content-handlers.js`
   - `startSelectionFlow`의 `showAnnotationPopover` 호출에 `onCopyAdd` 콜백 추가 (5번째 인자)

4. `content.js`
   - 초기화 블록에 `agt_accumulate_mode` storage 읽기 추가 (default: true)

---

## Phase 4 — 팝업 설정

**대상 파일:**
- `popup/popup.html`
- `popup/popup.js`

**작업 내용:**

1. `popup.html`
   - `#panel-settings` 내 Info 섹션 바로 위에 "항목 누적" `settings-section` 추가
   - `id="accumulateModeToggle"` 체크박스, 기본 checked

2. `popup.js`
   - init 시 `agt_accumulate_mode` 읽어 toggle 초기화 (default: true)
   - change 이벤트 → storage 저장 + `SET_ACCUMULATE_MODE` 메시지 전송

---

## Known Limitations (이번 PR 범위 외)

- **iframe OFF-mode 미전파:** child iframe에서 선택 발생 시 `accumulateMode=OFF`가 parent/sibling frame 선택을 초기화하지 않음. 스펙 미언급 엣지케이스 — 차기 이슈로 분리.
- **shortcut 테이블 미갱신:** popup.js의 단축키 안내 테이블에 `Alt+Enter` 미반영. 스펙 외 항목.
