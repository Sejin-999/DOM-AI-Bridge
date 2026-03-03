/**
 * overlay-state.js — 공유 상태 + 상수 + 유틸
 * window.__AGT_OVERLAY 네임스페이스 초기화
 */

(function () {
  'use strict';

  window.__AGT = window.__AGT || {};

  // ── 유틸 함수 (hoisted via function declaration) ──────────────────────────

  function normalizeHexColor(value, fallbackHex) {
    const fallback = String(fallbackHex || DEFAULT_HIGHLIGHT_COLORS.selected).toLowerCase();
    if (typeof value !== 'string') return fallback;
    const raw = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
    }
    return fallback;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex, DEFAULT_HIGHLIGHT_COLORS.selected);
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }

  function buildHighlightColor(hex, alpha) {
    const border = normalizeHexColor(hex, DEFAULT_HIGHLIGHT_COLORS.selected);
    const rgb = hexToRgb(border);
    const a = Number.isFinite(alpha) ? alpha : 0.12;
    return {
      border,
      bg: `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`
    };
  }

  function escapeHtmlAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeHtmlInner(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function t(key, vars, fallback) {
    if (window.__AGT_I18N && typeof window.__AGT_I18N.t === 'function') {
      return window.__AGT_I18N.t(key, vars, fallback);
    }
    return typeof fallback === 'string' ? fallback : key;
  }

  function buildCounterInnerHtml(count, diffHtml) {
    const label = escapeHtmlInner(t('overlay_counter_label', null, 'Selected'));
    return `<span style="opacity:0.85;">${label}</span> <span style="color:#93c5fd;">${count}</span>${diffHtml || ''}`;
  }

  // ── 상수 ─────────────────────────────────────────────────────────────────

  const DEFAULT_HIGHLIGHT_COLORS = {
    selected: '#16a34a',
    search: '#d97706'
  };

  // ── 네임스페이스 초기화 ───────────────────────────────────────────────────

  window.__AGT_OVERLAY = {
    // 상수
    OVERLAY_ID: '__agentation-overlay__',
    TOOLTIP_ID: '__agentation-tooltip__',
    COUNTER_ID: '__agentation-counter__',
    POPOVER_ID: '__agentation-popover__',
    DEFAULT_HIGHLIGHT_COLORS,
    Z_INDEX: {
      overlay: '2147483645',
      tooltip: '2147483646',
      popover: '2147483647'
    },

    // DOM refs
    overlayEl: null,
    tooltipEl: null,
    counterEl: null,
    hoverBoxEl: null,

    // 선택/검색 상태
    selectedBoxMap: new Map(),
    searchBoxEntries: [],

    // 애니메이션/추적
    rafId: null,
    currentHoverTarget: null,
    lastCounterCount: 0,
    hasCounterSnapshot: false,
    markersVisible: true,

    // 드래그 상태
    isCounterDragging: false,
    counterDragStartX: 0,
    counterDragStartY: 0,
    counterDragOriginLeft: 0,
    counterDragOriginTop: 0,
    counterDragWidth: 0,
    counterDragHeight: 0,

    // 팝오버
    popoverEl: null,
    popoverCallbacks: null,

    // 색상 (mutable)
    COLORS: {
      hover: { border: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
      selected: buildHighlightColor(DEFAULT_HIGHLIGHT_COLORS.selected, 0.12),
      search: buildHighlightColor(DEFAULT_HIGHLIGHT_COLORS.search, 0.12)
    },

    // 유틸 함수 (다른 모듈에서 S.* 로 접근)
    normalizeHexColor,
    hexToRgb,
    buildHighlightColor,
    escapeHtmlAttr,
    escapeHtmlInner,
    t,
    buildCounterInnerHtml
  };

})();
