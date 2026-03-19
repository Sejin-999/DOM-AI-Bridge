/**
 * dom-utils.js — DOM 데이터 수집 유틸리티
 * content.js, selector.js, overlay.js 보다 먼저 로드됨
 */

(function () {
  'use strict';

  window.__AGT = window.__AGT || {};

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

    const selector = window.__AGT.generateSelector
      ? window.__AGT.generateSelector(el)
      : { selector: el.tagName.toLowerCase(), strategy: 'fallback' };

    return {
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
