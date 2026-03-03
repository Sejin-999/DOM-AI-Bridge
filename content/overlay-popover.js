/**
 * overlay-popover.js — 주석 팝오버 + i18n 갱신
 * window.__AGT_OVERLAY(S)의 상태를 사용
 */

(function () {
  'use strict';

  const S = window.__AGT_OVERLAY;

  /**
   * 요소 클릭 시 주석 입력 팝오버 표시
   * @param {Element}  targetEl  - 선택된 DOM 요소
   * @param {Object}   info      - { tagName, selector, innerText }
   * @param {Function} onAdd     - (annotationText) => void
   * @param {Function} onCancel  - () => void
   */
  window.__AGT.showAnnotationPopover = function (targetEl, info, onAdd, onCancel) {
    window.__AGT.hideAnnotationPopover();

    const rect = targetEl.getBoundingClientRect();
    const popoverW = 300;
    const popoverH = 170;

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

    const titleText = `${info.tagName.toLowerCase()} "${(info.innerText || info.selector || '').slice(0, 40)}"`;
    const notePlaceholder = S.t('overlay_popover_placeholder', null, 'What should change?');
    const cancelLabel = S.t('overlay_popover_cancel', null, 'Cancel');
    const addLabel = S.t('overlay_popover_add', null, 'Add');

    S.popoverEl = document.createElement('div');
    S.popoverEl.id = S.POPOVER_ID;
    S.popoverEl.setAttribute('data-agt-own', '1');

    Object.assign(S.popoverEl.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${popoverW}px`,
      zIndex: S.Z_INDEX.popover,
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

    S.popoverEl.innerHTML = `
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;word-break:break-all;font-family:monospace;">
        ${S.escapeHtmlInner(titleText)}
      </div>
      <textarea
        id="__agt-note-input__"
        placeholder="${S.escapeHtmlAttr(notePlaceholder)}"
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
        ">${S.escapeHtmlInner(cancelLabel)}</button>
        <button id="__agt-add-btn__" style="
          padding:6px 16px;border-radius:6px;
          background:#3b82f6;border:none;
          color:#fff;cursor:pointer;font-size:12px;font-weight:600;
        ">${S.escapeHtmlInner(addLabel)}</button>
      </div>
    `;

    document.documentElement.appendChild(S.popoverEl);

    const textarea = S.popoverEl.querySelector('#__agt-note-input__');
    const cancelBtn = S.popoverEl.querySelector('#__agt-cancel-btn__');
    const addBtn = S.popoverEl.querySelector('#__agt-add-btn__');

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

    // Enter → Add, Shift+Enter → 줄바꿈 허용, Escape → Cancel
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAdd(); }
    });

    // 팝오버 외부 클릭 시 취소
    function onOutside(e) {
      if (S.popoverEl && !S.popoverEl.contains(e.target)) {
        doCancel();
        document.removeEventListener('mousedown', onOutside, true);
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 50);

    S.popoverCallbacks = { doAdd, doCancel };
  };

  /**
   * 팝오버 제거
   */
  window.__AGT.hideAnnotationPopover = function () {
    if (S.popoverEl) {
      S.popoverEl.remove();
      S.popoverEl = null;
    }
    S.popoverCallbacks = null;
  };

  /**
   * 언어 변경 시 카운터 + 팝오버 텍스트 갱신
   */
  window.__AGT.refreshOverlayI18n = function () {
    if (S.counterEl) {
      const count = Number.isFinite(S.lastCounterCount) ? S.lastCounterCount : 0;
      S.counterEl.innerHTML = S.buildCounterInnerHtml(count, '');
    }

    if (S.popoverEl) {
      const input = S.popoverEl.querySelector('#__agt-note-input__');
      const cancelBtn = S.popoverEl.querySelector('#__agt-cancel-btn__');
      const addBtn = S.popoverEl.querySelector('#__agt-add-btn__');

      if (input) {
        input.setAttribute(
          'placeholder',
          S.t('overlay_popover_placeholder', null, 'What should change?')
        );
      }
      if (cancelBtn) {
        cancelBtn.textContent = S.t('overlay_popover_cancel', null, 'Cancel');
      }
      if (addBtn) {
        addBtn.textContent = S.t('overlay_popover_add', null, 'Add');
      }
    }
  };

})();
