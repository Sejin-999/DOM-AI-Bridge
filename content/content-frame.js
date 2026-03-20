/**
 * content-frame.js — iframe 브릿지
 * top frame ↔ child frame 간 postMessage 통신 전체를 담당한다.
 * window.__AGT_CONTENT (content-state.js에서 초기화)에 의존한다.
 */

(function () {
  'use strict';

  const C = window.__AGT_CONTENT;

  // ──────────────────────────────────────────
  // postMessage 헬퍼
  // ──────────────────────────────────────────
  function postFrameBridgeMessage(targetWindow, type, payload) {
    if (!targetWindow || typeof targetWindow.postMessage !== 'function') return;
    targetWindow.postMessage({
      [C.FRAME_BRIDGE_FLAG]: true,
      type,
      payload: payload || null
    }, '*');
  }

  function postFrameSyncToTop() {
    if (C.IS_TOP_FRAME) return;
    postFrameBridgeMessage(window.top, C.FRAME_SYNC_TYPE, {
      frameUrl: location.href,
      frameTitle: document.title || '',
      selections: C.snapshot(C.State.selections)
    });
  }

  function postFrameHelloToTop() {
    if (C.IS_TOP_FRAME) return;
    postFrameBridgeMessage(window.top, C.FRAME_HELLO_TYPE, {
      frameUrl: location.href,
      frameTitle: document.title || ''
    });
  }

  // ──────────────────────────────────────────
  // frameEl / frameKey 유틸
  // ──────────────────────────────────────────
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
    return document.querySelector(`[${C.FRAME_KEY_ATTR}="${frameKey}"]`);
  }

  function ensureFrameKey(frameEl) {
    if (!(frameEl instanceof Element)) return '';
    let frameKey = frameEl.getAttribute(C.FRAME_KEY_ATTR) || '';
    if (frameKey) return frameKey;
    frameKey = `fr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    frameEl.setAttribute(C.FRAME_KEY_ATTR, frameKey);
    return frameKey;
  }

  // ──────────────────────────────────────────
  // frameInfo / selection 빌더
  // ──────────────────────────────────────────
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

  // ──────────────────────────────────────────
  // childFrameSelectionMap 관리
  // ──────────────────────────────────────────
  function pruneDetachedFrameSelections() {
    if (!C.IS_TOP_FRAME) return;
    Array.from(C.childFrameSelectionMap.keys()).forEach((frameKey) => {
      const frameEl = getFrameElementByKey(frameKey);
      if (frameEl) return;
      C.childFrameSelectionMap.delete(frameKey);
      const frameWindow = C.frameWindowByKey.get(frameKey);
      if (frameWindow) C.frameKeyByWindow.delete(frameWindow);
      C.frameWindowByKey.delete(frameKey);
    });
  }

  function removeChildSelectionInMap(frameKey, rawSelectionId) {
    const entry = C.childFrameSelectionMap.get(frameKey);
    if (!entry || !Array.isArray(entry.selections)) return false;
    const nextSelections = entry.selections.filter((sel) => sel.rawSelectionId !== rawSelectionId);
    C.childFrameSelectionMap.set(frameKey, {
      frameInfo: entry.frameInfo,
      selections: nextSelections
    });
    return nextSelections.length > 0;
  }

  function clearChildFrameInMap(frameKey) {
    C.childFrameSelectionMap.delete(frameKey);
  }

  function clearAllChildFramesInMap() {
    C.childFrameSelectionMap.clear();
  }

  function editChildSelectionAnnotationInMap(frameKey, rawSelectionId, annotation) {
    const entry = C.childFrameSelectionMap.get(frameKey);
    if (!entry || !Array.isArray(entry.selections)) return false;
    let updated = false;
    const nextSelections = entry.selections.map((sel) => {
      if (sel.rawSelectionId !== rawSelectionId) return sel;
      updated = true;
      return Object.assign({}, sel, { annotation });
    });
    if (!updated) return false;
    C.childFrameSelectionMap.set(frameKey, {
      frameInfo: entry.frameInfo,
      selections: nextSelections
    });
    return true;
  }

  // ──────────────────────────────────────────
  // 선택 집계 (popup 표시용 / export용)
  // ──────────────────────────────────────────
  function getDisplaySelections() {
    if (!C.IS_TOP_FRAME) return C.State.selections;

    pruneDetachedFrameSelections();

    const list = [];
    const frameRootIndexByKey = new Map();
    C.State.selections.forEach((sel) => {
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

    C.childFrameSelectionMap.forEach((entry) => {
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
    if (!C.IS_TOP_FRAME) return C.State.selections.length;
    let childCount = 0;
    C.childFrameSelectionMap.forEach((entry) => {
      const childSelections = entry && Array.isArray(entry.selections) ? entry.selections : [];
      childCount += childSelections.length;
    });
    return C.State.selections.length + childCount;
  }

  function getSelectionsForExport() {
    if (!C.IS_TOP_FRAME) return C.State.selections;
    const merged = C.snapshot(C.State.selections);
    C.childFrameSelectionMap.forEach((entry) => {
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

  // ──────────────────────────────────────────
  // child frame 명령 전송
  // ──────────────────────────────────────────
  function broadcastCommandToChildFrames(commandPayload) {
    if (!C.IS_TOP_FRAME) return;
    const frames = document.querySelectorAll('iframe,frame');
    frames.forEach((frameEl) => {
      try {
        if (!frameEl.contentWindow) return;
        postFrameBridgeMessage(frameEl.contentWindow, C.FRAME_CMD_TYPE, commandPayload);
      } catch (_err) {
        // ignore
      }
    });
  }

  function sendCommandToFrameKey(frameKey, commandPayload) {
    const targetWindow = C.frameWindowByKey.get(frameKey);
    if (!targetWindow) return false;
    postFrameBridgeMessage(targetWindow, C.FRAME_CMD_TYPE, commandPayload);
    return true;
  }

  // ──────────────────────────────────────────
  // 메시지 핸들러
  // ──────────────────────────────────────────
  function handleFrameSyncMessage(sourceWindow, payload) {
    if (!C.IS_TOP_FRAME) return;
    const frameEl = getFrameElementByWindow(sourceWindow);
    if (!(frameEl instanceof Element)) return;

    const frameKey = ensureFrameKey(frameEl);
    if (!frameKey) return;

    C.frameWindowByKey.set(frameKey, sourceWindow);
    C.frameKeyByWindow.set(sourceWindow, frameKey);

    const frameInfo = buildFrameInfo(frameKey, frameEl, payload || {});
    const rawSelections = Array.isArray(payload && payload.selections) ? payload.selections : [];
    const childSelections = rawSelections.map((sel, index) => augmentChildSelection(frameInfo, sel, index));

    if (childSelections.length === 0) {
      C.childFrameSelectionMap.delete(frameKey);
      window.__AGT_CONTENT.broadcastState();
      return;
    }

    C.childFrameSelectionMap.set(frameKey, {
      frameInfo,
      selections: childSelections
    });
    window.__AGT_CONTENT.broadcastState();
  }

  function handleFrameHelloMessage(sourceWindow, payload) {
    if (!C.IS_TOP_FRAME) return;
    const frameEl = getFrameElementByWindow(sourceWindow);
    if (!(frameEl instanceof Element)) return;

    const frameKey = ensureFrameKey(frameEl);
    if (!frameKey) return;
    C.frameWindowByKey.set(frameKey, sourceWindow);
    C.frameKeyByWindow.set(sourceWindow, frameKey);

    const frameInfo = buildFrameInfo(frameKey, frameEl, payload || {});
    sendCommandToFrameKey(frameKey, { cmd: 'SET_ACTIVE', active: C.State.isActive });
    sendCommandToFrameKey(frameKey, { cmd: 'SET_HIGHLIGHT_COLORS', colors: window.__AGT_CONTENT.getHighlightColors() });
    sendCommandToFrameKey(frameKey, { cmd: 'SET_MARKER_VISIBILITY', visible: window.__AGT_CONTENT.getMarkerVisibility() });

    if (!C.childFrameSelectionMap.has(frameKey)) {
      C.childFrameSelectionMap.set(frameKey, {
        frameInfo,
        selections: []
      });
    }
  }

  function onFrameBridgeMessage(event) {
    if (!event || event.source === window) return;
    const data = event.data;
    if (!data || data[C.FRAME_BRIDGE_FLAG] !== true) return;

    if (data.type === C.FRAME_SYNC_TYPE) {
      handleFrameSyncMessage(event.source, data.payload || {});
      return;
    }

    if (data.type === C.FRAME_HELLO_TYPE) {
      handleFrameHelloMessage(event.source, data.payload || {});
      return;
    }

    if (data.type !== C.FRAME_CMD_TYPE) return;
    const command = data.payload || {};
    const cmd = command.cmd;

    if (C.IS_TOP_FRAME) {
      if (cmd === 'TOGGLE_ACTIVE') {
        if (C.State.isActive) window.__AGT_CONTENT.deactivate();
        else window.__AGT_CONTENT.activate();
      }
      return;
    }

    if (cmd === 'SET_ACTIVE') {
      if (command.active) window.__AGT_CONTENT.activate({ fromParent: true });
      else window.__AGT_CONTENT.deactivate({ fromParent: true });
      return;
    }

    if (cmd === 'REMOVE_SELECTION') {
      if (command.id) window.__AGT_CONTENT.removeSelection(command.id);
      return;
    }

    if (cmd === 'CLEAR_ALL') {
      window.__AGT_CONTENT.clearAll();
      return;
    }

    if (cmd === 'EDIT_ANNOTATION') {
      if (!command.id) return;
      const sel = C.State.selections.find((item) => item.id === command.id);
      if (!sel) return;
      C.pushUndo();
      sel.annotation = typeof command.annotation === 'string' ? command.annotation : '';
      window.__AGT_CONTENT.saveToStorage();
      window.__AGT_CONTENT.broadcastState();
      return;
    }

    if (cmd === 'SET_HIGHLIGHT_COLORS') {
      window.__AGT_CONTENT.applyHighlightColors(command.colors || {});
      return;
    }

    if (cmd === 'SET_MARKER_VISIBILITY') {
      window.__AGT_CONTENT.applyMarkerVisibility(command.visible);
      return;
    }

    if (cmd === 'SET_ACCUMULATE_MODE') {
      C.State.accumulateMode = !!(command.accumulateMode);
      return;
    }

    if (cmd === 'I18N_REFRESH') {
      void window.__AGT_CONTENT.syncI18nState();
    }
  }

  // ──────────────────────────────────────────
  // 네임스페이스 노출
  // ──────────────────────────────────────────
  Object.assign(C, {
    postFrameBridgeMessage,
    postFrameSyncToTop,
    postFrameHelloToTop,
    getFrameElementByWindow,
    getFrameElementByKey,
    ensureFrameKey,
    buildFrameInfo,
    augmentChildSelection,
    buildFrameRootSelection,
    pruneDetachedFrameSelections,
    getDisplaySelections,
    getSelectionCount,
    getSelectionsForExport,
    broadcastCommandToChildFrames,
    sendCommandToFrameKey,
    removeChildSelectionInMap,
    clearChildFrameInMap,
    clearAllChildFramesInMap,
    editChildSelectionAnnotationInMap,
    handleFrameSyncMessage,
    handleFrameHelloMessage,
    onFrameBridgeMessage
  });
})();
