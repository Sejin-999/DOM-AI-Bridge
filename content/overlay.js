/**
 * overlay.js — 오버레이 초기화/제거 + 전역 이벤트 등록
 * 의존: overlay-state.js → overlay-highlight.js → overlay-counter.js → overlay-popover.js
 */

(function () {
  'use strict';

  const S = window.__AGT_OVERLAY;

  /**
   * 오버레이 초기화 — overlay/tooltip/counter/hoverBox DOM 생성
   */
  window.__AGT.initOverlay = function () {
    if (document.getElementById(S.OVERLAY_ID)) return;

    // 오버레이 컨테이너
    S.overlayEl = document.createElement('div');
    S.overlayEl.id = S.OVERLAY_ID;
    Object.assign(S.overlayEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: S.Z_INDEX.overlay,
      overflow: 'hidden'
    });
    document.documentElement.appendChild(S.overlayEl);

    // 툴팁
    S.tooltipEl = document.createElement('div');
    S.tooltipEl.id = S.TOOLTIP_ID;
    Object.assign(S.tooltipEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: S.Z_INDEX.tooltip,
      background: '#1e293b',
      color: '#f8fafc',
      fontSize: '11px',
      fontFamily: 'monospace',
      padding: '4px 8px',
      borderRadius: '4px',
      maxWidth: '320px',
      wordBreak: 'break-all',
      display: 'none',
      lineHeight: '1.5',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
    });
    document.documentElement.appendChild(S.tooltipEl);

    // 상단 선택 카운터
    S.counterEl = document.createElement('div');
    S.counterEl.id = S.COUNTER_ID;
    S.counterEl.setAttribute('data-agt-own', '1');
    Object.assign(S.counterEl.style, {
      position: 'fixed',
      top: '14px',
      right: '14px',
      pointerEvents: 'auto',
      zIndex: S.Z_INDEX.tooltip,
      background: 'linear-gradient(135deg, rgba(30,41,59,0.96), rgba(15,23,42,0.96))',
      color: '#e2e8f0',
      border: '1px solid rgba(59,130,246,0.45)',
      borderRadius: '999px',
      padding: '7px 12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      fontWeight: '700',
      letterSpacing: '0.3px',
      display: 'none',
      boxShadow: '0 8px 18px rgba(2,6,23,0.45)',
      transformOrigin: 'top right',
      whiteSpace: 'nowrap',
      cursor: 'grab',
      userSelect: 'none'
    });
    S.counterEl.innerHTML = S.buildCounterInnerHtml(0, '');
    S.counterEl.addEventListener('mousedown', S.onCounterDragStart, true);
    document.documentElement.appendChild(S.counterEl);

    // 호버 박스
    S.hoverBoxEl = document.createElement('div');
    Object.assign(S.hoverBoxEl.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: `2px dashed ${S.COLORS.hover.border}`,
      background: S.COLORS.hover.bg,
      borderRadius: '2px',
      display: 'none',
      transition: 'all 0.05s ease'
    });
    S.overlayEl.appendChild(S.hoverBoxEl);
  };

  /**
   * 오버레이 완전 제거 (비활성화 시)
   */
  window.__AGT.destroyOverlay = function () {
    window.__AGT.hideAnnotationPopover();
    if (S.overlayEl) {
      S.overlayEl.remove();
      S.overlayEl = null;
      S.hoverBoxEl = null;
    }
    if (S.tooltipEl) {
      S.tooltipEl.remove();
      S.tooltipEl = null;
    }
    if (S.counterEl) {
      S.counterEl.remove();
      S.counterEl = null;
    }
    S.selectedBoxMap.clear();
    S.clearSearchHighlightEntries();
    S.currentHoverTarget = null;
    if (S.rafId) {
      cancelAnimationFrame(S.rafId);
      S.rafId = null;
    }
  };

  // ── 전역 이벤트 등록 ────────────────────────────────────────────────────

  window.addEventListener('scroll', function () { S.scheduleUpdate(); }, { passive: true, capture: true });
  window.addEventListener('resize', function () {
    S.scheduleUpdate();
    S.ensureCounterInViewport();
  }, { passive: true });
  window.addEventListener('mousemove', function (e) { S.onCounterDragMove(e); }, true);
  window.addEventListener('mouseup', function () { S.onCounterDragEnd(); }, true);

})();
