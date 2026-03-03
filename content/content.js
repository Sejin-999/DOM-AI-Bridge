/**
 * content.js — 진입점 & SPA 라우트 감지
 * 모든 content 모듈이 로드된 후 마지막으로 실행된다.
 * SPA 라우트 변경 감지, i18n/storage 이벤트 구독, 전체 초기화를 담당한다.
 *
 * 로드 순서:
 *   i18n.js → dom-utils.js → selector.js → overlay.js
 *   → content-state.js → content-frame.js → content-handlers.js
 *   → content-actions.js → content.js (현재 파일)
 */

(function () {
  'use strict';

  if (window.__AGT_CONTENT_INITIALIZED__) return;
  window.__AGT_CONTENT_INITIALIZED__ = true;

  const C = window.__AGT_CONTENT;

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

    window.__AGT.clearAllHighlights();
    window.__AGT.clearSearchHighlights();
    window.__AGT.clearHover();
    if (typeof window.__AGT.hideAnnotationPopover === 'function') {
      window.__AGT.hideAnnotationPopover();
    }

    C.State.undoStack = [];
    C.State.redoStack = [];
    C.State.hoveredEl = null;
    C.State.lastHoveredIframe = null;
    C.State.lastHoveredIframeAt = 0;
    if (C.IS_TOP_FRAME) {
      C.clearAllChildFramesInMap();
    }

    void C.loadFromStorage().then((hasSaved) => {
      if (token !== routeLoadToken) return;
      if (C.State.isActive && hasSaved) {
        C.refreshHighlights();
        C.syncHighlightOrderNumbers();
      }
      C.broadcastState();
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

  // ──────────────────────────────────────────
  // i18n locale 변경 감지
  // ──────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.prototype.hasOwnProperty.call(changes, C.I18N_LOCALE_STORAGE_KEY)) return;
    void C.syncI18nState();
  });

  // ──────────────────────────────────────────
  // 초기화
  // ──────────────────────────────────────────
  window.addEventListener('message', C.onFrameBridgeMessage, true);
  document.addEventListener('keydown', C.onGlobalKeyDown, true);
  void C.syncI18nState();
  C.loadHighlightColorsFromStorage();
  C.loadMarkerVisibilityFromStorage();
  if (!C.IS_TOP_FRAME) {
    C.postFrameHelloToTop();
  }
  void C.loadFromStorage().then((hasSaved) => {
    if (C.State.isActive && hasSaved) {
      C.refreshHighlights();
      C.syncHighlightOrderNumbers();
    }
    C.broadcastState();
  });
})();
