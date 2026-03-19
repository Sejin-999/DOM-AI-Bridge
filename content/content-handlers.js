/**
 * content-handlers.js — 이벤트 핸들러 & 활성화/비활성화
 * DOM 이벤트 처리, 활성화 라이프사이클, 선택 플로우를 담당한다.
 * window.__AGT_CONTENT (content-state.js)에 의존한다.
 */

(function () {
  'use strict';

  const C = window.__AGT_CONTENT;

  // ──────────────────────────────────────────
  // 활성화 / 비활성화
  // ──────────────────────────────────────────
  function activate(options) {
    if (C.State.isActive) return;
    const fromParent = !!(options && options.fromParent);
    C.State.isActive = true;
    window.__AGT.initOverlay();
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur, true);
    if (C.IS_TOP_FRAME && !fromParent) {
      C.broadcastCommandToChildFrames({ cmd: 'SET_ACTIVE', active: true });
      notifyBackground();
    }
    window.__AGT_CONTENT.broadcastState();
  }

  function deactivate(options) {
    if (!C.State.isActive) return;
    const fromParent = !!(options && options.fromParent);
    C.State.isActive = false;
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
    if (C.IS_TOP_FRAME && !fromParent) {
      C.broadcastCommandToChildFrames({ cmd: 'SET_ACTIVE', active: false });
      notifyBackground();
    }
    window.__AGT_CONTENT.broadcastState();
  }

  function notifyBackground() {
    chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_STATE',
      payload: { isActive: C.State.isActive }
    }).catch(() => {});
  }

  // ──────────────────────────────────────────
  // 전역 단축키 (토글, 항상 활성)
  // ──────────────────────────────────────────
  function onGlobalKeyDown(e) {
    if (!isToggleShortcut(e)) return;
    if (isEditableTarget(e.target)) return;
    if (document.getElementById('__agentation-popover__')) return;

    e.preventDefault();
    e.stopPropagation();

    if (!C.IS_TOP_FRAME) {
      C.postFrameBridgeMessage(window.top, C.FRAME_CMD_TYPE, { cmd: 'TOGGLE_ACTIVE' });
      return;
    }

    if (C.State.isActive) deactivate();
    else activate();
  }

  function isToggleShortcut(e) {
    const key = String(e.key || '').toLowerCase();
    return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && key === C.TOGGLE_SHORTCUT_KEY;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    if (target.closest('[contenteditable="true"]')) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // ──────────────────────────────────────────
  // 마우스 이벤트
  // ──────────────────────────────────────────
  function onMouseOver(e) {
    const el = e.target;
    if (window.__AGT.isOwnElement(el)) return;

    C.State.hoveredEl = el;
    if (el instanceof HTMLIFrameElement) {
      C.State.lastHoveredIframe = el;
      C.State.lastHoveredIframeAt = Date.now();
    }
    const sel = window.__AGT.generateSelector(el);
    window.__AGT.showHover(el, {
      selector: sel.selector,
      tagName: el.tagName
    });
  }

  function onMouseOut(e) {
    if (window.__AGT.isOwnElement(e.target)) return;
    const to = e.relatedTarget;
    if (!to || window.__AGT.isOwnElement(to)) {
      window.__AGT.clearHover();
      C.State.hoveredEl = null;
    }
  }

  function onMouseDown(e) {
    if (window.__AGT.isOwnElement(e.target)) return;
    C.State.isPointerDown = true;
    C.State.dragStartX = e.clientX;
    C.State.dragStartY = e.clientY;
    C.State.didDrag = false;
    C.State.skipNextClick = false;
  }

  function onMouseMove(e) {
    if (!C.State.isPointerDown || C.State.didDrag) return;
    const dx = e.clientX - C.State.dragStartX;
    const dy = e.clientY - C.State.dragStartY;
    if (Math.hypot(dx, dy) >= C.DRAG_THRESHOLD_PX) {
      C.State.didDrag = true;
    }
  }

  function onMouseUp() {
    if (!C.State.isPointerDown) return;
    C.State.isPointerDown = false;
    if (C.State.didDrag) {
      C.State.skipNextClick = true;
    }
    C.State.didDrag = false;
  }

  function resetPointerTracking() {
    C.State.isPointerDown = false;
    C.State.dragStartX = 0;
    C.State.dragStartY = 0;
    C.State.didDrag = false;
    C.State.skipNextClick = false;
  }

  // ──────────────────────────────────────────
  // 클릭 → 선택 플로우
  // ──────────────────────────────────────────
  function onClick(e) {
    const el = e.target;
    if (window.__AGT.isOwnElement(el)) return;
    if (shouldIgnoreClickSelection(el)) return;

    e.preventDefault();
    e.stopPropagation();
    startSelectionFlow(el, { closeIfOpen: true });
  }

  function shouldIgnoreClickSelection(el) {
    if (C.State.skipNextClick) {
      C.State.skipNextClick = false;
      return true;
    }
    if (isGlobalContainerElement(el)) return true;
    const selection = window.getSelection();
    if (selection && selection.type === 'Range' && String(selection).trim().length > 0) {
      return true;
    }
    return false;
  }

  const TABLE_TAGS = new Set(['TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','CAPTION']);

  function isGlobalContainerElement(el) {
    if (!(el instanceof Element)) return false;
    if (el === document.documentElement || el === document.body) return true;
    if (TABLE_TAGS.has(el.tagName)) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const widthRatio = rect.width / Math.max(window.innerWidth, 1);
    const heightRatio = rect.height / Math.max(window.innerHeight, 1);
    return widthRatio >= 0.9 && heightRatio >= 0.75;
  }

  function onWindowBlur() {
    if (!C.State.isActive) return;
    const activeEl = document.activeElement;
    if (!(activeEl instanceof HTMLIFrameElement)) return;

    const justHoveredSameIframe = (
      C.State.lastHoveredIframe === activeEl &&
      Date.now() - C.State.lastHoveredIframeAt <= 1000
    );
    if (!justHoveredSameIframe) return;

    startSelectionFlow(activeEl, { closeIfOpen: false });
  }

  function startSelectionFlow(el, options) {
    if (!(el instanceof Element)) return;
    const closeIfOpen = !options || options.closeIfOpen !== false;

    if (document.getElementById('__agentation-popover__')) {
      if (closeIfOpen) window.__AGT.hideAnnotationPopover();
      return;
    }

    const data = window.__AGT.collectElementData(el);
    if (!data) return;
    const tagName = String(el.tagName || '').toUpperCase();
    if (C.IS_TOP_FRAME && (tagName === 'IFRAME' || tagName === 'FRAME')) {
      const frameKey = C.ensureFrameKey(el);
      if (frameKey) {
        data.frameKey = frameKey;
        data.isFrameRoot = true;
      }
    }

    window.__AGT.clearHover();
    window.__AGT.addSelectedHighlight(el, '__pending__');

    window.__AGT.showAnnotationPopover(
      el,
      {
        tagName: data.tagName,
        selector: data.selector,
        innerText: data.innerText
      },
      function (annotationText) {
        window.__AGT.removeSelectedHighlight('__pending__');
        data.annotation = annotationText;
        C.pushUndo();
        C.State.selections.push(data);
        window.__AGT.addSelectedHighlight(el, data.id, C.State.selections.length);
        window.__AGT_CONTENT.syncHighlightOrderNumbers();
        window.__AGT_CONTENT.saveToStorage();
        window.__AGT_CONTENT.broadcastState();
      },
      function () {
        window.__AGT.removeSelectedHighlight('__pending__');
      }
    );
  }

  // ──────────────────────────────────────────
  // 키다운 (활성 중에만)
  // ──────────────────────────────────────────
  function onKeyDown(e) {
    if (document.getElementById('__agentation-popover__')) return;

    if (e.key === 'Escape') {
      deactivate();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      window.__AGT_CONTENT.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      e.stopPropagation();
      window.__AGT_CONTENT.redo();
    }
  }

  // ──────────────────────────────────────────
  // 네임스페이스 노출
  // ──────────────────────────────────────────
  Object.assign(C, {
    activate,
    deactivate,
    notifyBackground,
    onGlobalKeyDown,
    isToggleShortcut,
    isEditableTarget,
    onMouseOver,
    onMouseOut,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onKeyDown,
    onWindowBlur,
    resetPointerTracking,
    shouldIgnoreClickSelection,
    isGlobalContainerElement,
    startSelectionFlow
  });
})();
