/**
 * dom-utils.js — DOM 데이터 수집 유틸리티
 * content.js, selector.js, overlay.js 보다 먼저 로드됨
 */

(function () {
  'use strict';

  window.__AGT = window.__AGT || {};

  function getColumnHeaders(cell) {
    const table = cell.closest('table');
    if (!table) return [];

    const thead = table.querySelector('thead');
    if (!thead) return [];

    const headerRows = Array.from(thead.querySelectorAll('tr'));
    if (headerRows.length === 0) return [];

    // find column index of this cell (colspan-aware)
    const row = cell.closest('tr');
    if (!row) return [];
    let colIndex = 0;
    for (const c of Array.from(row.cells)) {
      if (c === cell) break;
      colIndex += (c.colSpan || 1);
    }

    // collect header text from each header row at that column position
    const headers = [];
    for (const hRow of headerRows) {
      let pos = 0;
      for (const hCell of Array.from(hRow.cells)) {
        const span = hCell.colSpan || 1;
        if (pos <= colIndex && colIndex < pos + span) {
          const text = (hCell.innerText || hCell.textContent || '').trim();
          if (text) headers.push(text);
          break;
        }
        pos += span;
      }
    }

    return headers;
  }

  function getTableContext(el) {
    const CELL_TAGS = new Set(['TD', 'TH']);
    const TABLE_STRUCTURE_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION']);

    if (!TABLE_STRUCTURE_TAGS.has(el.tagName)) return null;

    const ctx = { tagName: el.tagName };

    if (CELL_TAGS.has(el.tagName)) {
      // rowspan / colspan
      ctx.rowspan = el.rowSpan > 1 ? el.rowSpan : undefined;
      ctx.colspan = el.colSpan > 1 ? el.colSpan : undefined;

      // visual column index (1-based, colspan-aware)
      const row = el.closest('tr');
      if (row) {
        let col = 0;
        for (const cell of Array.from(row.cells)) {
          if (cell === el) break;
          col += (cell.colSpan || 1);
        }
        ctx.colIndex = col + 1;
      }

      // visible row index (1-based, skips display:none rows)
      const table = el.closest('table');
      if (table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const visibleRows = allRows.filter(r => getComputedStyle(r).display !== 'none');
        const currentRow = el.closest('tr');
        const idx = visibleRows.indexOf(currentRow);
        ctx.visibleRowIndex = idx >= 0 ? idx + 1 : undefined;
      }

      // column headers from thead (multi-level aware)
      ctx.columnHeaders = getColumnHeaders(el);
    }

    if (el.tagName === 'TR') {
      // visible row index for TR
      const table = el.closest('table');
      if (table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const visibleRows = allRows.filter(r => getComputedStyle(r).display !== 'none');
        const idx = visibleRows.indexOf(el);
        ctx.visibleRowIndex = idx >= 0 ? idx + 1 : undefined;
      }
    }

    if (el.tagName === 'TABLE') {
      const allRows = Array.from(el.querySelectorAll('tr'));
      const visibleRows = allRows.filter(r => getComputedStyle(r).display !== 'none');
      ctx.visibleRowCount = visibleRows.length;
      // column count from first row
      const firstRow = el.querySelector('tr');
      if (firstRow) {
        ctx.colCount = Array.from(firstRow.cells).reduce((sum, c) => sum + (c.colSpan || 1), 0);
      }
    }

    return ctx;
  }

  /**
   * 요소의 모든 컨텍스트 데이터 수집
   * @param {Element} el
   * @returns {Object}
   */
  window.__AGT.collectElementData = function (el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    const rect = el.getBoundingClientRect();
    const attrs = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value;
    }

    // innerText 정리 (최대 200자)
    const rawText = (el.innerText || el.textContent || '').trim();
    const innerText = rawText.length > 200 ? rawText.slice(0, 200) + '…' : rawText;
    const tableContext = getTableContext(el);

    const selector = window.__AGT.generateSelector
      ? window.__AGT.generateSelector(el)
      : { selector: el.tagName.toLowerCase(), strategy: 'fallback' };

    const data = {
      id: `sel_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      selector: selector.selector,
      strategy: selector.strategy,
      tagName: el.tagName,
      innerText,
      attributes: attrs,
      boundingBox: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      url: location.href,
      timestamp: Date.now()
    };

    if (tableContext) data.tableContext = tableContext;

    return data;
  };

  /**
   * 안전한 querySelector
   * @param {string} selector
   * @param {Document|Element} root
   * @returns {Element|null}
   */
  window.__AGT.safeQuerySelector = function (selector, root) {
    root = root || document;
    try {
      return root.querySelector(selector);
    } catch (e) {
      return null;
    }
  };

  /**
   * 안전한 querySelectorAll
   * @param {string} selector
   * @param {Document|Element} root
   * @returns {NodeList}
   */
  window.__AGT.safeQuerySelectorAll = function (selector, root) {
    root = root || document;
    try {
      return root.querySelectorAll(selector);
    } catch (e) {
      return [];
    }
  };

  /**
   * 요소가 현재 뷰포트에 보이는지 확인
   * @param {Element} el
   * @returns {boolean}
   */
  window.__AGT.isVisible = function (el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  };

  /**
   * 요소가 extension 자체 UI인지 확인 (선택 대상 제외)
   * @param {Element} el
   * @returns {boolean}
   */
  window.__AGT.isOwnElement = function (el) {
    return (
      el.id === '__agentation-overlay__' ||
      el.closest('#__agentation-overlay__') !== null ||
      el.id === '__agentation-tooltip__' ||
      el.closest('#__agentation-tooltip__') !== null ||
      el.id === '__agentation-popover__' ||
      el.closest('#__agentation-popover__') !== null ||
      el.dataset.agtOwn === '1' ||
      el.closest('[data-agt-own]') !== null
    );
  };

  /**
   * JSON Export 생성
   * @param {Array} selections
   * @returns {string}
   */
  window.__AGT.exportJSON = function (selections) {
    const data = {
      tool: 'DOM AI Bridge',
      version: '1.0.3',
      url: location.href,
      exportedAt: new Date().toISOString(),
      count: selections.length,
      selections
    };
    return JSON.stringify(data, null, 2);
  };

  /**
   * AI용 Markdown Export (Claude, Cursor 등 AI 프롬프트에 최적화)
   * @param {Array} selections
   * @returns {string}
   */
  window.__AGT.exportAI = function (selections) {
    const lines = [
      `# UI Annotations`,
      `**Page:** ${location.href}`,
      `**Elements:** ${selections.length}`,
      ``
    ];

    selections.forEach((sel, i) => {
      // Truncation is already handled at collect time (200 chars in collectElementData).
      const text = sel.innerText ? `"${sel.innerText}"` : null;
      const hasAnnotation = sel.annotation && sel.annotation.trim();
      const frameContext = sel && sel.frameContext && typeof sel.frameContext === 'object'
        ? sel.frameContext
        : null;
      const selectorText = frameContext && frameContext.composedSelector
        ? frameContext.composedSelector
        : sel.selector;
      const frameLabel = frameContext
        ? (frameContext.frameTitle || frameContext.frameLabel || frameContext.frameUrl || frameContext.frameSelector || '')
        : '';

      lines.push(`---`);
      lines.push(`**[${i + 1}] ${sel.tagName}** \`${selectorText}\``);
      if (frameContext) lines.push(`Frame: ${frameLabel}`);
      if (text) lines.push(`Text: ${text}`);
      if (sel.tableContext) {
        const tc = sel.tableContext;
        const parts = [];
        if (tc.visibleRowIndex !== undefined) parts.push(`Row ${tc.visibleRowIndex}`);
        if (tc.colIndex !== undefined) parts.push(`Col ${tc.colIndex}`);
        if (tc.rowspan) parts.push(`rowspan=${tc.rowspan}`);
        if (tc.colspan) parts.push(`colspan=${tc.colspan}`);
        if (tc.columnHeaders && tc.columnHeaders.length > 0) parts.push(`Header: ${tc.columnHeaders.join(' > ')}`);
        if (tc.visibleRowCount !== undefined) parts.push(`${tc.visibleRowCount} rows`);
        if (tc.colCount !== undefined) parts.push(`${tc.colCount} cols`);
        if (parts.length > 0) lines.push(`  Table: ${parts.join(' | ')}`);
      }
      if (hasAnnotation) lines.push(`> ${sel.annotation}`);
      lines.push(``);
    });

    return lines.join('\n');
  };

  /**
   * 개발자용 Markdown Export (셀렉터 전략, 속성, 위치 등 상세 정보 포함)
   * @param {Array} selections
   * @returns {string}
   */
  window.__AGT.exportMarkdown = function (selections) {
    const lines = [
      `## DOM Selections — ${location.href}`,
      ``,
      `> Total: ${selections.length} elements`,
      ``
    ];

    selections.forEach((sel, i) => {
      const bb = sel.boundingBox;
      const attrStr = Object.entries(sel.attributes || {})
        .filter(([k]) => k !== 'style')
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      const frameContext = sel && sel.frameContext && typeof sel.frameContext === 'object'
        ? sel.frameContext
        : null;
      const selectorText = frameContext && frameContext.composedSelector
        ? frameContext.composedSelector
        : sel.selector;

      lines.push(`### ${i + 1}. ${sel.tagName} — "${sel.innerText || '(no text)'}"`);
      lines.push(`- **Selector**: \`${selectorText}\``);
      if (frameContext) {
        lines.push(`- **Frame**: ${frameContext.frameTitle || frameContext.frameLabel || ''}`);
        if (frameContext.frameUrl) lines.push(`- **Frame URL**: ${frameContext.frameUrl}`);
      }
      lines.push(`- **Strategy**: ${sel.strategy}`);
      lines.push(`- **Tag**: \`${sel.tagName}\``);
      if (sel.innerText) lines.push(`- **Text**: ${sel.innerText}`);
      if (bb) lines.push(`- **Position**: (${bb.x}, ${bb.y}) ${bb.width}×${bb.height}px`);
      if (attrStr) lines.push(`- **Attributes**: ${attrStr}`);
      if (sel.annotation) lines.push(`- **Annotation**: ${sel.annotation}`);
      lines.push(``);
    });

    return lines.join('\n');
  };

  /**
   * 공유용 Plain Text Export (디자이너/기획자와 텍스트로 공유)
   * @param {Array} selections
   * @returns {string}
   */
  window.__AGT.exportPlain = function (selections) {
    const lines = [
      `UI 주석 — ${location.href}`,
      `총 ${selections.length}개 요소`,
      ``
    ];

    selections.forEach((sel, i) => {
      const frameContext = sel && sel.frameContext && typeof sel.frameContext === 'object'
        ? sel.frameContext
        : null;
      const selectorText = frameContext && frameContext.composedSelector
        ? frameContext.composedSelector
        : sel.selector;
      lines.push(`${i + 1}. ${sel.tagName} (${selectorText})`);
      if (frameContext) {
        lines.push(`   프레임: ${frameContext.frameTitle || frameContext.frameLabel || frameContext.frameUrl || ''}`);
      }
      if (sel.innerText) lines.push(`   텍스트: "${sel.innerText.slice(0, 80)}"`);
      if (sel.annotation) lines.push(`   주석: ${sel.annotation}`);
      else lines.push(`   주석: (없음)`);
      lines.push(``);
    });

    return lines.join('\n');
  };

})();
