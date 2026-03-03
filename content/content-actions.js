/**
 * content-actions.js — 비즈니스 로직 & 메시지 핸들러
 * undo/redo, 선택 관리, 검색, storage, 상태 브로드캐스트,
 * chrome.runtime.onMessage 처리를 담당한다.
 * window.__AGT_CONTENT (content-state.js)에 의존한다.
 */

(function () {
  'use strict';

  const C = window.__AGT_CONTENT;

  // ──────────────────────────────────────────
  // Undo / Redo
  // ──────────────────────────────────────────
  function undo() {
    if (C.State.undoStack.length === 0) return;
    C.State.redoStack.push(C.snapshot(C.State.selections));
    C.State.selections = C.State.undoStack.pop();
    refreshHighlights();
    saveToStorage();
    broadcastState();
  }

  function redo() {
    if (C.State.redoStack.length === 0) return;
    C.State.undoStack.push(C.snapshot(C.State.selections));
    C.State.selections = C.State.redoStack.pop();
    refreshHighlights();
    saveToStorage();
    broadcastState();
  }

  function refreshHighlights() {
    window.__AGT.clearAllHighlights();
    C.State.selections.forEach((data, index) => {
      const el = window.__AGT.safeQuerySelector(data.selector);
      if (el) {
        window.__AGT.addSelectedHighlight(el, data.id, index + 1);
      }
    });
  }

  function syncHighlightOrderNumbers() {
    if (typeof window.__AGT.updateSelectedHighlightOrder !== 'function') return;
    C.State.selections.forEach((data, index) => {
      window.__AGT.updateSelectedHighlightOrder(data.id, index + 1);
    });
  }

  // ──────────────────────────────────────────
  // 선택 관리
  // ──────────────────────────────────────────
  function removeSelection(id) {
    const parsed = C.parseAggregateSelectionId(id);

    if (parsed.kind === 'frame-root' && C.IS_TOP_FRAME) {
      C.sendCommandToFrameKey(parsed.frameKey, { cmd: 'CLEAR_ALL' });
      C.clearChildFrameInMap(parsed.frameKey);
      broadcastState();
      return;
    }

    if (parsed.kind === 'frame-item' && C.IS_TOP_FRAME) {
      C.sendCommandToFrameKey(parsed.frameKey, { cmd: 'REMOVE_SELECTION', id: parsed.selectionId });
      C.removeChildSelectionInMap(parsed.frameKey, parsed.selectionId);
      broadcastState();
      return;
    }

    const targetSelection = C.State.selections.find((item) => item.id === parsed.id);
    if (C.IS_TOP_FRAME && targetSelection && targetSelection.frameKey) {
      C.sendCommandToFrameKey(targetSelection.frameKey, { cmd: 'CLEAR_ALL' });
      C.clearChildFrameInMap(targetSelection.frameKey);
    }

    C.pushUndo();
    C.State.selections = C.State.selections.filter(s => s.id !== parsed.id);
    window.__AGT.removeSelectedHighlight(parsed.id);
    syncHighlightOrderNumbers();
    saveToStorage();
    broadcastState();
  }

  function clearAll() {
    C.pushUndo();
    C.State.selections = [];
    window.__AGT.clearAllHighlights();
    if (C.IS_TOP_FRAME) {
      C.broadcastCommandToChildFrames({ cmd: 'CLEAR_ALL' });
      C.clearAllChildFramesInMap();
    }
    saveToStorage();
    broadcastState();
  }

  // ──────────────────────────────────────────
  // 검색
  // ──────────────────────────────────────────
  function search(query) {
    window.__AGT.clearSearchHighlights();
    if (!query || query.trim() === '') return { count: 0 };

    const elements = window.__AGT.safeQuerySelectorAll(query.trim());
    if (elements.length === 0) return { count: 0 };

    window.__AGT.showSearchHighlights(Array.from(elements));

    if (elements[0]) {
      elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return { count: elements.length };
  }

  // ──────────────────────────────────────────
  // Storage
  // ──────────────────────────────────────────
  function saveToStorage() {
    const key = `agt_${location.hostname}`;
    chrome.storage.local.set({
      [key]: {
        url: location.href,
        selections: C.State.selections,
        savedAt: Date.now()
      }
    }).catch(() => {});
  }

  function loadFromStorage() {
    const key = `agt_${location.hostname}`;
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          C.State.selections = [];
          resolve(false);
          return;
        }

        const saved = result[key];
        if (saved && saved.url === location.href && Array.isArray(saved.selections)) {
          C.State.selections = saved.selections;
          resolve(true);
          return;
        }

        C.State.selections = [];
        resolve(false);
      });
    });
  }

  function loadHighlightColorsFromStorage() {
    chrome.storage.local.get(C.HIGHLIGHT_COLOR_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) return;
      const saved = result ? result[C.HIGHLIGHT_COLOR_STORAGE_KEY] : null;
      if (saved) applyHighlightColors(saved);
    });
  }

  function loadMarkerVisibilityFromStorage() {
    chrome.storage.local.get(C.MARKER_VISIBILITY_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) return;
      if (typeof (result && result[C.MARKER_VISIBILITY_STORAGE_KEY]) === 'boolean') {
        applyMarkerVisibility(result[C.MARKER_VISIBILITY_STORAGE_KEY]);
      }
    });
  }

  // ──────────────────────────────────────────
  // 상태 브로드캐스트
  // ──────────────────────────────────────────
  function broadcastState() {
    syncSelectionCounter();
    if (C.IS_TOP_FRAME) {
      chrome.runtime.sendMessage({
        type: 'STATE_UPDATE',
        payload: getStateSnapshot()
      }).catch(() => {});
    } else {
      C.postFrameSyncToTop();
    }
  }

  function syncSelectionCounter() {
    if (typeof window.__AGT.updateSelectionCounter !== 'function') return;
    window.__AGT.updateSelectionCounter(C.getSelectionCount(), C.State.isActive);
  }

  function getStateSnapshot() {
    return {
      isActive: C.State.isActive,
      selections: C.getDisplaySelections(),
      selectionCount: C.getSelectionCount(),
      canUndo: C.State.undoStack.length > 0,
      canRedo: C.State.redoStack.length > 0,
      url: location.href
    };
  }

  // ──────────────────────────────────────────
  // 색상 / 마커 / i18n
  // ──────────────────────────────────────────
  function applyHighlightColors(colors) {
    if (typeof window.__AGT.setHighlightColors !== 'function') return null;
    return window.__AGT.setHighlightColors(colors || {});
  }

  function getHighlightColors() {
    if (typeof window.__AGT.getHighlightColors !== 'function') return null;
    return window.__AGT.getHighlightColors();
  }

  function applyMarkerVisibility(visible) {
    if (typeof window.__AGT.setMarkersVisible !== 'function') return null;
    return window.__AGT.setMarkersVisible(visible);
  }

  function getMarkerVisibility() {
    if (typeof window.__AGT.getMarkersVisible !== 'function') return true;
    return window.__AGT.getMarkersVisible();
  }

  async function syncI18nState() {
    if (!window.__AGT_I18N || typeof window.__AGT_I18N.init !== 'function') return null;
    await window.__AGT_I18N.init();
    const state = typeof window.__AGT_I18N.refresh === 'function'
      ? await window.__AGT_I18N.refresh()
      : window.__AGT_I18N.getState();

    if (typeof window.__AGT.refreshOverlayI18n === 'function') {
      window.__AGT.refreshOverlayI18n();
    }
    syncSelectionCounter();
    return state;
  }

  // ──────────────────────────────────────────
  // popup / background 메시지 핸들러
  // ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message || {};

    if (type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }

    if (type === 'I18N_REFRESH') {
      void syncI18nState().then((state) => {
        if (C.IS_TOP_FRAME) {
          C.broadcastCommandToChildFrames({ cmd: 'I18N_REFRESH' });
        }
        sendResponse({ ok: true, locale: state && state.locale });
      });
      return true;
    }

    switch (type) {
      case 'TOGGLE_ACTIVE': {
        if (C.State.isActive) C.deactivate();
        else C.activate();
        sendResponse(getStateSnapshot());
        break;
      }
      case 'GET_STATE': {
        sendResponse(getStateSnapshot());
        break;
      }
      case 'UNDO': {
        undo();
        sendResponse(getStateSnapshot());
        break;
      }
      case 'REDO': {
        redo();
        sendResponse(getStateSnapshot());
        break;
      }
      case 'REMOVE_SELECTION': {
        if (payload && payload.id) removeSelection(payload.id);
        sendResponse(getStateSnapshot());
        break;
      }
      case 'CLEAR_ALL': {
        clearAll();
        sendResponse(getStateSnapshot());
        break;
      }
      case 'SEARCH': {
        const result = search(payload && payload.query);
        sendResponse(result);
        break;
      }
      case 'CLEAR_SEARCH': {
        window.__AGT.clearSearchHighlights();
        sendResponse({ ok: true });
        break;
      }
      case 'GET_EXPORT': {
        const format = payload && payload.format;
        const exportSelections = C.getSelectionsForExport();
        if (format === 'ai') {
          sendResponse({ data: window.__AGT.exportAI(exportSelections) });
        } else if (format === 'plain') {
          sendResponse({ data: window.__AGT.exportPlain(exportSelections) });
        } else if (format === 'markdown') {
          sendResponse({ data: window.__AGT.exportMarkdown(exportSelections) });
        } else {
          sendResponse({ data: window.__AGT.exportJSON(exportSelections) });
        }
        break;
      }
      case 'GET_HIGHLIGHT_COLORS': {
        sendResponse(getHighlightColors());
        break;
      }
      case 'SET_HIGHLIGHT_COLORS': {
        const appliedColors = applyHighlightColors(payload || {}) || getHighlightColors() || payload || null;
        if (C.IS_TOP_FRAME) {
          C.broadcastCommandToChildFrames({ cmd: 'SET_HIGHLIGHT_COLORS', colors: appliedColors || {} });
        }
        chrome.storage.local.set({
          [C.HIGHLIGHT_COLOR_STORAGE_KEY]: appliedColors
        }).catch(() => {});
        sendResponse({ ok: true, colors: appliedColors });
        break;
      }
      case 'GET_MARKER_VISIBILITY': {
        sendResponse({ visible: getMarkerVisibility() });
        break;
      }
      case 'SET_MARKER_VISIBILITY': {
        const requestedVisible = !!(payload && payload.visible);
        const appliedVisible = applyMarkerVisibility(requestedVisible);
        const finalVisible = typeof appliedVisible === 'boolean' ? appliedVisible : requestedVisible;
        if (C.IS_TOP_FRAME) {
          C.broadcastCommandToChildFrames({ cmd: 'SET_MARKER_VISIBILITY', visible: finalVisible });
        }
        chrome.storage.local.set({
          [C.MARKER_VISIBILITY_STORAGE_KEY]: finalVisible
        }).catch(() => {});
        sendResponse({ ok: true, visible: finalVisible });
        break;
      }
      case 'EDIT_ANNOTATION': {
        if (payload && payload.id) {
          const parsed = C.parseAggregateSelectionId(payload.id);
          if (parsed.kind === 'frame-root') {
            sendResponse(getStateSnapshot());
            break;
          }
          if (parsed.kind === 'frame-item' && C.IS_TOP_FRAME) {
            const nextAnnotation = typeof payload.annotation === 'string' ? payload.annotation : '';
            C.sendCommandToFrameKey(parsed.frameKey, {
              cmd: 'EDIT_ANNOTATION',
              id: parsed.selectionId,
              annotation: nextAnnotation
            });
            C.editChildSelectionAnnotationInMap(parsed.frameKey, parsed.selectionId, nextAnnotation);
            broadcastState();
            sendResponse(getStateSnapshot());
            break;
          }

          const sel = C.State.selections.find(s => s.id === parsed.id);
          if (sel) {
            C.pushUndo();
            sel.annotation = typeof payload.annotation === 'string' ? payload.annotation : '';
            saveToStorage();
            broadcastState();
          }
        }
        sendResponse(getStateSnapshot());
        break;
      }
      default: {
        sendResponse({ error: 'unknown message type' });
      }
    }

    return false;
  });

  // ──────────────────────────────────────────
  // 네임스페이스 노출
  // ──────────────────────────────────────────
  Object.assign(C, {
    undo,
    redo,
    refreshHighlights,
    syncHighlightOrderNumbers,
    removeSelection,
    clearAll,
    search,
    saveToStorage,
    loadFromStorage,
    loadHighlightColorsFromStorage,
    loadMarkerVisibilityFromStorage,
    broadcastState,
    syncSelectionCounter,
    getStateSnapshot,
    applyHighlightColors,
    getHighlightColors,
    applyMarkerVisibility,
    getMarkerVisibility,
    syncI18nState
  });
})();
