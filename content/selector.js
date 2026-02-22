/**
 * selector.js — CSS 셀렉터 자동 생성 엔진
 * dom-utils.js 다음에 로드됨
 */

(function () {
  'use strict';

  window.__AGT = window.__AGT || {};

  // 시맨틱 속성 우선순위 목록
  const SEMANTIC_ATTRS = [
    'data-testid', 'data-cy', 'data-test', 'data-qa',
    'data-id', 'name', 'aria-label', 'aria-labelledby',
    'role', 'title', 'placeholder', 'alt', 'href'
  ];

  /**
   * 셀렉터 유일성 검증
   * @param {string} selector
   * @param {Element} el
   * @param {Document|Element} root
   * @returns {boolean}
   */
  function isUniqueSelector(selector, el, root) {
    root = root || document;
    try {
      const results = root.querySelectorAll(selector);
      return results.length === 1 && results[0] === el;
    } catch (e) {
      return false;
    }
  }

  /**
   * ID 셀렉터 시도
   */
  function tryIdSelector(el) {
    if (!el.id || el.id.trim() === '') return null;
    // 숫자로만 시작하는 ID는 CSS에서 이스케이프 필요
    const id = el.id;
    const selector = `#${CSS.escape(id)}`;
    if (isUniqueSelector(selector, el)) {
      return { selector, strategy: 'id' };
    }
    return null;
  }

  /**
   * 시맨틱 속성 셀렉터 시도
   */
  function tryAttributeSelector(el) {
    for (const attr of SEMANTIC_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val || val.trim() === '') continue;
      const tag = el.tagName.toLowerCase();
      // 값이 너무 길면 스킵
      if (val.length > 100) continue;
      const selector = `${tag}[${attr}="${CSS.escape(val)}"]`;
      if (isUniqueSelector(selector, el)) {
        return { selector, strategy: 'attribute' };
      }
      // tag 없이도 시도
      const selectorNoTag = `[${attr}="${CSS.escape(val)}"]`;
      if (isUniqueSelector(selectorNoTag, el)) {
        return { selector: selectorNoTag, strategy: 'attribute' };
      }
    }
    return null;
  }

  /**
   * 고유 클래스 조합 셀렉터 시도
   */
  function tryClassSelector(el) {
    const classes = Array.from(el.classList).filter(c => {
      // 동적 클래스 패턴 제외 (숫자, 해시 등)
      return c.length > 0 &&
        !c.match(/^[\d]/) &&
        !c.match(/[a-f0-9]{6,}/i) && // 해시
        !c.match(/^\d/) &&
        c.length < 60;
    });

    if (classes.length === 0) return null;

    const tag = el.tagName.toLowerCase();

    // 단일 클래스부터 조합 시도 (최대 3개)
    for (let size = 1; size <= Math.min(3, classes.length); size++) {
      const combos = getCombinations(classes, size);
      for (const combo of combos) {
        const classStr = combo.map(c => `.${CSS.escape(c)}`).join('');
        const selector = `${tag}${classStr}`;
        if (isUniqueSelector(selector, el)) {
          return { selector, strategy: 'class' };
        }
      }
    }
    return null;
  }

  /**
   * 배열에서 size 크기의 모든 조합 반환
   */
  function getCombinations(arr, size) {
    if (size === 1) return arr.map(x => [x]);
    const result = [];
    for (let i = 0; i <= arr.length - size; i++) {
      const rest = getCombinations(arr.slice(i + 1), size - 1);
      for (const combo of rest) {
        result.push([arr[i], ...combo]);
      }
    }
    return result;
  }

  /**
   * 요소의 nth-child 인덱스 반환
   */
  function getNthChildIndex(el) {
    let n = 1;
    let sibling = el.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === el.tagName) n++;
      sibling = sibling.previousElementSibling;
    }
    // 같은 태그 형제가 하나뿐이면 nth-child 불필요
    let hasTypeSiblings = false;
    let s = el.parentElement?.firstElementChild;
    while (s) {
      if (s !== el && s.tagName === el.tagName) {
        hasTypeSiblings = true;
        break;
      }
      s = s.nextElementSibling;
    }
    return hasTypeSiblings ? n : null;
  }

  /**
   * 단일 요소에 대한 로컬 셀렉터 세그먼트 생성
   */
  function getLocalSelector(el) {
    const tag = el.tagName.toLowerCase();

    // ID 우선
    if (el.id && el.id.trim()) {
      return `#${CSS.escape(el.id)}`;
    }

    // 클래스
    const classes = Array.from(el.classList).filter(c =>
      c.length > 0 && c.length < 60 && !c.match(/[a-f0-9]{6,}/i)
    );
    if (classes.length > 0) {
      const classStr = classes.slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
      const selector = `${tag}${classStr}`;
      return selector;
    }

    // nth-child
    const n = getNthChildIndex(el);
    if (n !== null) {
      return `${tag}:nth-of-type(${n})`;
    }

    return tag;
  }

  /**
   * 경로 기반 셀렉터 생성 (fallback)
   * 문서 루트까지 올라가며 고유 경로 구성
   */
  function buildPathSelector(el) {
    const parts = [];
    let current = el;
    const MAX_DEPTH = 8;
    let depth = 0;

    while (current && current !== document.documentElement && depth < MAX_DEPTH) {
      const seg = getLocalSelector(current);
      parts.unshift(seg);

      // 현재까지 쌓인 경로로 유일한지 확인
      const candidateSelector = parts.join(' > ');
      if (isUniqueSelector(candidateSelector, el)) {
        return { selector: candidateSelector, strategy: 'nth-child-path' };
      }

      // ID 세그먼트에 도달하면 중단
      if (seg.startsWith('#')) break;

      current = current.parentElement;
      depth++;
    }

    return {
      selector: parts.join(' > '),
      strategy: 'nth-child-path'
    };
  }

  /**
   * Shadow DOM 처리
   */
  function isShadowChild(el) {
    const root = el.getRootNode();
    return root instanceof ShadowRoot;
  }

  /**
   * 메인 셀렉터 생성 함수
   * @param {Element} el
   * @returns {{ selector: string, strategy: string }}
   */
  window.__AGT.generateSelector = function (el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return { selector: '*', strategy: 'unknown' };
    }

    // Shadow DOM 내부 요소
    if (isShadowChild(el)) {
      const localResult = tryIdSelector(el) || tryAttributeSelector(el) || buildPathSelector(el);
      return {
        selector: localResult.selector,
        strategy: 'shadow-' + localResult.strategy
      };
    }

    // 1. ID
    const idResult = tryIdSelector(el);
    if (idResult) return idResult;

    // 2. 시맨틱 속성
    const attrResult = tryAttributeSelector(el);
    if (attrResult) return attrResult;

    // 3. 클래스 조합
    const classResult = tryClassSelector(el);
    if (classResult) return classResult;

    // 4. 경로 (nth-child fallback)
    return buildPathSelector(el);
  };

})();
