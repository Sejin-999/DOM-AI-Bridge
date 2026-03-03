/**
 * content-state.js — 공유 상태 컨테이너
 * window.__AGT_CONTENT 네임스페이스를 초기화하고
 * 모든 content 모듈이 공유하는 State, 상수, 공용 유틸을 제공한다.
 */

(function () {
  'use strict';

  window.__AGT_CONTENT = {
    // ──────────────────────────────────────────
    // 핵심 상태
    // ──────────────────────────────────────────
    State: {
      isActive: false,
      selections: [],
      undoStack: [],
      redoStack: [],
      hoveredEl: null,
      isPointerDown: false,
      dragStartX: 0,
      dragStartY: 0,
      didDrag: false,
      skipNextClick: false,
      lastHoveredIframe: null,
      lastHoveredIframeAt: 0
    },

    // ──────────────────────────────────────────
    // iframe 브릿지 Maps (top frame만 실질 사용)
    // ──────────────────────────────────────────
    frameWindowByKey: new Map(),   // frameKey -> WindowProxy
    frameKeyByWindow: new Map(),   // WindowProxy -> frameKey
    childFrameSelectionMap: new Map(), // frameKey -> { frameInfo, selections }

    // ──────────────────────────────────────────
    // 상수
    // ──────────────────────────────────────────
    IS_TOP_FRAME: window.top === window,
    MAX_UNDO: 50,
    DRAG_THRESHOLD_PX: 6,
    TOGGLE_SHORTCUT_KEY: 'x',
    HIGHLIGHT_COLOR_STORAGE_KEY: 'agt_highlight_colors',
    MARKER_VISIBILITY_STORAGE_KEY: 'agt_marker_visibility',
    I18N_LOCALE_STORAGE_KEY: 'agt_locale',
    FRAME_BRIDGE_FLAG: '__agtFrameBridge__',
    FRAME_SYNC_TYPE: 'AGT_FRAME_SYNC',
    FRAME_HELLO_TYPE: 'AGT_FRAME_HELLO',
    FRAME_CMD_TYPE: 'AGT_FRAME_CMD',
    FRAME_KEY_ATTR: 'data-agt-frame-key',

    // ──────────────────────────────────────────
    // 스냅샷 유틸 (깊은 복사)
    // ──────────────────────────────────────────
    snapshot: function (arr) {
      return JSON.parse(JSON.stringify(arr));
    },

    pushUndo: function () {
      const C = window.__AGT_CONTENT;
      C.State.undoStack.push(C.snapshot(C.State.selections));
      if (C.State.undoStack.length > C.MAX_UNDO) C.State.undoStack.shift();
      C.State.redoStack = [];
    },

    // ──────────────────────────────────────────
    // 집합 선택 ID 파싱 (frame/local 구분)
    // ──────────────────────────────────────────
    parseAggregateSelectionId: function (id) {
      const raw = typeof id === 'string' ? id : '';
      if (!raw) return { kind: 'local', id: '' };
      if (raw.startsWith('frame-root::')) {
        return { kind: 'frame-root', frameKey: raw.slice('frame-root::'.length) };
      }
      if (raw.startsWith('frame::')) {
        const firstSep = raw.indexOf('::', 'frame::'.length);
        if (firstSep > 0) {
          return {
            kind: 'frame-item',
            frameKey: raw.slice('frame::'.length, firstSep),
            selectionId: raw.slice(firstSep + 2)
          };
        }
      }
      return { kind: 'local', id: raw };
    }
  };
})();
