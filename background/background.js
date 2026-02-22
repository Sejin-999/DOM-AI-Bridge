/**
 * background.js — Service Worker (Manifest v3)
 * popup ↔ content script 메시지 중계 및 탭별 상태 관리
 */

const tabActiveState = new Map();

const I18N_STORAGE_KEY = 'agt_locale';
const I18N_AUTO_VALUE = 'auto';
const I18N_DEFAULT_LOCALE = 'ko';
const I18N_META_PATH = '_locales/languages.json';

let localeMetaCache = null;
const localeMessageCache = new Map();

function normalizeLocale(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function normalizeLocalePreference(value) {
  const normalized = normalizeLocale(value);
  return normalized || I18N_AUTO_VALUE;
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(result ? result[key] : null);
    });
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function fetchJson(path) {
  try {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    return await response.json();
  } catch (_err) {
    return null;
  }
}

function normalizeLocaleMeta(raw) {
  const fallback = {
    defaultLocale: I18N_DEFAULT_LOCALE,
    locales: [
      { code: 'ko', label: '한국어' },
      { code: 'en', label: 'English' }
    ]
  };

  if (!raw || typeof raw !== 'object') return fallback;

  const defaultLocale = normalizeLocale(raw.defaultLocale) || fallback.defaultLocale;
  const localeList = Array.isArray(raw.locales) ? raw.locales : [];
  const dedup = new Map();

  localeList.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const code = normalizeLocale(entry.code);
    if (!code) return;
    dedup.set(code, {
      code,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : code
    });
  });

  if (!dedup.has(defaultLocale)) {
    dedup.set(defaultLocale, {
      code: defaultLocale,
      label: defaultLocale
    });
  }

  return {
    defaultLocale,
    locales: Array.from(dedup.values())
  };
}

async function loadLocaleMeta() {
  if (localeMetaCache) return localeMetaCache;
  const raw = await fetchJson(I18N_META_PATH);
  localeMetaCache = normalizeLocaleMeta(raw);
  return localeMetaCache;
}

function flattenChromeMessages(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;

  Object.entries(raw).forEach(([key, val]) => {
    if (!key) return;
    if (val && typeof val.message === 'string') {
      result[key] = val.message;
    }
  });

  return result;
}

async function loadLocaleMessages(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return {};
  if (localeMessageCache.has(normalized)) {
    return localeMessageCache.get(normalized);
  }

  const raw = await fetchJson(`_locales/${normalized}/messages.json`);
  const flattened = flattenChromeMessages(raw);
  localeMessageCache.set(normalized, flattened);
  return flattened;
}

function resolveLocaleFromAvailable(inputLocale, availableCodes) {
  const normalized = normalizeLocale(inputLocale);
  if (!normalized) return '';
  if (availableCodes.has(normalized)) return normalized;

  const base = normalized.split('-')[0];
  if (availableCodes.has(base)) return base;

  for (const code of availableCodes) {
    if (code.split('-')[0] === base) return code;
  }
  return '';
}

async function buildI18nState() {
  const meta = await loadLocaleMeta();
  const localePreference = normalizeLocalePreference(await storageGet(I18N_STORAGE_KEY));
  const availableLocales = meta.locales;
  const availableCodes = new Set(availableLocales.map((locale) => locale.code));

  const uiLanguage = normalizeLocale(chrome.i18n.getUILanguage());
  const preferredByUi = resolveLocaleFromAvailable(uiLanguage, availableCodes);
  const preferredBySetting = localePreference === I18N_AUTO_VALUE
    ? ''
    : resolveLocaleFromAvailable(localePreference, availableCodes);

  const resolvedLocale = preferredBySetting
    || preferredByUi
    || resolveLocaleFromAvailable(meta.defaultLocale, availableCodes)
    || I18N_DEFAULT_LOCALE;

  const fallbackMessages = await loadLocaleMessages(meta.defaultLocale || I18N_DEFAULT_LOCALE);
  const localeMessages = resolvedLocale === meta.defaultLocale
    ? fallbackMessages
    : await loadLocaleMessages(resolvedLocale);

  return {
    localePreference,
    locale: resolvedLocale,
    availableLocales,
    messages: Object.assign({}, fallbackMessages, localeMessages)
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, tabId, payload } = message || {};

  if (type === 'FORWARD_TO_CONTENT') {
    const targetTabId = tabId;
    chrome.tabs.sendMessage(targetTabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
    return true;
  }

  if (type === 'I18N_GET_STATE') {
    void (async () => {
      const state = await buildI18nState();
      sendResponse(state);
    })();
    return true;
  }

  if (type === 'I18N_SET_LOCALE') {
    void (async () => {
      const locale = normalizeLocalePreference(payload && payload.locale);
      await storageSet({ [I18N_STORAGE_KEY]: locale });
      const state = await buildI18nState();
      sendResponse(state);
    })();
    return true;
  }

  if (type === 'SET_ACTIVE_STATE') {
    const senderTabId = sender.tab && sender.tab.id;
    if (senderTabId) {
      tabActiveState.set(senderTabId, !!(payload && payload.isActive));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (type === 'GET_ACTIVE_STATE') {
    const state = tabActiveState.get(tabId) ?? false;
    sendResponse({ isActive: state });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActiveState.delete(tabId);
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: [
          'shared/i18n.js',
          'content/dom-utils.js',
          'content/selector.js',
          'content/overlay.js',
          'content/content.js'
        ]
      });
    } catch (_e) {
      // chrome://, about:, 확장 페이지 등 주입 불가 탭은 무시
    }
  }
});
