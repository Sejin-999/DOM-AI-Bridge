/**
 * shared/i18n.js
 * popup/content 공용 i18n 클라이언트
 */

(function () {
  'use strict';

  const FALLBACK_LOCALE = 'ko';
  const AUTO_VALUE = 'auto';

  let state = {
    locale: FALLBACK_LOCALE,
    localePreference: AUTO_VALUE,
    availableLocales: [],
    messages: {}
  };

  let initPromise = null;
  const listeners = new Set();

  function cloneState() {
    return {
      locale: state.locale,
      localePreference: state.localePreference,
      availableLocales: Array.isArray(state.availableLocales) ? state.availableLocales.slice() : [],
      messages: Object.assign({}, state.messages)
    };
  }

  function normalizeLocale(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase().replace(/_/g, '-');
  }

  function applyState(next) {
    if (!next || typeof next !== 'object') return;

    state = {
      locale: normalizeLocale(next.locale) || FALLBACK_LOCALE,
      localePreference: normalizeLocale(next.localePreference) || AUTO_VALUE,
      availableLocales: Array.isArray(next.availableLocales) ? next.availableLocales : [],
      messages: next.messages && typeof next.messages === 'object' ? next.messages : {}
    };

    listeners.forEach((listener) => {
      try {
        listener(cloneState());
      } catch (_err) {
        // listener 오류는 무시
      }
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  function interpolate(raw, vars) {
    if (!vars || typeof vars !== 'object') return raw;
    return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
      if (!Object.prototype.hasOwnProperty.call(vars, key)) return full;
      const value = vars[key];
      if (value === null || value === undefined) return '';
      return String(value);
    });
  }

  async function refreshFromBackground() {
    const response = await sendRuntimeMessage({ type: 'I18N_GET_STATE' });
    if (!response) return cloneState();
    applyState(response);
    return cloneState();
  }

  function init() {
    if (!initPromise) {
      initPromise = refreshFromBackground();
    }
    return initPromise;
  }

  async function refresh() {
    return refreshFromBackground();
  }

  async function setLocalePreference(locale) {
    const normalized = normalizeLocale(locale) || AUTO_VALUE;
    const response = await sendRuntimeMessage({
      type: 'I18N_SET_LOCALE',
      payload: { locale: normalized }
    });
    if (response) {
      applyState(response);
    }
    return cloneState();
  }

  function t(key, vars, fallback) {
    if (typeof key !== 'string' || key.length === 0) return '';
    const table = state.messages || {};
    const base = Object.prototype.hasOwnProperty.call(table, key)
      ? table[key]
      : (typeof fallback === 'string' ? fallback : key);
    return interpolate(String(base), vars);
  }

  function applyToDocument(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = t(key, null, el.textContent || '');
    });

    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      el.title = t(key, null, el.title || '');
    });

    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.setAttribute('placeholder', t(key, null, el.getAttribute('placeholder') || ''));
    });

    scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (!key) return;
      el.setAttribute('aria-label', t(key, null, el.getAttribute('aria-label') || ''));
    });
  }

  function onChange(listener) {
    if (typeof listener !== 'function') {
      return function noop() {};
    }
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  window.__AGT_I18N = {
    init,
    refresh,
    setLocalePreference,
    getState: cloneState,
    t,
    applyToDocument,
    onChange
  };
})();
