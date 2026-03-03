/**
 * content.js — 메인 컨트롤러
 * 이벤트 처리, 상태 관리, popup/background 통신
 */

(function () {
  'use strict';

  if (window.__AGT_CONTENT_INITIALIZED__) return;
  window.__AGT_CONTENT_INITIALIZED__ = true;

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
    skipNextClick: false,
    lastHoveredIframe: null,
    lastHoveredIframeAt: 0
  };

  const MAX_UNDO = 50;
  const TOGGLE_SHORTCUT_KEY = 'x';
  const DRAG_THRESHOLD_PX = 6;
  const HIGHLIGHT_COLOR_STORAGE_KEY = 'agt_highlight_colors';
  const MARKER_VISIBILITY_STORAGE_KEY = 'agt_marker_visibility';
  const I18N_LOCALE_STORAGE_KEY = 'agt_locale';
  const FRAME_BRIDGE_FLAG = '__agtFrameBridge__';
  const FRAME_SYNC_TYPE = 'AGT_FRAME_SYNC';
  const FRAME_HELLO_TYPE = 'AGT_FRAME_HELLO';
  const FRAME_CMD_TYPE = 'AGT_FRAME_CMD';
  const FRAME_KEY_ATTR = 'data-agt-frame-key';
  const IS_TOP_FRAME = window.top === window;
  const frameWindowByKey = new Map(); // frameKey -> WindowProxy
  const frameKeyByWindow = new Map(); // WindowProxy -> frameKey
  const childFrameSelectionMap = new Map(); // frameKey -> { frameInfo, selections }

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

  function postFrameBridgeMessage(targetWindow, type, payload) {
    if (!targetWindow || typeof targetWindow.postMessage !== 'function') return;
    targetWindow.postMessage({
      [FRAME_BRIDGE_FLAG]: true,
      type,
      payload: payload || null
    }, '*');
  }

  function postFrameSyncToTop() {
    if (IS_TOP_FRAME) return;
    postFrameBridgeMessage(window.top, FRAME_SYNC_TYPE, {
      frameUrl: location.href,
      frameTitle: document.title || '',
      selections: snapshot(State.selections)
    });
  }

  function postFrameHelloToTop() {
    if (IS_TOP_FRAME) return;
    postFrameBridgeMessage(window.top, FRAME_HELLO_TYPE, {
      frameUrl: location.href,
      frameTitle: document.title || ''
    });
  }

  function getFrameElementByWindow(frameWindow) {
    const frames = document.querySelectorAll('iframe,frame');
    for (const frameEl of frames) {
      try {
        if (frameEl.contentWindow === frameWindow) return frameEl;
      } catch (_err) {
        continue;
      }
    }
    return null;
  }

  function getFrameElementByKey(frameKey) {
    if (!frameKey) return null;
    return document.querySelector(`[${FRAME_KEY_ATTR}="${frameKey}"]`);
  }

  function ensureFrameKey(frameEl) {
    if (!(frameEl instanceof Element)) return '';
    let frameKey = frameEl.getAttribute(FRAME_KEY_ATTR) || '';
    if (frameKey) return frameKey;
    frameKey = `fr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    frameEl.setAttribute(FRAME_KEY_ATTR, frameKey);
    return frameKey;
  }

  function buildFrameInfo(frameKey, frameEl, payload) {
    const selectorInfo = window.__AGT.generateSelector(frameEl);
    const rect = frameEl.getBoundingClientRect();
    const frameLabel = frameEl.getAttribute('title')
      || frameEl.getAttribute('name')
      || frameEl.id
      || frameEl.className
      || frameEl.tagName.toLowerCase();

    return {
      frameKey,
      selector: selectorInfo && selectorInfo.selector ? selectorInfo.selector : 'iframe',
      strategy: selectorInfo && selectorInfo.strategy ? selectorInfo.strategy : 'frame',
      tagName: frameEl.tagName || 'IFRAME',
      label: String(frameLabel || 'iframe').trim(),
      frameUrl: payload && typeof payload.frameUrl === 'string' ? payload.frameUrl : '',
      frameTitle: payload && typeof payload.frameTitle === 'string' ? payload.frameTitle : '',
      boundingBox: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function buildChildAggregateId(frameKey, rawSelectionId) {
    return `frame::${frameKey}::${rawSelectionId}`;
  }

  function buildFrameRootId(frameKey) {
    return `frame-root::${frameKey}`;
  }

  function parseAggregateSelectionId(id) {
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

  function augmentChildSelection(frameInfo, selection, index) {
    const safeSelection = selection && typeof selection === 'object' ? selection : {};
    const rawId = typeof safeSelection.id === 'string' ? safeSelection.id : `${Date.now()}_${index}`;
    const selectorInFrame = typeof safeSelection.selector === 'string' ? safeSelection.selector : '';
    const composedSelector = frameInfo.selector
      ? `${frameInfo.selector} >>> ${selectorInFrame}`
      : selectorInFrame;

    return Object.assign({}, safeSelection, {
      id: buildChildAggregateId(frameInfo.frameKey, rawId),
      rawSelectionId: rawId,
      frameKey: frameInfo.frameKey,
      frameUrl: frameInfo.frameUrl,
      frameTitle: frameInfo.frameTitle,
      frameSelector: frameInfo.selector,
      frameLabel: frameInfo.label,
      selectorInFrame,
      selector: composedSelector,
      isFrameChild: true
    });
  }

  function buildFrameRootSelection(frameInfo, childCount) {
    return {
      id: buildFrameRootId(frameInfo.frameKey),
      tagName: frameInfo.tagName || 'IFRAME',
      selector: frameInfo.selector || 'iframe',
      strategy: frameInfo.strategy || 'frame',
      innerText: frameInfo.frameTitle || frameInfo.label || '',
      annotation: '',
      boundingBox: frameInfo.boundingBox,
      frameKey: frameInfo.frameKey,
      frameUrl: frameInfo.frameUrl || '',
      frameTitle: frameInfo.frameTitle || '',
      frameLabel: frameInfo.label || '',
      childCount: childCount || 0,
      isFrameRoot: true,
      syntheticFrameRoot: true
    };
  }

  function pruneDetachedFrameSelections() {
    if (!IS_TOP_FRAME) return;
    Array.from(childFrameSelectionMap.keys()).forEach((frameKey) => {
      const frameEl = getFrameElementByKey(frameKey);
      if (frameEl) return;
      childFrameSelectionMap.delete(frameKey);
      const frameWindow = frameWindowByKey.get(frameKey);
      if (frameWindow) frameKeyByWindow.delete(frameWindow);
      frameWindowByKey.delete(frameKey);
    });
  }

  function getDisplaySelections() {
    if (!IS_TOP_FRAME) return State.selections;

    pruneDetachedFrameSelections();

    const list = [];
    const frameRootIndexByKey = new Map();
    State.selections.forEach((sel) => {
      const tagName = String(sel && sel.tagName || '').toUpperCase();
      const isFrameRoot = !!(sel && sel.frameKey && (tagName === 'IFRAME' || tagName === 'FRAME'));
      const copy = Object.assign({}, sel, {
        isFrameRoot,
        isFrameChild: false
      });
      const index = list.push(copy) - 1;
      if (isFrameRoot) {
        frameRootIndexByKey.set(copy.frameKey, index);
      }
    });

    const pendingInsertions = [];

    childFrameSelectionMap.forEach((entry) => {
      const frameInfo = entry && entry.frameInfo ? entry.frameInfo : null;
      const childSelections = entry && Array.isArray(entry.selections) ? entry.selections : [];
      if (!frameInfo || childSelections.length === 0) return;

      if (frameRootIndexByKey.has(frameInfo.frameKey)) {
        const rootIndex = frameRootIndexByKey.get(frameInfo.frameKey);
        const rootSel = list[rootIndex];
        if (rootSel) {
          rootSel.childCount = childSelections.length;
          rootSel.frameUrl = frameInfo.frameUrl || rootSel.frameUrl || '';
          rootSel.frameTitle = frameInfo.frameTitle || rootSel.frameTitle || '';
          rootSel.frameLabel = frameInfo.label || rootSel.frameLabel || '';
          rootSel.syntheticFrameRoot = false;
        }
        pendingInsertions.push({
          index: rootIndex + 1,
          items: childSelections
        });
        return;
      }

      pendingInsertions.push({
        index: list.length,
        items: [buildFrameRootSelection(frameInfo, childSelections.length)].concat(childSelections)
      });
    });

    pendingInsertions.sort((a, b) => a.index - b.index);
    let offset = 0;
    pendingInsertions.forEach((insertion) => {
      if (!insertion || !Array.isArray(insertion.items) || insertion.items.length === 0) return;
      const at = Math.max(0, Math.min(list.length, insertion.index + offset));
      list.splice(at, 0, ...insertion.items);
      offset += insertion.items.length;
    });

    return list;
  }

  function getSelectionCount() {
    if (!IS_TOP_FRAME) return State.selections.length;
    let childCount = 0;
    childFrameSelectionMap.forEach((entry) => {
      const childSelections = entry && Array.isArray(entry.selections) ? entry.selections : [];
      childCount += childSelections.length;
    });
    return State.selections.length + childCount;
  }

  function getSelectionsForExport() {
    if (!IS_TOP_FRAME) return State.selections;
    const merged = snapshot(State.selections);
    childFrameSelectionMap.forEach((entry) => {
      const frameInfo = entry && entry.frameInfo ? entry.frameInfo : null;
      const childSelections = entry && Array.isArray(entry.selections) ? entry.selections : [];
      childSelections.forEach((sel) => {
        merged.push(Object.assign({}, sel, {
          id: sel.rawSelectionId || sel.id,
          selector: sel.selectorInFrame || sel.selector,
          frameContext: frameInfo ? {
            frameSelector: frameInfo.selector,
            frameUrl: frameInfo.frameUrl,
            frameTitle: frameInfo.frameTitle,
            frameLabel: frameInfo.label,
            composedSelector: sel.selector
          } : null
        }));
      });
    });
    return merged;
  }

  function broadcastCommandToChildFrames(commandPayload) {
    if (!IS_TOP_FRAME) return;
    const frames = document.querySelectorAll('iframe,frame');
    frames.forEach((frameEl) => {
      try {
        if (!frameEl.contentWindow) return;
        postFrameBridgeMessage(frameEl.contentWindow, FRAME_CMD_TYPE, commandPayload);
      } catch (_err) {
        // ignore
      }
    });
  }

  function sendCommandToFrameKey(frameKey, commandPayload) {
    const targetWindow = frameWindowByKey.get(frameKey);
    if (!targetWindow) return false;
    postFrameBridgeMessage(targetWindow, FRAME_CMD_TYPE, commandPayload);
    return true;
  }

  function removeChildSelectionInMap(frameKey, rawSelectionId) {
    const entry = childFrameSelectionMap.get(frameKey);
    if (!entry || !Array.isArray(entry.selections)) return false;
    const nextSelections = entry.selections.filter((sel) => sel.rawSelectionId !== rawSelectionId);
    childFrameSelectionMap.set(frameKey, {
      frameInfo: entry.frameInfo,
      selections: nextSelections
    });
    return nextSelections.length > 0;
  }

  function clearChildFrameInMap(frameKey) {
    childFrameSelectionMap.delete(frameKey);
  }

  function clearAllChildFramesInMap() {
    childFrameSelectionMap.clear();
  }

  function editChildSelectionAnnotationInMap(frameKey, rawSelectionId, annotation) {
    const entry = childFrameSelectionMap.get(frameKey);
    if (!entry || !Array.isArray(entry.selections)) return false;
    let updated = false;
    const nextSelections = entry.selections.map((sel) => {
      if (sel.rawSelectionId !== rawSelectionId) return sel;
      updated = true;
      return Object.assign({}, sel, { annotation });
    });
    if (!updated) return false;
    childFrameSelectionMap.set(frameKey, {
      frameInfo: entry.frameInfo,
      selections: nextSelections
    });
    return true;
  }

  // ──────────────────────────────────────────
  // 활성화 / 비활성화
  // ──────────────────────────────────────────
  function activate(options) {
    if (State.isActive) return;
    const fromParent = !!(options && options.fromParent);
    State.isActive = true;
    window.__AGT.initOverlay();
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur, true);
    if (IS_TOP_FRAME && !fromParent) {
      broadcastCommandToChildFrames({ cmd: 'SET_ACTIVE', active: true });
      notifyBackground();
    }
    broadcastState();
  }

  function deactivate(options) {
    if (!State.isActive) return;
    const fromParent = !!(options && options.fromParent);
    State.isActive = false;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onWindowBlur, true);
    resetPointerTracking();
    window.__AGT.clearHover();
    window.__AGT.clearSearchHighlights();
    if (IS_TOP_FRAME && !fromParent) {
      broadcastCommandToChildFrames({ cmd: 'SET_ACTIVE', active: false });
      notifyBackground();
    }
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

    if (!IS_TOP_FRAME) {
      postFrameBridgeMessage(window.top, FRAME_CMD_TYPE, { cmd: 'TOGGLE_ACTIVE' });
      return;
    }

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
    if (el instanceof HTMLIFrameElement) {
      State.lastHoveredIframe = el;
      State.lastHoveredIframeAt = Date.now();
    }
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
    startSelectionFlow(el, { closeIfOpen: true });
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

  function onWindowBlur() {
    if (!State.isActive) return;
    const activeEl = document.activeElement;
    if (!(activeEl instanceof HTMLIFrameElement)) return;

    const justHoveredSameIframe = (
      State.lastHoveredIframe === activeEl &&
      Date.now() - State.lastHoveredIframeAt <= 1000
    );
    if (!justHoveredSameIframe) return;

    startSelectionFlow(activeEl, { closeIfOpen: false });
  }

  function startSelectionFlow(el, options) {
    if (!(el instanceof Element)) return;
    const closeIfOpen = !options || options.closeIfOpen !== false;

    // 이미 팝오버가 열려있으면 닫기만
    if (document.getElementById('__agentation-popover__')) {
      if (closeIfOpen) window.__AGT.hideAnnotationPopover();
      return;
    }

    const data = window.__AGT.collectElementData(el);
    if (!data) return;
    const tagName = String(el.tagName || '').toUpperCase();
    if (IS_TOP_FRAME && (tagName === 'IFRAME' || tagName === 'FRAME')) {
      const frameKey = ensureFrameKey(el);
      if (frameKey) {
        data.frameKey = frameKey;
        data.isFrameRoot = true;
      }
    }

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

  function handleFrameSyncMessage(sourceWindow, payload) {
    if (!IS_TOP_FRAME) return;
    const frameEl = getFrameElementByWindow(sourceWindow);
    if (!(frameEl instanceof Element)) return;

    const frameKey = ensureFrameKey(frameEl);
    if (!frameKey) return;

    frameWindowByKey.set(frameKey, sourceWindow);
    frameKeyByWindow.set(sourceWindow, frameKey);

    const frameInfo = buildFrameInfo(frameKey, frameEl, payload || {});
    const rawSelections = Array.isArray(payload && payload.selections) ? payload.selections : [];
    const childSelections = rawSelections.map((sel, index) => augmentChildSelection(frameInfo, sel, index));

    if (childSelections.length === 0) {
      childFrameSelectionMap.delete(frameKey);
      broadcastState();
      return;
    }

    childFrameSelectionMap.set(frameKey, {
      frameInfo,
      selections: childSelections
    });
    broadcastState();
  }

  function handleFrameHelloMessage(sourceWindow, payload) {
    if (!IS_TOP_FRAME) return;
    const frameEl = getFrameElementByWindow(sourceWindow);
    if (!(frameEl instanceof Element)) return;

    const frameKey = ensureFrameKey(frameEl);
    if (!frameKey) return;
    frameWindowByKey.set(frameKey, sourceWindow);
    frameKeyByWindow.set(sourceWindow, frameKey);

    const frameInfo = buildFrameInfo(frameKey, frameEl, payload || {});
    sendCommandToFrameKey(frameKey, { cmd: 'SET_ACTIVE', active: State.isActive });
    sendCommandToFrameKey(frameKey, { cmd: 'SET_HIGHLIGHT_COLORS', colors: getHighlightColors() });
    sendCommandToFrameKey(frameKey, { cmd: 'SET_MARKER_VISIBILITY', visible: getMarkerVisibility() });

    if (!childFrameSelectionMap.has(frameKey)) {
      childFrameSelectionMap.set(frameKey, {
        frameInfo,
        selections: []
      });
    }
  }

  function onFrameBridgeMessage(event) {
    if (!event || event.source === window) return;
    const data = event.data;
    if (!data || data[FRAME_BRIDGE_FLAG] !== true) return;

    if (data.type === FRAME_SYNC_TYPE) {
      handleFrameSyncMessage(event.source, data.payload || {});
      return;
    }

    if (data.type === FRAME_HELLO_TYPE) {
      handleFrameHelloMessage(event.source, data.payload || {});
      return;
    }

    if (data.type !== FRAME_CMD_TYPE) return;
    const command = data.payload || {};
    const cmd = command.cmd;

    if (IS_TOP_FRAME) {
      if (cmd === 'TOGGLE_ACTIVE') {
        if (State.isActive) deactivate();
        else activate();
      }
      return;
    }

    if (cmd === 'SET_ACTIVE') {
      if (command.active) activate({ fromParent: true });
      else deactivate({ fromParent: true });
      return;
    }

    if (cmd === 'REMOVE_SELECTION') {
      if (command.id) removeSelection(command.id);
      return;
    }

    if (cmd === 'CLEAR_ALL') {
      clearAll();
      return;
    }

    if (cmd === 'EDIT_ANNOTATION') {
      if (!command.id) return;
      const sel = State.selections.find((item) => item.id === command.id);
      if (!sel) return;
      pushUndo();
      sel.annotation = typeof command.annotation === 'string' ? command.annotation : '';
      saveToStorage();
      broadcastState();
      return;
    }

    if (cmd === 'SET_HIGHLIGHT_COLORS') {
      applyHighlightColors(command.colors || {});
      return;
    }

    if (cmd === 'SET_MARKER_VISIBILITY') {
      applyMarkerVisibility(command.visible);
      return;
    }

    if (cmd === 'I18N_REFRESH') {
      void syncI18nState();
    }
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
    const parsed = parseAggregateSelectionId(id);

    if (parsed.kind === 'frame-root' && IS_TOP_FRAME) {
      sendCommandToFrameKey(parsed.frameKey, { cmd: 'CLEAR_ALL' });
      clearChildFrameInMap(parsed.frameKey);
      broadcastState();
      return;
    }

    if (parsed.kind === 'frame-item' && IS_TOP_FRAME) {
      sendCommandToFrameKey(parsed.frameKey, { cmd: 'REMOVE_SELECTION', id: parsed.selectionId });
      removeChildSelectionInMap(parsed.frameKey, parsed.selectionId);
      broadcastState();
      return;
    }

    const targetSelection = State.selections.find((item) => item.id === parsed.id);
    if (IS_TOP_FRAME && targetSelection && targetSelection.frameKey) {
      sendCommandToFrameKey(targetSelection.frameKey, { cmd: 'CLEAR_ALL' });
      clearChildFrameInMap(targetSelection.frameKey);
    }

    pushUndo();
    State.selections = State.selections.filter(s => s.id !== parsed.id);
    window.__AGT.removeSelectedHighlight(parsed.id);
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
    if (IS_TOP_FRAME) {
      broadcastCommandToChildFrames({ cmd: 'CLEAR_ALL' });
      clearAllChildFramesInMap();
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
    if (IS_TOP_FRAME) {
      chrome.runtime.sendMessage({
        type: 'STATE_UPDATE',
        payload: getStateSnapshot()
      }).catch(() => {});
    } else {
      postFrameSyncToTop();
    }
  }

  function syncSelectionCounter() {
    if (typeof window.__AGT.updateSelectionCounter !== 'function') return;
    window.__AGT.updateSelectionCounter(getSelectionCount(), State.isActive);
  }

  function getStateSnapshot() {
    return {
      isActive: State.isActive,
      selections: getDisplaySelections(),
      selectionCount: getSelectionCount(),
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

    if (type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }

    if (type === 'I18N_REFRESH') {
      void syncI18nState().then((state) => {
        if (IS_TOP_FRAME) {
          broadcastCommandToChildFrames({ cmd: 'I18N_REFRESH' });
        }
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
        const exportSelections = getSelectionsForExport();
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
        if (IS_TOP_FRAME) {
          broadcastCommandToChildFrames({ cmd: 'SET_HIGHLIGHT_COLORS', colors: appliedColors || {} });
        }
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
        if (IS_TOP_FRAME) {
          broadcastCommandToChildFrames({ cmd: 'SET_MARKER_VISIBILITY', visible: finalVisible });
        }
        chrome.storage.local.set({
          [MARKER_VISIBILITY_STORAGE_KEY]: finalVisible
        }).catch(() => {});
        sendResponse({ ok: true, visible: finalVisible });
        break;
      }
      case 'EDIT_ANNOTATION': {
        if (payload && payload.id) {
          const parsed = parseAggregateSelectionId(payload.id);
          if (parsed.kind === 'frame-root') {
            sendResponse(getStateSnapshot());
            break;
          }
          if (parsed.kind === 'frame-item' && IS_TOP_FRAME) {
            const nextAnnotation = typeof payload.annotation === 'string' ? payload.annotation : '';
            sendCommandToFrameKey(parsed.frameKey, {
              cmd: 'EDIT_ANNOTATION',
              id: parsed.selectionId,
              annotation: nextAnnotation
            });
            editChildSelectionAnnotationInMap(parsed.frameKey, parsed.selectionId, nextAnnotation);
            broadcastState();
            sendResponse(getStateSnapshot());
            break;
          }

          const sel = State.selections.find(s => s.id === parsed.id);
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
    State.lastHoveredIframe = null;
    State.lastHoveredIframeAt = 0;
    if (IS_TOP_FRAME) {
      clearAllChildFramesInMap();
    }

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
  window.addEventListener('message', onFrameBridgeMessage, true);
  document.addEventListener('keydown', onGlobalKeyDown, true);
  void syncI18nState();
  loadHighlightColorsFromStorage();
  loadMarkerVisibilityFromStorage();
  if (!IS_TOP_FRAME) {
    postFrameHelloToTop();
  }
  void loadFromStorage().then((hasSaved) => {
    if (State.isActive && hasSaved) {
      refreshHighlights();
      syncHighlightOrderNumbers();
    }
    broadcastState();
  });

})();
