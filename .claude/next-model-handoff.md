# Next Model Handoff (현재 상태 요약)

## 프로젝트 상태
- repo: `agentation-chrome-extentions` (git repo 아님)
- 핵심 목적: Chrome extension 기반 DOM 선택/검색/주석 도구 고도화

## 이번 세션에서 완료한 주요 기능

### 1) 선택 UX 개선
- 선택 시작 시 팝업 자동 닫힘
- 요소 Add 시 순번 배지(1,2,3...) 표시
- 순번은 삭제/undo/redo 후 재정렬 유지

관련 파일:
- `popup/popup.js`
- `content/content.js`
- `content/overlay.js`

### 2) 팝오버/레이어 문제 해결
- 팝오버가 하이라이트에 가려지던 z-index 충돌 수정
- 레이어 우선순위: popover > tooltip > overlay

관련 파일:
- `content/overlay.js`

### 3) 전체삭제 확인 UX 변경
- 브라우저 `confirm()` 제거
- 팝업 내부 2단계 확인(버튼 한 번 더 클릭)으로 변경

관련 파일:
- `popup/popup.js`

### 4) 단축키/설정 UI 개편
- 토글 단축키 추가: `Ctrl/Cmd + Shift + X`
- 설정 탭 단축키를 Win/Mac 토글 + 테이블 형식으로 개편

관련 파일:
- `content/content.js`
- `popup/popup.html`
- `popup/popup.js`

### 5) 하이라이트 색상 커스터마이징
- 설정에서 `선택`, `검색` 색상 지정 가능
- 추천색 10개 팔레트 추가 (클릭 즉시 적용)
- 색상 설정 저장/복원 (`chrome.storage.local`)

관련 파일:
- `popup/popup.html`
- `popup/popup.js`
- `content/content.js`
- `content/overlay.js`

### 6) 마커 숨김/표시 기능 추가
- 하단 `복사` 버튼 아래 작은 버튼 추가: `마커 숨김` / `마커 표시`
- 상태 저장/복원 (`agt_marker_visibility`)
- 선택/검색/호버 마커 전체 숨김/표시 처리

관련 파일:
- `popup/popup.html`
- `popup/popup.js`
- `content/content.js`
- `content/overlay.js`

### 7) 툴바 드래그 기능
- 페이지 상단 카운터(현재 툴바 역할) 드래그 이동 가능
- 뷰포트 바깥으로 나가지 않도록 clamp 적용

관련 파일:
- `content/overlay.js`

### 8) 드래그 중 오탐 선택 방지
- 마우스 이동 6px 이상 드래그 시 다음 클릭 선택 무시
- `html/body` 및 화면 대부분 덮는 대형 컨테이너 선택 차단

관련 파일:
- `content/content.js`

### 9) 정보 섹션 업데이트
- 개발자 정보로 교체
  - 개발자 양세진
  - GitHub 링크(클릭 가능)
  - 이메일

관련 파일:
- `popup/popup.html`

## 문서 추가
- 배포 가이드 문서 생성:
  - `.claude/chrome-web-store-publish.md`
  - ZIP 생성 시 `.claude/*` 제외 명시됨

## 아직 안 한 기능 (사용자 비교 요구 기준)
- `Send Annotations` 버튼/플로우
- 우클릭 수정(Edit) 플로우
- 주석 모드 고급 기능(텍스트 범위 주석/멀티셀렉트 등)
- MCP/API/Webhook 연동

## 다음 모델 작업 시 우선 참고 포인트
1. 마커 숨김/표시 API 메시지
   - `GET_MARKER_VISIBILITY`
   - `SET_MARKER_VISIBILITY`
2. 색상 API 메시지
   - `GET_HIGHLIGHT_COLORS`
   - `SET_HIGHLIGHT_COLORS`
3. overlay 내부 상태값
   - `markersVisible`
   - draggable counter 상태 변수들

## 사용자 요청 맥락(최근)
- “툴바 기능 먼저” 요청에 따라:
  - 마커 숨김/표시 버튼 우선 반영 완료
  - 툴바 드래그 반영 완료
- 다음 단계 확장은 아직 대기 중
