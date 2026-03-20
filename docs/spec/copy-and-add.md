# SPEC: Copy & Add — 단일 항목 즉시 복사

**버전:** 1.0.5 예정
**작성일:** 2026-03-20
**상태:** Ready for implementation

---

## 1. 배경 및 목적

DOM-AI-Bridge는 AI와의 빠른 컨텍스트 공유를 위한 도구다.
현재 사용자는 요소를 선택/주석 추가 후, 별도로 Export 버튼을 눌러야 클립보드에 복사할 수 있다.
이 플로우를 단축해 **요소 추가 시점에 바로 AI 포맷으로 복사**할 수 있도록 한다.

---

## 2. 기능 정의

### 2-1. 팝오버 버튼 변경

**현재:**
```
[ 취소 ]  [ 추가 ]
```

**변경 후:**
```
[ 취소 ]  [ 복사 후 추가 | ▾ ]
                          ↓ 드롭다운
                       추가만
```

스플릿 버튼 구조: 좌측 메인 영역(복사 후 추가) + 우측 화살표 영역(드롭다운 트리거)

| 액션 | 역할 | 트리거 |
|------|------|--------|
| 복사 후 추가 | 주석 추가 + 단일 항목 AI 포맷 클립보드 복사 | 버튼 좌측 클릭 / Enter |
| 추가만 | 주석만 추가, 클립보드 미사용 | 드롭다운 선택 / Alt+Enter |
| 취소 | 팝오버 닫기, 선택 취소 | 버튼 클릭 / Esc |

**단축키 정리:**

| 키 | 동작 |
|----|------|
| Enter | 복사 후 추가 (primary) |
| Alt+Enter | 추가만 (secondary) |
| Esc | 취소 |
| Shift+Enter | 줄바꿈 (기존 유지) |

---

### 2-2. 복사 대상 포맷

`window.__AGT.exportAI([singleItem])` 결과값을 그대로 사용한다.
단, 인덱스는 항상 1로 표시된다 (단일 항목이므로).

**예시 출력:**
```markdown
# UI Annotations
**Page:** https://example.com/list
**Elements:** 1

---
**[1] DIV** `.item-list > div:nth-child(3)`
Text: "94개 중 1–50"
> 페이지네이션 컴포넌트, 현재 1페이지 표시
```

복사 성공 시 content script 전용 인라인 토스트를 새로 생성해 표시 (1.5초 후 자동 제거).
popup의 `#toast`는 팝업 전용이므로 재사용 불가. overlay와 동일하게 `document.documentElement`에 append하는 방식으로 구현.

---

### 2-3. 설정 토글: 항목 누적 모드

**위치:** 팝업 → Settings 탭 → 새 섹션 추가

**동작:**

| 상태 | 복사 후 추가 | 추가만 |
|------|-------------|--------|
| ON (기본값) | 복사 + 리스트에 추가 | 리스트에만 추가 |
| OFF | 복사 + 기존 초기화 + 추가 | 기존 초기화 + 추가 |

> 버튼 레이블은 accumulate 모드와 무관하게 동일하게 유지.
> 사용자가 설정에서 이미 OFF로 설정한 것이므로 동작을 인지하고 있다고 가정.

**Storage key:** `agt_accumulate_mode`
**타입:** boolean
**기본값:** `true`

> OFF 모드는 AI와 빠른 1:1 질문 반복 시 유용 — 매번 새 컨텍스트로 시작

---

## 3. 영향 범위 (변경 파일)

### content/overlay-popover.js
- `showAnnotationPopover` 시그니처에 `onCopyAdd` 콜백 추가 (기존 `onAdd` 유지)
- 버튼을 스플릿 버튼으로 교체
  - 좌측: "복사 후 추가" 메인 영역
  - 우측: "▾" 드롭다운 트리거 → "추가만" 메뉴 항목
- 키보드:
  - Enter → `doCopyAdd()`
  - Alt+Enter → `doAdd()`
  - Shift+Enter → 줄바꿈 (기존 유지)
  - Esc → `doCancel()` (기존 유지)
- 드롭다운은 팝오버 외부 클릭 시 닫힘 (기존 outside click 핸들러 활용)
- i18n 갱신 대상에 "복사 후 추가" / "추가만" 버튼 추가 (`refreshOverlayI18n`)

### content/content-actions.js
- `handleAdd` 유지 (추가만 경로)
- `handleCopyAdd` 추가:
  1. accumulate OFF이면 현재 항목 제외 기존 선택 초기화
  2. 항목을 리스트에 추가 (기존 handleAdd 로직 재사용)
  3. `window.__AGT.exportAI([item])` 호출
  4. `navigator.clipboard.writeText(aiText)` 실행
  5. 성공 시 토스트 "복사됨" 표시, 실패 시 토스트 "복사 실패"

