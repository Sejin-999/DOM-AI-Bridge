/**
 * overlay.js — 시각적 하이라이트 레이어
 * position: fixed, pointer-events: none, z-index 최대
 */

(function () {
  'use strict';

  window.__AGT = window.__AGT || {};

  const OVERLAY_ID = '__agentation-overlay__';
  const TOOLTIP_ID = '__agentation-tooltip__';
  const COUNTER_ID = '__agentation-counter__';
  const DEFAULT_HIGHLIGHT_COLORS = {
    selected: '#16a34a',
    search: '#d97706'
  };
  const Z_INDEX = {
    overlay: '2147483645',
    tooltip: '2147483646',
    popover: '2147483647'
  };

  // 색상 상수
  const COLORS = {
    hover: { border: '#2563EB', bg: 'rgba(37,99,235,0.08)' },      // 파란색
    selected: buildHighlightColor(DEFAULT_HIGHLIGHT_COLORS.selected, 0.12),
    search: buildHighlightColor(DEFAULT_HIGHLIGHT_COLORS.search, 0.12)
  };

  let overlayEl = null;
  let tooltipEl = null;
  let counterEl = null;
  let hoverBoxEl = null;
  let rafId = null;
  let currentHoverTarget = null;
  let lastCounterCount = 0;
  let hasCounterSnapshot = false;
  let markersVisible = true;
  let isCounterDragging = false;
  let counterDragStartX = 0;
  let counterDragStartY = 0;
  let counterDragOriginLeft = 0;
  let counterDragOriginTop = 0;
  let counterDragWidth = 0;
  let counterDragHeight = 0;
  const selectedBoxMap = new Map(); // id → { box, badge, el }

  /**
   * 오버레이 초기화
   */
  window.__AGT.initOverlay = function () {
    if (document.getElementById(OVERLAY_ID)) return;

    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;
    Object.assign(overlayEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: Z_INDEX.overlay,
      overflow: 'hidden'
    });
    document.documentElement.appendChild(overlayEl);

    // 툴팁
    tooltipEl = document.createElement('div');
    tooltipEl.id = TOOLTIP_ID;
    Object.assign(tooltipEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: Z_INDEX.tooltip,
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
    document.documentElement.appendChild(tooltipEl);

    // 상단 선택 카운터
    counterEl = document.createElement('div');
    counterEl.id = COUNTER_ID;
    counterEl.setAttribute('data-agt-own', '1');
    Object.assign(counterEl.style, {
      position: 'fixed',
      top: '14px',
      right: '14px',
      pointerEvents: 'auto',
      zIndex: Z_INDEX.tooltip,
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
    counterEl.innerHTML = '<span style="opacity:0.85;">선택</span> <span style="color:#93c5fd;">0</span>';
    counterEl.addEventListener('mousedown', onCounterDragStart, true);
    document.documentElement.appendChild(counterEl);

    // 호버 박스
    hoverBoxEl = document.createElement('div');
    Object.assign(hoverBoxEl.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: `2px dashed ${COLORS.hover.border}`,
      background: COLORS.hover.bg,
      borderRadius: '2px',
      display: 'none',
      transition: 'all 0.05s ease'
    });
    overlayEl.appendChild(hoverBoxEl);
  };

  /**
   * 박스 요소 생성
   */
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

  function applyHighlightColorToExisting() {
    selectedBoxMap.forEach(({ box, badge }) => {
      box.style.border = `2px solid ${COLORS.selected.border}`;
      box.style.background = COLORS.selected.bg;
      if (badge) badge.style.background = COLORS.selected.border;
    });

    if (overlayEl) {
      overlayEl.querySelectorAll('[data-search-highlight]').forEach((el) => {
        el.style.border = `2px solid ${COLORS.search.border}`;
        el.style.background = COLORS.search.bg;
      });
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function onCounterDragStart(e) {
    if (!counterEl || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = counterEl.getBoundingClientRect();
    isCounterDragging = true;
    counterDragStartX = e.clientX;
    counterDragStartY = e.clientY;
    counterDragOriginLeft = rect.left;
    counterDragOriginTop = rect.top;
    counterDragWidth = rect.width;
    counterDragHeight = rect.height;

    counterEl.style.left = `${rect.left}px`;
    counterEl.style.top = `${rect.top}px`;
    counterEl.style.right = 'auto';
    counterEl.style.bottom = 'auto';
    counterEl.style.cursor = 'grabbing';
  }

  function onCounterDragMove(e) {
    if (!isCounterDragging || !counterEl) return;

    const dx = e.clientX - counterDragStartX;
    const dy = e.clientY - counterDragStartY;
    const maxLeft = Math.max(8, window.innerWidth - counterDragWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - counterDragHeight - 8);
    const nextLeft = clamp(counterDragOriginLeft + dx, 8, maxLeft);
    const nextTop = clamp(counterDragOriginTop + dy, 8, maxTop);

    counterEl.style.left = `${nextLeft}px`;
    counterEl.style.top = `${nextTop}px`;
  }

  function onCounterDragEnd() {
    if (!isCounterDragging || !counterEl) return;
    isCounterDragging = false;
    counterEl.style.cursor = 'grab';
  }

  function ensureCounterInViewport() {
    if (!counterEl) return;
    const rect = counterEl.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const nextLeft = clamp(rect.left, 8, maxLeft);
    const nextTop = clamp(rect.top, 8, maxTop);

    if (Math.abs(nextLeft - rect.left) > 0.5 || Math.abs(nextTop - rect.top) > 0.5) {
      counterEl.style.left = `${nextLeft}px`;
      counterEl.style.top = `${nextTop}px`;
      counterEl.style.right = 'auto';
      counterEl.style.bottom = 'auto';
    }
  }

  function applyMarkersVisibility() {
    if (!overlayEl) return;

    if (!markersVisible) {
      if (hoverBoxEl) hoverBoxEl.style.display = 'none';
      if (tooltipEl) tooltipEl.style.display = 'none';
      selectedBoxMap.forEach(({ box, badge }) => {
        box.style.display = 'none';
        if (badge) badge.style.display = 'none';
      });
      overlayEl.querySelectorAll('[data-search-highlight]').forEach((el) => {
        el.style.display = 'none';
      });
      return;
    }

    scheduleUpdate();
    overlayEl.querySelectorAll('[data-search-highlight]').forEach((el) => {
      el.style.display = 'block';
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
      background: COLORS.selected.border,
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

  /**
   * 요소의 뷰포트 기준 rect → overlay 내 좌표 변환
   * (overlay는 fixed position이라 viewport 기준 직접 사용)
   */
  function getFixedRect(el) {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * 박스 위치 업데이트
   */
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

  /**
   * 호버 하이라이트 표시
   * @param {Element|null} el
   * @param {{ selector: string, tagName: string }} info
   */
  window.__AGT.showHover = function (el, info) {
    if (!overlayEl) window.__AGT.initOverlay();
    currentHoverTarget = el;

    if (!markersVisible) {
      if (hoverBoxEl) hoverBoxEl.style.display = 'none';
      if (tooltipEl) tooltipEl.style.display = 'none';
      return;
    }

    if (!el) {
      hoverBoxEl.style.display = 'none';
      tooltipEl.style.display = 'none';
      return;
    }

    const rect = getFixedRect(el);
    if (rect.width === 0 && rect.height === 0) return;

    positionBox(hoverBoxEl, rect);
    hoverBoxEl.style.display = 'block';

    // 툴팁
    if (info) {
      tooltipEl.textContent = `${info.tagName} • ${info.selector}`;
      tooltipEl.style.display = 'block';
      // 화면 하단에 여유 있으면 아래, 없으면 위
      const tipTop = rect.top + rect.height + 4;
      const tipLeft = rect.left;
      if (tipTop + 30 < window.innerHeight) {
        tooltipEl.style.top = `${tipTop}px`;
      } else {
        tooltipEl.style.top = `${rect.top - 30}px`;
      }
      tooltipEl.style.left = `${Math.min(tipLeft, window.innerWidth - 340)}px`;
    }
  };

  /**
   * 호버 하이라이트 제거
   */
  window.__AGT.clearHover = function () {
    if (hoverBoxEl) hoverBoxEl.style.display = 'none';
    if (tooltipEl) tooltipEl.style.display = 'none';
    currentHoverTarget = null;
  };

  /**
   * 선택된 요소 하이라이트 추가
   * @param {Element} el
   * @param {string} id
   */
  window.__AGT.addSelectedHighlight = function (el, id, orderNumber) {
    if (!overlayEl) window.__AGT.initOverlay();
    if (selectedBoxMap.has(id)) {
      window.__AGT.updateSelectedHighlightOrder(id, orderNumber);
      return;
    }

    const box = createBox(COLORS.selected);
    const rect = getFixedRect(el);
    positionBox(box, rect);
    box.dataset.selId = id;
    box.style.display = markersVisible ? 'block' : 'none';
    overlayEl.appendChild(box);

    let badge = null;
    if (Number.isInteger(orderNumber) && orderNumber > 0) {
      badge = createOrderBadge(orderNumber);
      positionOrderBadge(badge, rect);
      badge.style.display = markersVisible ? 'block' : 'none';
      overlayEl.appendChild(badge);
    }

    selectedBoxMap.set(id, { box, badge, el });
  };

  window.__AGT.updateSelectedHighlightOrder = function (id, orderNumber) {
    if (!overlayEl) return;
    const entry = selectedBoxMap.get(id);
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
      overlayEl.appendChild(entry.badge);
    } else {
      entry.badge.textContent = String(orderNumber);
    }

    if (!document.contains(entry.el)) {
      entry.badge.style.display = 'none';
      return;
    }

    const rect = getFixedRect(entry.el);
    positionOrderBadge(entry.badge, rect);
    entry.badge.style.display = markersVisible ? 'block' : 'none';
  };

  window.__AGT.updateSelectionCounter = function (count, isActive) {
    if (!overlayEl) {
      if (!isActive) return;
      window.__AGT.initOverlay();
    }
    if (!counterEl) return;
    if (!isActive) {
      counterEl.style.display = 'none';
      hasCounterSnapshot = false;
      return;
    }

    const isNumberChanged = hasCounterSnapshot && count !== lastCounterCount;
    const diff = isNumberChanged ? (count - lastCounterCount) : 0;
    const diffColor = diff > 0 ? '#22c55e' : '#f59e0b';
    const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
    const diffHtml = isNumberChanged
      ? ` <span style="margin-left:6px;color:${diffColor};font-weight:800;">${diffSign}</span>`
      : '';

    counterEl.innerHTML = `<span style="opacity:0.85;">선택</span> <span style="color:#93c5fd;">${count}</span>${diffHtml}`;
    counterEl.style.display = 'block';

    if (isNumberChanged) {
      counterEl.animate(
        [
          { transform: 'translateY(-8px) scale(0.9)', opacity: 0.5 },
          { transform: 'translateY(0px) scale(1.08)', opacity: 1 },
          { transform: 'translateY(0px) scale(1)', opacity: 1 }
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    lastCounterCount = count;
    hasCounterSnapshot = true;
  };

  window.__AGT.setHighlightColors = function (colors) {
    const selected = normalizeHexColor(colors && colors.selected, COLORS.selected.border);
    const search = normalizeHexColor(colors && colors.search, COLORS.search.border);
    COLORS.selected = buildHighlightColor(selected, 0.12);
    COLORS.search = buildHighlightColor(search, 0.12);
    applyHighlightColorToExisting();
    return {
      selected: COLORS.selected.border,
      search: COLORS.search.border
    };
  };

  window.__AGT.getHighlightColors = function () {
    return {
      selected: COLORS.selected.border,
      search: COLORS.search.border
    };
  };

  window.__AGT.setMarkersVisible = function (visible) {
    markersVisible = !!visible;
    applyMarkersVisibility();
    return markersVisible;
  };

  window.__AGT.getMarkersVisible = function () {
    return markersVisible;
  };

  /**
   * 특정 선택 하이라이트 제거
   * @param {string} id
   */
  window.__AGT.removeSelectedHighlight = function (id) {
    const entry = selectedBoxMap.get(id);
    if (entry) {
      entry.box.remove();
      if (entry.badge) entry.badge.remove();
      selectedBoxMap.delete(id);
    }
  };

  /**
   * 모든 선택 하이라이트 제거
   */
  window.__AGT.clearAllHighlights = function () {
    selectedBoxMap.forEach(({ box, badge }) => {
      box.remove();
      if (badge) badge.remove();
    });
    selectedBoxMap.clear();
    window.__AGT.clearHover();
  };

  /**
   * 검색 결과 하이라이트
   * @param {NodeList|Array} elements
   */
  window.__AGT.showSearchHighlights = function (elements) {
    // 기존 검색 박스 제거
    if (overlayEl) {
      overlayEl.querySelectorAll('[data-search-highlight]').forEach(el => el.remove());
    }
    if (!overlayEl) window.__AGT.initOverlay();

    elements.forEach(el => {
      const box = createBox(COLORS.search);
      const rect = getFixedRect(el);
      positionBox(box, rect);
      box.dataset.searchHighlight = '1';
      box.style.display = markersVisible ? 'block' : 'none';
      overlayEl.appendChild(box);
    });
  };

  /**
   * 검색 하이라이트 제거
   */
  window.__AGT.clearSearchHighlights = function () {
    if (!overlayEl) return;
    overlayEl.querySelectorAll('[data-search-highlight]').forEach(el => el.remove());
  };

  /**
   * 스크롤/리사이즈 시 선택 박스 위치 업데이트
   */
  function updatePositions() {
    selectedBoxMap.forEach(({ box, badge, el }) => {
      if (!document.contains(el)) {
        box.style.display = 'none';
        if (badge) badge.style.display = 'none';
        return;
      }
      const rect = getFixedRect(el);
      positionBox(box, rect);
      box.style.display = markersVisible ? 'block' : 'none';
      if (badge) {
        positionOrderBadge(badge, rect);
        badge.style.display = markersVisible ? 'block' : 'none';
      }
    });

    // 검색 박스도 업데이트 (검색 결과 요소 추적은 생략 — 검색 재실행으로 처리)

    // 호버 박스 업데이트
    if (currentHoverTarget) {
      const rect = getFixedRect(currentHoverTarget);
      positionBox(hoverBoxEl, rect);
    }

    rafId = null;
  }

  function scheduleUpdate() {
    if (rafId) return;
    rafId = requestAnimationFrame(updatePositions);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('resize', ensureCounterInViewport, { passive: true });
  window.addEventListener('mousemove', onCounterDragMove, true);
  window.addEventListener('mouseup', onCounterDragEnd, true);

  // ────────────────────────────────────────────
  // 주석 입력 팝오버
  // ────────────────────────────────────────────
  const POPOVER_ID = '__agentation-popover__';
  let popoverEl = null;
  let popoverCallbacks = null;

  /**
   * 요소 클릭 시 주석 입력 팝오버 표시
   * @param {Element} targetEl   - 선택된 DOM 요소
   * @param {Object}  info       - { tagName, selector, innerText }
   * @param {Function} onAdd     - (annotationText) => void
   * @param {Function} onCancel  - () => void
   */
  window.__AGT.showAnnotationPopover = function (targetEl, info, onAdd, onCancel) {
    // 기존 팝오버 제거
    window.__AGT.hideAnnotationPopover();

    const rect = targetEl.getBoundingClientRect();
    const popoverW = 300;
    const popoverH = 170; // 대략적 높이

    // 수평 위치: 요소 왼쪽 정렬, 화면 우측 넘치면 우측 정렬
    let left = rect.left;
    if (left + popoverW > window.innerWidth - 8) {
      left = window.innerWidth - popoverW - 8;
    }
    left = Math.max(8, left);

    // 수직 위치: 요소 아래 표시, 공간 부족 시 위쪽
    let top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= popoverH + 8) {
      top = rect.bottom + 6;
    } else {
      top = rect.top - popoverH - 6;
    }
    top = Math.max(8, top);

    // 제목용 텍스트 (tag + 텍스트 미리보기)
    const titleText = `${info.tagName.toLowerCase()} "${(info.innerText || info.selector || '').slice(0, 40)}"`;

    popoverEl = document.createElement('div');
    popoverEl.id = POPOVER_ID;
    popoverEl.setAttribute('data-agt-own', '1');

    Object.assign(popoverEl.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${popoverW}px`,
      zIndex: Z_INDEX.popover,
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      padding: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '13px',
      color: '#f1f5f9',
      boxSizing: 'border-box'
    });

    popoverEl.innerHTML = `
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;word-break:break-all;font-family:monospace;">
        ${escapeHtmlInner(titleText)}
      </div>
      <textarea
        id="__agt-note-input__"
        placeholder="What should change?"
        rows="3"
        style="
          width:100%;
          background:#0f172a;
          border:1.5px solid #3b82f6;
          border-radius:6px;
          color:#f1f5f9;
          font-size:13px;
          padding:8px 10px;
          resize:none;
          outline:none;
          box-sizing:border-box;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          line-height:1.5;
        "
      ></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
        <button id="__agt-cancel-btn__" style="
          padding:6px 14px;border-radius:6px;
          background:transparent;border:1px solid #475569;
          color:#94a3b8;cursor:pointer;font-size:12px;font-weight:500;
        ">Cancel</button>
        <button id="__agt-add-btn__" style="
          padding:6px 16px;border-radius:6px;
          background:#3b82f6;border:none;
          color:#fff;cursor:pointer;font-size:12px;font-weight:600;
        ">Add</button>
      </div>
    `;

    document.documentElement.appendChild(popoverEl);

    const textarea = popoverEl.querySelector('#__agt-note-input__');
    const cancelBtn = popoverEl.querySelector('#__agt-cancel-btn__');
    const addBtn = popoverEl.querySelector('#__agt-add-btn__');

    // 포커스
    requestAnimationFrame(() => textarea && textarea.focus());

    function doAdd() {
      const text = textarea ? textarea.value.trim() : '';
      window.__AGT.hideAnnotationPopover();
      if (onAdd) onAdd(text);
    }

    function doCancel() {
      window.__AGT.hideAnnotationPopover();
      if (onCancel) onCancel();
    }

    addBtn.addEventListener('click', doAdd);
    cancelBtn.addEventListener('click', doCancel);

    // Ctrl+Enter → Add, Escape → Cancel
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAdd(); }
      // Shift+Enter → 줄바꿈 허용
    });

    // 팝오버 외부 클릭 시 취소
    function onOutside(e) {
      if (popoverEl && !popoverEl.contains(e.target)) {
        doCancel();
        document.removeEventListener('mousedown', onOutside, true);
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 50);

    popoverCallbacks = { doAdd, doCancel };
  };

  /**
   * 팝오버 제거
   */
  window.__AGT.hideAnnotationPopover = function () {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }
    popoverCallbacks = null;
  };

  function escapeHtmlInner(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 오버레이 완전 제거 (비활성화 시)
   */
  window.__AGT.destroyOverlay = function () {
    window.__AGT.hideAnnotationPopover();
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      hoverBoxEl = null;
    }
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
    if (counterEl) {
      counterEl.remove();
      counterEl = null;
    }
    selectedBoxMap.clear();
    currentHoverTarget = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

})();
