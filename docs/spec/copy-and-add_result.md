# RESULT: Copy & Add 구현 완료 보고

**스펙:** docs/spec/copy-and-add.md
**플랜:** docs/spec/copy-and-add_plan.md
**브랜치:** feat/copy-and-add
**목표 버전:** 1.0.5
**작성일:** 2026-03-20

---

## 구현 완료 항목

### Phase 1 — 기반 (PASS)
- `content/content-state.js`: `State.accumulateMode: true` + `ACCUMULATE_MODE_STORAGE_KEY: 'agt_accumulate_mode'` 추가
- `_locales/ko|en|ja/messages.json`: 7개 신규 키 추가
  - `overlay_popover_copy_add`, `overlay_popover_add_only`
  - `popup_settings_accumulate_title`, `popup_settings_accumulate_label`, `popup_settings_accumulate_desc`
  - `overlay_toast_copied`, `overlay_toast_copy_failed`

### Phase 2 — 팝오버 UI (PASS)
- `content/overlay-popover.js`: 스플릿 버튼 교체
  - 좌측: "복사 후 추가" (`#__agt-copy-add-btn__`)
  - 우측: "▾" 드롭다운 트리거 (`#__agt-dropdown-trigger__`)
  - 드롭다운: "추가만" (`#__agt-add-only-item__`)
- 키보드: `Enter`→복사 후 추가, `Alt+Enter`→추가만, `Shift+Enter`→줄바꿈, `Esc`→드롭다운 먼저 닫기
- `refreshOverlayI18n`: 신규 버튼 ID로 갱신

### Phase 3 — 비즈니스 로직 (PASS)
- `content/content-actions.js`
  - `handleCopyAdd(data, annotationText)`: accumulate 모드 분기 + 추가 + `exportAI([data])` + 클립보드
  - `showContentToast(type)`: 1.5초 토스트, `document.documentElement` append, `data-agt-own="1"`
  - `SET_ACCUMULATE_MODE` 메시지 핸들러: child frame broadcast 포함
- `content/content-frame.js`: frame bridge에 `SET_ACCUMULATE_MODE` cmd 핸들러 추가
- `content/content-handlers.js`: `startSelectionFlow`에 `onCopyAdd` 5번째 콜백 연결
- `content/content.js`: 초기화 시 `agt_accumulate_mode` storage 읽기

### Phase 4 — 팝업 설정 (PASS)
- `popup/popup.html`: Settings 탭에 "항목 누적" 섹션 추가 (Info 섹션 앞)
- `popup/popup.js`: `initAccumulateModePreference()` — 읽기/저장/메시지 전송

---

## 설계 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 복사 포맷 | 항상 AI 포맷 고정 | 팝오버는 AI 빠른 공유 목적, 포맷 변경은 팝업 Export 버튼으로 |
| accumulate 기본값 | `true` (누적) | 기존 동작 보존, 명시적 OFF 선택 시에만 초기화 |
| 토스트 위치 | `document.documentElement` append | popup DOM 분리, overlay 패턴 일관성 |

---

## Known Limitations (이번 PR 범위 외)

- **iframe OFF-mode 미전파:** child iframe에서 선택 발생 시 `accumulateMode=OFF`가 parent/sibling frame 선택을 초기화하지 않음. 스펙 미언급 엣지케이스. 차기 이슈로 분리.
- **단축키 테이블 미갱신:** popup 단축키 안내 테이블에 `Alt+Enter` 미반영. 스펙 외 항목.

---

## 리뷰어 체크리스트

리뷰어는 아래 항목을 확인 후 버전 업데이트 및 문서 작업 진행.

### 기능 동작 검증
- [ ] 팝오버에서 Enter → 복사 후 추가 동작
- [ ] 팝오버에서 Alt+Enter → 추가만 동작 (클립보드 미사용)
- [ ] 팝오버에서 Shift+Enter → 줄바꿈
- [ ] "▾" 클릭 → 드롭다운 토글
- [ ] "추가만" 클릭 → 추가만 동작
- [ ] Esc (드롭다운 열림) → 드롭다운만 닫힘, 팝오버 유지
- [ ] Esc (드롭다운 닫힘) → 팝오버 취소
- [ ] 복사 성공 → 초록 토스트 "복사됨" 1.5초
- [ ] 클립보드 실패 → 빨간 토스트 "복사 실패"
- [ ] `exportAI` 빈 결과 → 추가만 수행, 클립보드 skip

### 누적 모드 검증
- [ ] Settings > 항목 누적 ON: 새 항목 추가 시 기존 유지
- [ ] Settings > 항목 누적 OFF: 새 항목 추가 시 기존 초기화
- [ ] OFF 상태에서 Undo → 스냅샷 기반 복원 정상 동작
- [ ] 페이지 새로고침 후 설정 유지

### 버전 업데이트 (리뷰어 수행)
- [ ] `manifest.json` version `1.0.4` → `1.0.5`
- [ ] `content/dom-utils.js` exportJSON 내 version 문자열 `1.0.3` → `1.0.5`
- [ ] README 업데이트 (기능 추가 내용 반영)

---

## 변경 파일 목록

```
_locales/en/messages.json
_locales/ja/messages.json
_locales/ko/messages.json
content/content-actions.js
content/content-frame.js
content/content-handlers.js
content/content-state.js
content/content.js
content/overlay-popover.js
popup/popup.html
popup/popup.js
docs/spec/copy-and-add.md        (신규)
docs/spec/copy-and-add_plan.md   (신규)
docs/spec/copy-and-add_result.md (신규)
```