### content/content.js (또는 content-handlers.js)
- `showAnnotationPopover` 호출부에 `onCopyAdd` 콜백 전달
- accumulate 모드 값을 content 상태에서 읽어 `handleCopyAdd`에 전달

### popup/popup.html
- Settings 탭에 "항목 누적" 섹션 추가:
  ```html
  <div class="settings-section">
    <div class="settings-title" data-i18n="popup_settings_accumulate_title">항목 누적</div>
    <div class="settings-row">
      <label>
        <input type="checkbox" id="accumulateModeToggle" checked />
        <span data-i18n="popup_settings_accumulate_label">새 항목 추가 시 기존 항목 유지</span>
      </label>
    </div>
    <div class="settings-desc" data-i18n="popup_settings_accumulate_desc">
      OFF 시 새 항목 추가마다 이전 선택이 초기화됩니다.
    </div>
  </div>
  ```

### popup/popup.js
- `agt_accumulate_mode` 스토리지 읽기/쓰기
- 체크박스 초기화 및 change 이벤트 처리
- 변경 시 content script에 `SET_ACCUMULATE_MODE` 메시지 전송

### content/content-state.js
- `State`에 `accumulateMode: true` 추가 (런타임 상태)
- 상수에 `ACCUMULATE_MODE_STORAGE_KEY: 'agt_accumulate_mode'` 추가

### content/content.js (메시지 핸들러)
- `SET_ACCUMULATE_MODE` 메시지 수신 → `window.__AGT_CONTENT.State.accumulateMode` 갱신
- 초기화 시 `chrome.storage.sync.get(C.ACCUMULATE_MODE_STORAGE_KEY)` 읽어 `State.accumulateMode` 세팅

### _locales/ko/messages.json
```json
"overlay_popover_copy_add": { "message": "복사 후 추가" },
"overlay_popover_add_only": { "message": "추가만" },
"popup_settings_accumulate_title": { "message": "항목 누적" },
"popup_settings_accumulate_label": { "message": "새 항목 추가 시 기존 항목 유지" },
"popup_settings_accumulate_desc": { "message": "OFF 시 새 항목 추가마다 이전 선택이 초기화됩니다." }
```

### _locales/en/messages.json
```json
"overlay_popover_copy_add": { "message": "Copy & Add" },
"overlay_popover_add_only": { "message": "Add only" },
"popup_settings_accumulate_title": { "message": "Item accumulation" },
"popup_settings_accumulate_label": { "message": "Keep existing items when adding new" },
"popup_settings_accumulate_desc": { "message": "When OFF, previous selections are cleared each time you add a new item." }
```

### _locales/ja/messages.json
```json
"overlay_popover_copy_add": { "message": "コピーして追加" },
"overlay_popover_add_only": { "message": "追加のみ" },
"popup_settings_accumulate_title": { "message": "アイテム蓄積" },
"popup_settings_accumulate_label": { "message": "新規追加時に既存アイテムを保持" },
"popup_settings_accumulate_desc": { "message": "OFFの場合、新しいアイテムを追加するたびに以前の選択がクリアされます。" }
```

---

## 4. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 클립보드 권한 거부 | 추가는 정상 완료, 토스트 "복사 실패" 표시, 콘솔 warning |
| 주석 없이 복사 후 추가 | annotation 빈 문자열로 처리 (기존 추가 동작과 동일) |
| accumulate OFF + undo | undo는 누적 모드와 무관하게 스냅샷 기반으로 동작 |
| `exportAI` 결과가 빈 문자열 | 복사 시도하지 않음, 추가만 수행 |
| 드롭다운 열린 상태에서 Esc | 드롭다운 먼저 닫힘, 팝오버는 유지 |
| Alt+Enter (추가만) + accumulate OFF | 기존 초기화 후 추가, 클립보드 미사용 |

---

## 5. 구현 순서

1. `_locales` 3개 파일에 i18n 키 추가 (`overlay_popover_copy_add`, `overlay_popover_add_only`, accumulate 관련 3개)
2. `overlay-popover.js` — 스플릿 버튼 UI + `onCopyAdd` 콜백 + 단축키 변경
3. `content-actions.js` — `handleCopyAdd` 구현
4. `content.js` / `content-handlers.js` — `onCopyAdd` 연결 + `SET_ACCUMULATE_MODE` 핸들러
5. `popup.html` + `popup.js` — 설정 토글 UI + 메시지 전송
6. 동작 검증:
   - Enter → 복사 후 추가
   - Alt+Enter → 추가만
   - accumulate ON/OFF 각각 동작 확인
   - 클립보드 권한 거부 케이스
