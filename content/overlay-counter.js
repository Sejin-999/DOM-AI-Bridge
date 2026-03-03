/**
 * overlay-counter.js — 선택 카운터 + 드래그
 * window.__AGT_OVERLAY(S)의 상태를 사용
 */

(function () {
  'use strict';

  const S = window.__AGT_OVERLAY;

  // ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // ── 드래그 핸들러 ─────────────────────────────────────────────────────────

  function onCounterDragStart(e) {
    if (!S.counterEl || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = S.counterEl.getBoundingClientRect();
    S.isCounterDragging = true;
    S.counterDragStartX = e.clientX;
    S.counterDragStartY = e.clientY;
    S.counterDragOriginLeft = rect.left;
    S.counterDragOriginTop = rect.top;
    S.counterDragWidth = rect.width;
    S.counterDragHeight = rect.height;

    S.counterEl.style.left = `${rect.left}px`;
    S.counterEl.style.top = `${rect.top}px`;
    S.counterEl.style.right = 'auto';
    S.counterEl.style.bottom = 'auto';
    S.counterEl.style.cursor = 'grabbing';
  }

  function onCounterDragMove(e) {
    if (!S.isCounterDragging || !S.counterEl) return;

    const dx = e.clientX - S.counterDragStartX;
    const dy = e.clientY - S.counterDragStartY;
    const maxLeft = Math.max(8, window.innerWidth - S.counterDragWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - S.counterDragHeight - 8);
    const nextLeft = clamp(S.counterDragOriginLeft + dx, 8, maxLeft);
    const nextTop = clamp(S.counterDragOriginTop + dy, 8, maxTop);

    S.counterEl.style.left = `${nextLeft}px`;
    S.counterEl.style.top = `${nextTop}px`;
  }

  function onCounterDragEnd() {
    if (!S.isCounterDragging || !S.counterEl) return;
    S.isCounterDragging = false;
    S.counterEl.style.cursor = 'grab';
  }

  function ensureCounterInViewport() {
    if (!S.counterEl) return;
    const rect = S.counterEl.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const nextLeft = clamp(rect.left, 8, maxLeft);
    const nextTop = clamp(rect.top, 8, maxTop);

    if (Math.abs(nextLeft - rect.left) > 0.5 || Math.abs(nextTop - rect.top) > 0.5) {
      S.counterEl.style.left = `${nextLeft}px`;
      S.counterEl.style.top = `${nextTop}px`;
      S.counterEl.style.right = 'auto';
      S.counterEl.style.bottom = 'auto';
    }
  }

  // ── 내부 함수 노출 (overlay.js 이벤트 등록에서 사용) ─────────────────────

  S.onCounterDragStart = onCounterDragStart;
  S.onCounterDragMove = onCounterDragMove;
  S.onCounterDragEnd = onCounterDragEnd;
  S.ensureCounterInViewport = ensureCounterInViewport;

  // ── 공개 API ──────────────────────────────────────────────────────────────

  window.__AGT.updateSelectionCounter = function (count, isActive) {
    if (!S.overlayEl) {
      if (!isActive) return;
      window.__AGT.initOverlay();
    }
    if (!S.counterEl) return;
    if (!isActive) {
      S.counterEl.style.display = 'none';
      S.hasCounterSnapshot = false;
      return;
    }

    const isNumberChanged = S.hasCounterSnapshot && count !== S.lastCounterCount;
    const diff = isNumberChanged ? (count - S.lastCounterCount) : 0;
    const diffColor = diff > 0 ? '#22c55e' : '#f59e0b';
    const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
    const diffHtml = isNumberChanged
      ? ` <span style="margin-left:6px;color:${diffColor};font-weight:800;">${diffSign}</span>`
      : '';

    S.counterEl.innerHTML = S.buildCounterInnerHtml(count, diffHtml);
    S.counterEl.style.display = 'block';

    if (isNumberChanged) {
      S.counterEl.animate(
        [
          { transform: 'translateY(-8px) scale(0.9)', opacity: 0.5 },
          { transform: 'translateY(0px) scale(1.08)', opacity: 1 },
          { transform: 'translateY(0px) scale(1)', opacity: 1 }
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    S.lastCounterCount = count;
    S.hasCounterSnapshot = true;
  };

})();
