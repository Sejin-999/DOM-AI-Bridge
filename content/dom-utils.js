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
      tool: 'Agentation DOM Inspector',
      version: '1.0.0',
      url: location.href,
      exportedAt: new Date().toISOString(),
      count: selections.length,
      selections
    };
    return JSON.stringify(data, null, 2);
  };

  /**
   * Markdown Export 생성
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

      lines.push(`### ${i + 1}. ${sel.tagName} — "${sel.innerText || '(no text)'}"`);
      lines.push(`- **Selector**: \`${sel.selector}\``);
      lines.push(`- **Strategy**: ${sel.strategy}`);
      lines.push(`- **Tag**: \`${sel.tagName}\``);
      if (sel.innerText) lines.push(`- **Text**: ${sel.innerText}`);
      if (bb) lines.push(`- **Position**: (${bb.x}, ${bb.y}) ${bb.width}×${bb.height}px`);
      if (attrStr) lines.push(`- **Attributes**: ${attrStr}`);
      lines.push(``);
    });

    return lines.join('\n');
  };

})();
