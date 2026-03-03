/**
 * overlay-highlight.js — hover/selected/search 하이라이트 + 위치 업데이트
 * window.__AGT_OVERLAY(S)의 상태를 사용
 */

(function () {
  'use strict';

  const S = window.__AGT_OVERLAY;

  // ── 내부 DOM 헬퍼 ────────────────────────────────────────────────────────

  function createBox(color) {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: `2px solid ${color.border}`,
      background: color.bg,
      borderRadius: '2px'
    });
    return box;
  }

  function getFixedRect(el) {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function positionBox(boxEl, rect) {
    Object.assign(boxEl.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function positionOrderBadge(badgeEl, rect) {
    const left = Math.max(0, rect.left - 8);
    const top = Math.max(0, rect.top - 10);
    Object.assign(badgeEl.style, {
      left: `${left}px`,
      top: `${top}px`
    });
  }

  function createOrderBadge(orderNumber) {
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'absolute',
      pointerEvents: 'none',
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      borderRadius: '999px',
      background: S.COLORS.selected.border,
      color: '#ffffff',
      border: '1px solid rgba(0,0,0,0.35)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      fontWeight: '700',
      lineHeight: '18px',
      textAlign: 'center',
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
    });
    badge.textContent = String(orderNumber);
    return badge;
  }

  // ── 색상/마커 적용 ────────────────────────────────────────────────────────

  function applyHighlightColorToExisting() {
    S.selectedBoxMap.forEach(({ box, badge }) => {
      box.style.border = `2px solid ${S.COLORS.selected.border}`;
      box.style.background = S.COLORS.selected.bg;
      if (badge) badge.style.background = S.COLORS.selected.border;
    });

    S.searchBoxEntries.forEach(({ box }) => {
      box.style.border = `2px solid ${S.COLORS.search.border}`;
      box.style.background = S.COLORS.search.bg;
    });
  }

  function clearSearchHighlightEntries() {
    S.searchBoxEntries.forEach(({ box }) => box.remove());
    S.searchBoxEntries.length = 0;
  }

  // ── 위치 업데이트 (rAF 기반) ──────────────────────────────────────────────

  function updatePositions() {
    S.selectedBoxMap.forEach(({ box, badge, el }) => {
      if (!document.contains(el)) {
        box.style.display = 'none';
        if (badge) badge.style.display = 'none';
        return;
      }
      const rect = getFixedRect(el);
      positionBox(box, rect);
      box.style.display = S.markersVisible ? 'block' : 'none';
      if (badge) {
        positionOrderBadge(badge, rect);
        badge.style.display = S.markersVisible ? 'block' : 'none';
      }
    });

    for (let i = S.searchBoxEntries.length - 1; i >= 0; i -= 1) {
      const entry = S.searchBoxEntries[i];
      if (!document.contains(entry.el)) {
        entry.box.remove();
        S.searchBoxEntries.splice(i, 1);
        continue;
      }
      const rect = getFixedRect(entry.el);
      positionBox(entry.box, rect);
      entry.box.style.display = S.markersVisible ? 'block' : 'none';
    }

    if (S.currentHoverTarget) {
      const rect = getFixedRect(S.currentHoverTarget);
      positionBox(S.hoverBoxEl, rect);
    }

    S.rafId = null;
  }

  function scheduleUpdate() {
    if (S.rafId) return;
    S.rafId = requestAnimationFrame(updatePositions);
  }

  function applyMarkersVisibility() {
    if (!S.overlayEl) return;

    if (!S.markersVisible) {
      if (S.hoverBoxEl) S.hoverBoxEl.style.display = 'none';
      if (S.tooltipEl) S.tooltipEl.style.display = 'none';
      S.selectedBoxMap.forEach(({ box, badge }) => {
        box.style.display = 'none';
        if (badge) badge.style.display = 'none';
      });
      S.searchBoxEntries.forEach(({ box }) => {
        box.style.display = 'none';
      });
      return;
    }

    scheduleUpdate();
    S.searchBoxEntries.forEach(({ box }) => {
      box.style.display = 'block';
    });
  }

  // ── 내부 함수 노출 (overlay.js + destroyOverlay에서 사용) ─────────────────

  S.scheduleUpdate = scheduleUpdate;
  S.clearSearchHighlightEntries = clearSearchHighlightEntries;

  // ── 공개 API ─────────────────────────────────────────────────────────────

  window.__AGT.showHover = function (el, info) {
    if (!S.overlayEl) window.__AGT.initOverlay();
    S.currentHoverTarget = el;

    if (!S.markersVisible) {
      if (S.hoverBoxEl) S.hoverBoxEl.style.display = 'none';
      if (S.tooltipEl) S.tooltipEl.style.display = 'none';
      return;
    }

    if (!el) {
      S.hoverBoxEl.style.display = 'none';
      S.tooltipEl.style.display = 'none';
      return;
    }

    const rect = getFixedRect(el);
    if (rect.width === 0 && rect.height === 0) return;

    positionBox(S.hoverBoxEl, rect);
    S.hoverBoxEl.style.display = 'block';

    if (info) {
      S.tooltipEl.textContent = `${info.tagName} • ${info.selector}`;
      S.tooltipEl.style.display = 'block';
      const tipTop = rect.top + rect.height + 4;
      const tipLeft = rect.left;
      if (tipTop + 30 < window.innerHeight) {
        S.tooltipEl.style.top = `${tipTop}px`;
      } else {
        S.tooltipEl.style.top = `${rect.top - 30}px`;
      }
      S.tooltipEl.style.left = `${Math.min(tipLeft, window.innerWidth - 340)}px`;
    }
  };

  window.__AGT.clearHover = function () {
    if (S.hoverBoxEl) S.hoverBoxEl.style.display = 'none';
    if (S.tooltipEl) S.tooltipEl.style.display = 'none';
    S.currentHoverTarget = null;
  };

  window.__AGT.addSelectedHighlight = function (el, id, orderNumber) {
    if (!S.overlayEl) window.__AGT.initOverlay();
    if (S.selectedBoxMap.has(id)) {
      window.__AGT.updateSelectedHighlightOrder(id, orderNumber);
      return;
    }

    const box = createBox(S.COLORS.selected);
    const rect = getFixedRect(el);
    positionBox(box, rect);
    box.dataset.selId = id;
    box.style.display = S.markersVisible ? 'block' : 'none';
    S.overlayEl.appendChild(box);

    let badge = null;
    if (Number.isInteger(orderNumber) && orderNumber > 0) {
      badge = createOrderBadge(orderNumber);
      positionOrderBadge(badge, rect);
      badge.style.display = S.markersVisible ? 'block' : 'none';
      S.overlayEl.appendChild(badge);
    }

    S.selectedBoxMap.set(id, { box, badge, el });
  };

  window.__AGT.updateSelectedHighlightOrder = function (id, orderNumber) {
    if (!S.overlayEl) return;
    const entry = S.selectedBoxMap.get(id);
    if (!entry) return;

    if (!(Number.isInteger(orderNumber) && orderNumber > 0)) {
      if (entry.badge) {
        entry.badge.remove();
        entry.badge = null;
      }
      return;
    }

    if (!entry.badge) {
      entry.badge = createOrderBadge(orderNumber);
      S.overlayEl.appendChild(entry.badge);
    } else {
      entry.badge.textContent = String(orderNumber);
    }

    if (!document.contains(entry.el)) {
      entry.badge.style.display = 'none';
      return;
    }

    const rect = getFixedRect(entry.el);
    positionOrderBadge(entry.badge, rect);
    entry.badge.style.display = S.markersVisible ? 'block' : 'none';
  };

  window.__AGT.removeSelectedHighlight = function (id) {
    const entry = S.selectedBoxMap.get(id);
    if (entry) {
      entry.box.remove();
      if (entry.badge) entry.badge.remove();
      S.selectedBoxMap.delete(id);
    }
  };

  window.__AGT.clearAllHighlights = function () {
    S.selectedBoxMap.forEach(({ box, badge }) => {
      box.remove();
      if (badge) badge.remove();
    });
    S.selectedBoxMap.clear();
    window.__AGT.clearHover();
  };

  window.__AGT.showSearchHighlights = function (elements) {
    clearSearchHighlightEntries();
    if (!S.overlayEl) window.__AGT.initOverlay();

    elements.forEach(el => {
      if (!(el instanceof Element)) return;
      const box = createBox(S.COLORS.search);
      const rect = getFixedRect(el);
      positionBox(box, rect);
      box.dataset.searchHighlight = '1';
      box.style.display = S.markersVisible ? 'block' : 'none';
      S.overlayEl.appendChild(box);
      S.searchBoxEntries.push({ box, el });
    });
    scheduleUpdate();
  };

  window.__AGT.clearSearchHighlights = function () {
    clearSearchHighlightEntries();
  };

  window.__AGT.setHighlightColors = function (colors) {
    const selected = S.normalizeHexColor(colors && colors.selected, S.COLORS.selected.border);
    const search = S.normalizeHexColor(colors && colors.search, S.COLORS.search.border);
    S.COLORS.selected = S.buildHighlightColor(selected, 0.12);
    S.COLORS.search = S.buildHighlightColor(search, 0.12);
    applyHighlightColorToExisting();
    return {
      selected: S.COLORS.selected.border,
      search: S.COLORS.search.border
    };
  };

  window.__AGT.getHighlightColors = function () {
    return {
      selected: S.COLORS.selected.border,
      search: S.COLORS.search.border
    };
  };

  window.__AGT.setMarkersVisible = function (visible) {
    S.markersVisible = !!visible;
    applyMarkersVisibility();
    return S.markersVisible;
  };

  window.__AGT.getMarkersVisible = function () {
    return S.markersVisible;
  };

})();
