/**
 * content.js — 메인 컨트롤러
 * 이벤트 처리, 상태 관리, popup/background 통신
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────
  // 상태
  // ──────────────────────────────────────────
  const State = {
    isActive: false,
    selections: [],        // 수집된 요소 데이터 배열
    undoStack: [],         // 스냅샷 스택
    redoStack: [],
    hoveredEl: null,
    isPointerDown: false,
    dragStartX: 0,
    dragStartY: 0,
    didDrag: false,
    skipNextClick: false
  };

  const MAX_UNDO = 50;
  const TOGGLE_SHORTCUT_KEY = 'x';
  const DRAG_THRESHOLD_PX = 6;
  const HIGHLIGHT_COLOR_STORAGE_KEY = 'agt_highlight_colors';
  const MARKER_VISIBILITY_STORAGE_KEY = 'agt_marker_visibility';
  const I18N_LOCALE_STORAGE_KEY = 'agt_locale';

  // ──────────────────────────────────────────
  // 스냅샷 (깊은 복사)
  // ──────────────────────────────────────────
  function snapshot(arr) {
    return JSON.parse(JSON.stringify(arr));
  }

  function pushUndo() {
    State.undoStack.push(snapshot(State.selections));
    if (State.undoStack.length > MAX_UNDO) State.undoStack.shift();
    State.redoStack = [];
  }

  // ──────────────────────────────────────────
  // 활성화 / 비활성화
  // ──────────────────────────────────────────
  function activate() {
    if (State.isActive) return;
    State.isActive = true;
    window.__AGT.initOverlay();
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    notifyBackground();
    broadcastState();
  }

  function deactivate() {
    if (!State.isActive) return;
    State.isActive = false;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    resetPointerTracking();
    window.__AGT.clearHover();
    window.__AGT.clearSearchHighlights();
    notifyBackground();
    broadcastState();
  }

  function notifyBackground() {
    chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_STATE',
      payload: { isActive: State.isActive }
    }).catch(() => {});
  }

  function onGlobalKeyDown(e) {
    if (!isToggleShortcut(e)) return;
    if (isEditableTarget(e.target)) return;
    if (document.getElementById('__agentation-popover__')) return;

    e.preventDefault();
    e.stopPropagation();

    if (State.isActive) deactivate();
    else activate();
  }

  function isToggleShortcut(e) {
    const key = String(e.key || '').toLowerCase();
    return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && key === TOGGLE_SHORTCUT_KEY;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    if (target.closest('[contenteditable=\"true\"]')) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // ──────────────────────────────────────────
  // 이벤트 핸들러
  // ──────────────────────────────────────────
  function onMouseOver(e) {
    const el = e.target;
    if (window.__AGT.isOwnElement(el)) return;

    State.hoveredEl = el;
    const sel = window.__AGT.generateSelector(el);
    window.__AGT.showHover(el, {
      selector: sel.selector,
      tagName: el.tagName
    });
  }

  function onMouseOut(e) {
    if (window.__AGT.isOwnElement(e.target)) return;
    // relatedTarget이 없거나 자체 UI면 hover 제거
    const to = e.relatedTarget;
    if (!to || window.__AGT.isOwnElement(to)) {
      window.__AGT.clearHover();
      State.hoveredEl = null;
    }
  }

  function onMouseDown(e) {
    if (window.__AGT.isOwnElement(e.target)) return;
    State.isPointerDown = true;
    State.dragStartX = e.clientX;
    State.dragStartY = e.clientY;
    State.didDrag = false;
    State.skipNextClick = false;
  }

  function onMouseMove(e) {
    if (!State.isPointerDown || State.didDrag) return;
    const dx = e.clientX - State.dragStartX;
    const dy = e.clientY - State.dragStartY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      State.didDrag = true;
    }
  }

  function onMouseUp() {
    if (!State.isPointerDown) return;
    State.isPointerDown = false;
    if (State.didDrag) {
      State.skipNextClick = true;
    }
    State.didDrag = false;
  }

  function resetPointerTracking() {
    State.isPointerDown = false;
    State.dragStartX = 0;
    State.dragStartY = 0;
    State.didDrag = false;
    State.skipNextClick = false;
  }

  function onClick(e) {
    const el = e.target;
    if (window.__AGT.isOwnElement(el)) return;
    if (shouldIgnoreClickSelection(el)) return;

    e.preventDefault();
    e.stopPropagation();

    // 이미 팝오버가 열려있으면 닫기만
    if (document.getElementById('__agentation-popover__')) {
      window.__AGT.hideAnnotationPopover();
      return;
    }

    const data = window.__AGT.collectElementData(el);
    if (!data) return;

    // 호버 하이라이트를 임시 선택 색으로 전환 (팝오버 열린 동안)
    window.__AGT.clearHover();
    window.__AGT.addSelectedHighlight(el, '__pending__');

    window.__AGT.showAnnotationPopover(
      el,
      {
        tagName: data.tagName,
        selector: data.selector,
        innerText: data.innerText
      },
      // Add 클릭
      function (annotationText) {
        window.__AGT.removeSelectedHighlight('__pending__');
        data.annotation = annotationText;
        pushUndo();
        State.selections.push(data);
        window.__AGT.addSelectedHighlight(el, data.id, State.selections.length);
        syncHighlightOrderNumbers();
        saveToStorage();
        broadcastState();
      },
      // Cancel 클릭
      function () {
        window.__AGT.removeSelectedHighlight('__pending__');
      }
    );
  }

  function shouldIgnoreClickSelection(el) {
    if (State.skipNextClick) {
      State.skipNextClick = false;
      return true;
    }

    if (isGlobalContainerElement(el)) {
      return true;
    }

    const selection = window.getSelection();
    if (selection && selection.type === 'Range' && String(selection).trim().length > 0) {
      return true;
    }

    return false;
  }

  function isGlobalContainerElement(el) {
    if (!(el instanceof Element)) return false;
    if (el === document.documentElement || el === document.body) return true;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const widthRatio = rect.width / Math.max(window.innerWidth, 1);
    const heightRatio = rect.height / Math.max(window.innerHeight, 1);
    return widthRatio >= 0.9 && heightRatio >= 0.75;
  }

  function onKeyDown(e) {
    // 팝오버가 열려있으면 keydown 처리 위임 (팝오버 내부 textarea가 자체 처리)
    if (document.getElementById('__agentation-popover__')) return;

    // Escape → 비활성화
    if (e.key === 'Escape') {
      deactivate();
      return;
    }
    // Ctrl+Z → Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      undo();
      return;
    }
    // Ctrl+Y 또는 Ctrl+Shift+Z → Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      e.stopPropagation();
      redo();
    }
  }

  // ──────────────────────────────────────────
  // Undo / Redo
  // ──────────────────────────────────────────
  function undo() {
    if (State.undoStack.length === 0) return;
    State.redoStack.push(snapshot(State.selections));
    State.selections = State.undoStack.pop();
    refreshHighlights();
    saveToStorage();
    broadcastState();
  }

  function redo() {
    if (State.redoStack.length === 0) return;
    State.undoStack.push(snapshot(State.selections));
    State.selections = State.redoStack.pop();
    refreshHighlights();
    saveToStorage();
    broadcastState();
  }

  /**
   * 현재 selections 기준으로 하이라이트 재구성
   * (undo/redo 후 DOM 요소 재탐색)
   */
  function refreshHighlights() {
    window.__AGT.clearAllHighlights();
    State.selections.forEach((data, index) => {
      const el = window.__AGT.safeQuerySelector(data.selector);
      if (el) {
        window.__AGT.addSelectedHighlight(el, data.id, index + 1);
      }
    });
  }

  function syncHighlightOrderNumbers() {
    if (typeof window.__AGT.updateSelectedHighlightOrder !== 'function') return;
    State.selections.forEach((data, index) => {
      window.__AGT.updateSelectedHighlightOrder(data.id, index + 1);
    });
  }

  // ──────────────────────────────────────────
  // 단일 선택 삭제
  // ──────────────────────────────────────────
  function removeSelection(id) {
    pushUndo();
    State.selections = State.selections.filter(s => s.id !== id);
    window.__AGT.removeSelectedHighlight(id);
    syncHighlightOrderNumbers();
    saveToStorage();
    broadcastState();
  }

  // ──────────────────────────────────────────
  // 전체 삭제
  // ──────────────────────────────────────────
  function clearAll() {
    pushUndo();
    State.selections = [];
    window.__AGT.clearAllHighlights();
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

    // 첫 결과로 스크롤
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
        selections: State.selections,
        savedAt: Date.now()
      }
    }).catch(() => {});
  }

  function loadFromStorage() {
    const key = `agt_${location.hostname}`;
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          State.selections = [];
          resolve(false);
          return;
        }

        const saved = result[key];
        if (saved && saved.url === location.href && Array.isArray(saved.selections)) {
          State.selections = saved.selections;
          resolve(true);
          return;
        }

        State.selections = [];
        resolve(false);
      });
    });
  }

  function loadHighlightColorsFromStorage() {
    chrome.storage.local.get(HIGHLIGHT_COLOR_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) return;
      const saved = result ? result[HIGHLIGHT_COLOR_STORAGE_KEY] : null;
      if (saved) applyHighlightColors(saved);
    });
  }

  function loadMarkerVisibilityFromStorage() {
    chrome.storage.local.get(MARKER_VISIBILITY_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) return;
      if (typeof (result && result[MARKER_VISIBILITY_STORAGE_KEY]) === 'boolean') {
        applyMarkerVisibility(result[MARKER_VISIBILITY_STORAGE_KEY]);
      }
    });
  }

  // ──────────────────────────────────────────
  // 팝업에 상태 브로드캐스트
  // ──────────────────────────────────────────
  function broadcastState() {
    syncSelectionCounter();
    chrome.runtime.sendMessage({
      type: 'STATE_UPDATE',
      payload: getStateSnapshot()
    }).catch(() => {});
  }

  function syncSelectionCounter() {
    if (typeof window.__AGT.updateSelectionCounter !== 'function') return;
    window.__AGT.updateSelectionCounter(State.selections.length, State.isActive);
  }

  function getStateSnapshot() {
    return {
      isActive: State.isActive,
      selections: State.selections,
      canUndo: State.undoStack.length > 0,
      canRedo: State.redoStack.length > 0,
      url: location.href
    };
  }

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
  // popup / background에서 오는 메시지 처리
  // ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message || {};

    if (type === 'I18N_REFRESH') {
      void syncI18nState().then((state) => {
        sendResponse({ ok: true, locale: state && state.locale });
      });
      return true;
    }

    switch (type) {
      case 'TOGGLE_ACTIVE': {
        if (State.isActive) deactivate();
        else activate();
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
        if (format === 'ai') {
          sendResponse({ data: window.__AGT.exportAI(State.selections) });
        } else if (format === 'plain') {
          sendResponse({ data: window.__AGT.exportPlain(State.selections) });
        } else if (format === 'markdown') {
          sendResponse({ data: window.__AGT.exportMarkdown(State.selections) });
        } else {
          sendResponse({ data: window.__AGT.exportJSON(State.selections) });
        }
        break;
      }
      case 'GET_HIGHLIGHT_COLORS': {
        sendResponse(getHighlightColors());
        break;
      }
      case 'SET_HIGHLIGHT_COLORS': {
        const appliedColors = applyHighlightColors(payload || {}) || getHighlightColors() || payload || null;
        chrome.storage.local.set({
          [HIGHLIGHT_COLOR_STORAGE_KEY]: appliedColors
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
        chrome.storage.local.set({
          [MARKER_VISIBILITY_STORAGE_KEY]: finalVisible
        }).catch(() => {});
        sendResponse({ ok: true, visible: finalVisible });
        break;
      }
      case 'EDIT_ANNOTATION': {
        if (payload && payload.id) {
          const sel = State.selections.find(s => s.id === payload.id);
          if (sel) {
            pushUndo();
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

    return false; // 동기 응답
  });

  // ──────────────────────────────────────────
  // SPA 라우트 변경 감지
  // ──────────────────────────────────────────
  let lastUrl = location.href;
  let routeLoadToken = 0;

  function handleRouteChange() {
    const nextUrl = location.href;
    if (nextUrl === lastUrl) return;
    lastUrl = nextUrl;
    routeLoadToken += 1;
    const token = routeLoadToken;

    // 페이지 전환 시 이전 페이지의 시각 상태를 즉시 제거
    window.__AGT.clearAllHighlights();
    window.__AGT.clearSearchHighlights();
    window.__AGT.clearHover();
    if (typeof window.__AGT.hideAnnotationPopover === 'function') {
      window.__AGT.hideAnnotationPopover();
    }

    State.undoStack = [];
    State.redoStack = [];
    State.hoveredEl = null;

    // 새 URL 기준 저장 상태 로드 (없으면 빈 상태 유지)
    void loadFromStorage().then((hasSaved) => {
      if (token !== routeLoadToken) return;
      if (State.isActive && hasSaved) {
        refreshHighlights();
        syncHighlightOrderNumbers();
      }
      broadcastState();
    });
  }

  function scheduleRouteCheck() {
    setTimeout(handleRouteChange, 0);
  }

  function patchHistoryMethod(methodName) {
    const original = history[methodName];
    if (typeof original !== 'function') return;

    history[methodName] = function patchedHistoryMethod() {
      const result = original.apply(this, arguments);
      scheduleRouteCheck();
      return result;
    };
  }

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  window.addEventListener('popstate', handleRouteChange, true);
  window.addEventListener('hashchange', handleRouteChange, true);

  const routeObserver = new MutationObserver(() => {
    handleRouteChange();
  });

  routeObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.prototype.hasOwnProperty.call(changes, I18N_LOCALE_STORAGE_KEY)) return;
    void syncI18nState();
  });

  // ──────────────────────────────────────────
  // 초기화
  // ──────────────────────────────────────────
  document.addEventListener('keydown', onGlobalKeyDown, true);
  void syncI18nState();
  loadHighlightColorsFromStorage();
  loadMarkerVisibilityFromStorage();
  void loadFromStorage().then((hasSaved) => {
    if (State.isActive && hasSaved) {
      refreshHighlights();
      syncHighlightOrderNumbers();
    }
    broadcastState();
  });

})();
