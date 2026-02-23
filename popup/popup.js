/**
 * popup.js — 팝업 UI 로직
 * content script와 chrome.tabs.sendMessage로 직접 통신
 */

(function () {
  'use strict';

  let currentTabId = null;
  let currentState = {
    isActive: false,
    selections: [],
    canUndo: false,
    canRedo: false,
    url: ''
  };

  // ──────────────────────────────────────────
  // DOM 참조
  // ──────────────────────────────────────────
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleLabel = document.getElementById('toggleLabel');
  const tabCount = document.getElementById('tabCount');
  const selCount = document.getElementById('selCount');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const selectionList = document.getElementById('selectionList');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResult = document.getElementById('searchResult');
  const statusUrl = document.getElementById('statusUrl');
  const markerToggleBtn = document.getElementById('markerToggleBtn');
  const toast = document.getElementById('toast');
  const osWinBtn = document.getElementById('osWinBtn');
  const osMacBtn = document.getElementById('osMacBtn');
  const shortcutOsLabel = document.getElementById('shortcutOsLabel');
  const shortcutTableBody = document.getElementById('shortcutTableBody');
  const selectedColorInput = document.getElementById('selectedColorInput');
  const searchColorInput = document.getElementById('searchColorInput');
  const selectedColorHex = document.getElementById('selectedColorHex');
  const searchColorHex = document.getElementById('searchColorHex');
  const selectedColorPalette = document.getElementById('selectedColorPalette');
  const searchColorPalette = document.getElementById('searchColorPalette');
  const resetHighlightColorsBtn = document.getElementById('resetHighlightColorsBtn');
  const languageSelect = document.getElementById('languageSelect');
  const openWebhookPageBtn = document.getElementById('openWebhookPageBtn');
  const webhookBackBtn = document.getElementById('webhookBackBtn');
  const addWebhookTargetBtn = document.getElementById('addWebhookTargetBtn');
  const webhookTargetEmpty = document.getElementById('webhookTargetEmpty');
  const webhookTargetList = document.getElementById('webhookTargetList');

  let clearAllDefaultText = '';
  let clearAllDefaultTitle = '';
  let clearAllConfirmArmed = false;
  let clearAllConfirmTimer = null;
  let shortcutPlatform = 'win';
  let webhookPersistTimer = null;
  const webhookTestResultByTargetId = new Map();

  const HIGHLIGHT_COLOR_STORAGE_KEY = 'agt_highlight_colors';
  const MARKER_VISIBILITY_STORAGE_KEY = 'agt_marker_visibility';
  const WEBHOOK_CONFIG_STORAGE_KEY = 'agt_webhook_config';
  const WEBHOOK_TARGET_LIMIT = 3;
  const WEBHOOK_MODE_LIST = ['ai', 'json', 'plain'];

  const DEFAULT_HIGHLIGHT_COLORS = {
    selected: '#16a34a',
    search: '#d97706'
  };
  const DEFAULT_WEBHOOK_CONFIG = { targets: [] };
  let webhookConfig = Object.assign({}, DEFAULT_WEBHOOK_CONFIG);

  const RECOMMENDED_HIGHLIGHT_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
  ];

  const SHORTCUT_ROWS = [
    { labelKey: 'popup_shortcut_toggle', win: 'Ctrl+Shift+X', mac: 'Cmd+Shift+X' },
    { labelKey: 'popup_shortcut_undo', win: 'Ctrl+Z', mac: 'Cmd+Z' },
    { labelKey: 'popup_shortcut_redo', win: 'Ctrl+Y', mac: 'Cmd+Shift+Z' },
    { labelKey: 'popup_shortcut_popover_cancel', win: 'Esc', mac: 'Esc' },
    { labelKey: 'popup_shortcut_add', win: 'Enter', mac: 'Enter' },
    { labelKey: 'popup_shortcut_newline', win: 'Shift+Enter', mac: 'Shift+Enter' }
  ];
  const CONTENT_SCRIPT_FILES = [
    'shared/i18n.js',
    'content/dom-utils.js',
    'content/selector.js',
    'content/overlay.js',
    'content/content.js'
  ];
  let contentScriptStatus = 'unknown';

  function t(key, vars, fallback) {
    return window.__AGT_I18N.t(key, vars, fallback);
  }

  function setActivePanel(panelId) {
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
    const nextPanel = document.getElementById(panelId);
    if (nextPanel) nextPanel.classList.add('active');
  }

  // ──────────────────────────────────────────
  // 탭 전환
  // ──────────────────────────────────────────
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((node) => node.classList.remove('active'));
      tab.classList.add('active');
      setActivePanel(`panel-${tab.dataset.tab}`);

      if (tab.dataset.tab !== 'search') {
        sendToContent({ type: 'CLEAR_SEARCH' });
      }
    });
  });

  osWinBtn.addEventListener('click', () => setShortcutPlatform('win', true));
  osMacBtn.addEventListener('click', () => setShortcutPlatform('mac', true));

  selectedColorInput.addEventListener('input', () => { void onHighlightColorChanged(false); });
  searchColorInput.addEventListener('input', () => { void onHighlightColorChanged(false); });
  selectedColorInput.addEventListener('change', () => { void onHighlightColorChanged(true); });
  searchColorInput.addEventListener('change', () => { void onHighlightColorChanged(true); });

  markerToggleBtn.addEventListener('click', async () => {
    await toggleMarkerVisibility();
  });

  resetHighlightColorsBtn.addEventListener('click', async () => {
    setHighlightColorInputs(DEFAULT_HIGHLIGHT_COLORS);
    await saveHighlightColorPreference(DEFAULT_HIGHLIGHT_COLORS, true);
  });

  languageSelect.addEventListener('change', async () => {
    const nextLocale = languageSelect.value || 'auto';
    const state = await window.__AGT_I18N.setLocalePreference(nextLocale);
    applyLocalizedStaticText();
    populateLanguageOptions(state);
    applyState(currentState);
    showToast(t('popup_toast_language_updated', null, 'Language updated'));
    await sendToContent({ type: 'I18N_REFRESH' });
  });

  openWebhookPageBtn.addEventListener('click', () => {
    setActivePanel('panel-webhook');
  });
  webhookBackBtn.addEventListener('click', () => {
    setActivePanel('panel-settings');
  });
  addWebhookTargetBtn.addEventListener('click', () => {
    addWebhookTargetDraft();
  });
  webhookTargetList.addEventListener('click', async (e) => {
    const testBtn = e.target.closest('[data-action="webhook-test-target"]');
    if (testBtn) {
      const index = Number(testBtn.dataset.index);
      await sendWebhookTestByIndex(index, testBtn);
      return;
    }

    const removeBtn = e.target.closest('[data-action="webhook-remove-target"]');
    if (removeBtn) {
      const index = Number(removeBtn.dataset.index);
      removeWebhookTargetDraft(index);
    }
  });
  webhookTargetList.addEventListener('input', () => {
    scheduleWebhookConfigPersist();
  });
  webhookTargetList.addEventListener('change', () => {
    scheduleWebhookConfigPersist();
  });
  webhookTargetList.addEventListener('dblclick', (e) => {
    const nameEl = e.target.closest('[data-action="webhook-edit-name"]');
    if (!nameEl) return;
    const card = nameEl.closest('.webhook-target-card');
    if (!card) return;
    beginWebhookNameInlineEdit(card, nameEl);
  });

  // ──────────────────────────────────────────
  // content script 메시지 전송
  // ──────────────────────────────────────────
  function sendToContentRaw(message) {
    return new Promise((resolve) => {
      if (!currentTabId) {
        resolve(null);
        return;
      }
      chrome.tabs.sendMessage(currentTabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  async function ensureContentScriptReady() {
    if (!currentTabId) return false;
    if (contentScriptStatus === 'ready') return true;
    if (contentScriptStatus === 'unavailable') return false;

    const ping = await sendToContentRaw({ type: 'PING' });
    if (ping && ping.ok) {
      contentScriptStatus = 'ready';
      return true;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId, allFrames: true },
        files: CONTENT_SCRIPT_FILES
      });
    } catch (_err) {
      contentScriptStatus = 'unavailable';
      return false;
    }

    const retryPing = await sendToContentRaw({ type: 'PING' });
    contentScriptStatus = retryPing && retryPing.ok ? 'ready' : 'unavailable';
    return contentScriptStatus === 'ready';
  }

  async function sendToContent(message) {
    const response = await sendToContentRaw(message);
    if (response !== null) {
      contentScriptStatus = 'ready';
      return response;
    }

    if (!message || message.type === 'PING') return null;

    const ready = await ensureContentScriptReady();
    if (!ready) return null;

    return sendToContentRaw(message);
  }

  async function initI18n() {
    const state = await window.__AGT_I18N.init();
    applyLocalizedStaticText();
    populateLanguageOptions(state);
  }

  function applyLocalizedStaticText() {
    window.__AGT_I18N.applyToDocument(document);
    document.title = t('ext_name', null, document.title);

    const state = window.__AGT_I18N.getState();
    if (state && state.locale) {
      document.documentElement.lang = state.locale;
    }

    clearAllDefaultText = t('popup_clear_all_button', null, '✕ Clear all');
    clearAllDefaultTitle = t('popup_clear_all_title', null, 'Clear all');

    if (clearAllConfirmArmed) {
      clearAllBtn.textContent = t('popup_clear_all_confirm_button', null, '✕ Confirm clear?');
      clearAllBtn.title = t('popup_clear_all_confirm_title', null, 'Press once more to clear all');
    } else {
      clearAllBtn.textContent = clearAllDefaultText;
      clearAllBtn.title = clearAllDefaultTitle;
    }

    setShortcutPlatform(shortcutPlatform, false);
    setMarkerToggleButton(markerToggleBtn.dataset.visible !== '0');
    renderRecommendedColorPalettes();
    renderWebhookTargetList(webhookConfig);
  }

  function populateLanguageOptions(i18nState) {
    const state = i18nState || window.__AGT_I18N.getState();
    const localePreference = state.localePreference || 'auto';
    const locales = Array.isArray(state.availableLocales) ? state.availableLocales : [];

    languageSelect.innerHTML = '';

    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = t('popup_lang_auto', null, 'Auto (browser language)');
    languageSelect.appendChild(autoOption);

    locales.forEach((locale) => {
      const option = document.createElement('option');
      option.value = locale.code;
      option.textContent = locale.label || locale.code;
      languageSelect.appendChild(option);
    });

    if (localePreference !== 'auto' && !locales.some((locale) => locale.code === localePreference)) {
      const fallbackOption = document.createElement('option');
      fallbackOption.value = localePreference;
      fallbackOption.textContent = localePreference;
      languageSelect.appendChild(fallbackOption);
    }

    languageSelect.value = localePreference;
  }

  function initShortcutPreference() {
    const fallback = detectPlatformByAgent();
    chrome.storage.local.get('agt_shortcut_platform', (result) => {
      if (chrome.runtime.lastError) {
        setShortcutPlatform(fallback, false);
        return;
      }
      const saved = result && result.agt_shortcut_platform;
      if (saved === 'win' || saved === 'mac') {
        setShortcutPlatform(saved, false);
      } else {
        setShortcutPlatform(fallback, false);
      }
    });
  }

  function detectPlatformByAgent() {
    const p = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
    return p.includes('mac') ? 'mac' : 'win';
  }

  function setShortcutPlatform(platform, shouldPersist) {
    shortcutPlatform = platform === 'mac' ? 'mac' : 'win';
    osWinBtn.classList.toggle('active', shortcutPlatform === 'win');
    osMacBtn.classList.toggle('active', shortcutPlatform === 'mac');
    shortcutOsLabel.textContent = shortcutPlatform === 'mac'
      ? t('popup_os_mac', null, 'Mac')
      : t('popup_os_win', null, 'Win');
    renderShortcutTable();

    if (shouldPersist) {
      chrome.storage.local.set({ agt_shortcut_platform: shortcutPlatform });
    }
  }

  function renderShortcutTable() {
    const key = shortcutPlatform === 'mac' ? 'mac' : 'win';
    shortcutTableBody.innerHTML = SHORTCUT_ROWS.map((row) => {
      const label = t(row.labelKey, null, row.labelKey);
      return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="cell-key"><span class="kbd">${escapeHtml(row[key])}</span></td>
      </tr>
    `;
    }).join('');
  }

  function normalizeHexColor(value, fallback) {
    const base = String(fallback || DEFAULT_HIGHLIGHT_COLORS.selected).toLowerCase();
    if (typeof value !== 'string') return base;
    const raw = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
    }
    return base;
  }

  function sanitizeHighlightColors(colors, fallback) {
    const base = fallback || DEFAULT_HIGHLIGHT_COLORS;
    return {
      selected: normalizeHexColor(colors && colors.selected, base.selected),
      search: normalizeHexColor(colors && colors.search, base.search)
    };
  }

  function setHighlightColorInputs(colors) {
    const normalized = sanitizeHighlightColors(colors, DEFAULT_HIGHLIGHT_COLORS);
    selectedColorInput.value = normalized.selected;
    searchColorInput.value = normalized.search;
    selectedColorHex.textContent = normalized.selected;
    searchColorHex.textContent = normalized.search;
    syncPaletteActiveState();
  }

  function getHighlightColorsFromInputs() {
    return sanitizeHighlightColors(
      {
        selected: selectedColorInput.value,
        search: searchColorInput.value
      },
      DEFAULT_HIGHLIGHT_COLORS
    );
  }

  async function onHighlightColorChanged(shouldToast) {
    const colors = getHighlightColorsFromInputs();
    setHighlightColorInputs(colors);
    await saveHighlightColorPreference(colors, shouldToast);
  }

  function renderRecommendedColorPalettes() {
    renderPaletteForTarget(selectedColorPalette, 'selected');
    renderPaletteForTarget(searchColorPalette, 'search');
    syncPaletteActiveState();
  }

  function formatWebhookTestTimeShort(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const i18nState = window.__AGT_I18N.getState();
    const locale = i18nState && i18nState.locale && i18nState.locale !== 'auto'
      ? i18nState.locale
      : undefined;
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  function formatWebhookTestTimeFull(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const i18nState = window.__AGT_I18N.getState();
    const locale = i18nState && i18nState.locale && i18nState.locale !== 'auto'
      ? i18nState.locale
      : undefined;
    return date.toLocaleString(locale);
  }

  function renderPaletteForTarget(container, targetKey) {
    container.innerHTML = '';
    RECOMMENDED_HIGHLIGHT_COLORS.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-swatch';
      btn.dataset.color = color;
      btn.dataset.target = targetKey;
      const titleKey = targetKey === 'selected' ? 'popup_palette_title_selected' : 'popup_palette_title_search';
      btn.title = t(titleKey, { color }, `${targetKey} color ${color}`);
      btn.style.backgroundColor = color;
      btn.addEventListener('click', async () => {
        if (targetKey === 'selected') selectedColorInput.value = color;
        else searchColorInput.value = color;
        await onHighlightColorChanged(true);
      });
      container.appendChild(btn);
    });
  }

  function syncPaletteActiveState() {
    markActivePaletteSwatch(selectedColorPalette, selectedColorInput.value);
    markActivePaletteSwatch(searchColorPalette, searchColorInput.value);
  }

  function markActivePaletteSwatch(container, currentColor) {
    if (!container) return;
    const activeColor = normalizeHexColor(currentColor, '');
    Array.from(container.querySelectorAll('.palette-swatch')).forEach((btn) => {
      const isActive = normalizeHexColor(btn.dataset.color || '', '') === activeColor;
      btn.classList.toggle('active', isActive);
    });
  }

  function getStorageValue(key) {
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

  function createWebhookTargetId(index) {
    const seed = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return `webhook_${index + 1}_${seed}`;
  }

  function createDefaultWebhookTarget(index) {
    return {
      id: createWebhookTargetId(index),
      name: `Webhook ${index + 1}`,
      enabled: false,
      modes: [],
      url: '',
      customHeaders: {}
    };
  }

  function isDefaultWebhookName(name, index) {
    return String(name || '').trim() === `Webhook ${index + 1}`;
  }

  function isLegacyEmptyWebhookTarget(target, index) {
    if (!target) return false;
    if (target.enabled) return false;
    if (target.modes.length > 0) return false;
    if (target.url) return false;
    if (Object.keys(target.customHeaders).length > 0) return false;
    return isDefaultWebhookName(target.name, index);
  }

  function normalizeWebhookUrl(value) {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch (_err) {
      return '';
    }
  }

  function isValidHeaderName(name) {
    return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name);
  }

  function normalizeWebhookHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
    const normalized = {};
    Object.entries(headers).forEach(([rawName, rawValue]) => {
      const name = String(rawName || '').trim();
      if (!isValidHeaderName(name)) return;
      normalized[name] = String(rawValue == null ? '' : rawValue).trim();
    });
    return normalized;
  }

  function formatWebhookHeadersForInput(headers) {
    const normalized = normalizeWebhookHeaders(headers);
    return Object.entries(normalized)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n');
  }

  function parseWebhookHeadersInput(rawText) {
    const normalized = {};
    const lines = String(rawText || '').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const splitAt = line.indexOf(':');
      if (splitAt <= 0) {
        return { ok: false };
      }
      const name = line.slice(0, splitAt).trim();
      const value = line.slice(splitAt + 1).trim();
      if (!isValidHeaderName(name)) {
        return { ok: false };
      }
      normalized[name] = value;
    }
    return { ok: true, headers: normalized };
  }

  function normalizeWebhookModeList(modes) {
    const incoming = Array.isArray(modes) ? modes : [];
    const normalized = [];
    incoming.forEach((mode) => {
      const raw = String(mode || '').trim().toLowerCase();
      if (!WEBHOOK_MODE_LIST.includes(raw)) return;
      if (!normalized.includes(raw)) normalized.push(raw);
    });
    return normalized;
  }

  function normalizeWebhookTarget(target, index) {
    const fallback = createDefaultWebhookTarget(index);
    return {
      id: typeof (target && target.id) === 'string' && target.id.trim() ? target.id.trim() : fallback.id,
      name: typeof (target && target.name) === 'string' && target.name.trim() ? target.name.trim() : fallback.name,
      enabled: !!(target && target.enabled),
      modes: normalizeWebhookModeList(target && target.modes),
      url: typeof (target && target.url) === 'string' ? target.url.trim() : '',
      customHeaders: normalizeWebhookHeaders(target && target.customHeaders)
    };
  }

  function normalizeWebhookConfig(config) {
    // Migrate old single-webhook schema -> first target
    let incomingTargets = [];
    if (config && Array.isArray(config.targets)) {
      incomingTargets = config.targets;
    } else if (config && (typeof config.url === 'string' || config.customHeaders)) {
      incomingTargets = [{
        id: 'webhook_1',
        name: 'Webhook 1',
        enabled: !!config.enabled,
        modes: ['plain'],
        url: typeof config.url === 'string' ? config.url.trim() : '',
        customHeaders: normalizeWebhookHeaders(config.customHeaders)
      }];
    }

    let normalizedTargets = incomingTargets
      .slice(0, WEBHOOK_TARGET_LIMIT)
      .map((target, index) => normalizeWebhookTarget(target, index));

    // migrate previous fixed-3 empty cards into an empty list
    if (
      config
      && Array.isArray(config.targets)
      && config.targets.length === WEBHOOK_TARGET_LIMIT
      && normalizedTargets.every((target, index) => isLegacyEmptyWebhookTarget(target, index))
    ) {
      normalizedTargets = [];
    }

    return {
      targets: normalizedTargets
    };
  }

  function updateWebhookDetailControls(config) {
    const normalized = normalizeWebhookConfig(config);
    addWebhookTargetBtn.disabled = normalized.targets.length >= WEBHOOK_TARGET_LIMIT;
    webhookTargetEmpty.hidden = normalized.targets.length > 0;
  }

  function addWebhookTargetDraft() {
    const normalized = normalizeWebhookConfig(webhookConfig);
    if (normalized.targets.length >= WEBHOOK_TARGET_LIMIT) {
      showToast(t('popup_toast_webhook_target_limit', null, 'You can add up to 3 webhooks'));
      return;
    }

    normalized.targets.push(createDefaultWebhookTarget(normalized.targets.length));
    webhookConfig = normalized;
    renderWebhookTargetList(webhookConfig);
    scheduleWebhookConfigPersist();
  }

  function removeWebhookTargetDraft(index) {
    const normalized = normalizeWebhookConfig(webhookConfig);
    if (!Number.isInteger(index) || index < 0 || index >= normalized.targets.length) return;
    const removedTarget = normalized.targets[index];
    if (removedTarget && removedTarget.id) webhookTestResultByTargetId.delete(removedTarget.id);
    normalized.targets.splice(index, 1);
    webhookConfig = normalized;
    renderWebhookTargetList(webhookConfig);
    scheduleWebhookConfigPersist();
  }

  function renderWebhookTargetList(config) {
    const normalized = normalizeWebhookConfig(config);
    const activeIds = new Set(normalized.targets.map((target) => target.id));
    Array.from(webhookTestResultByTargetId.keys()).forEach((targetId) => {
      if (!activeIds.has(targetId)) webhookTestResultByTargetId.delete(targetId);
    });

    webhookTargetList.innerHTML = normalized.targets.map((target, index) => {
      const modeSet = new Set(target.modes);
      const modeAiLabel = t('popup_format_ai', null, 'AI');
      const modeJsonLabel = t('popup_format_json', null, 'Developer');
      const modePlainLabel = t('popup_format_plain', null, 'Share');
      const modeLabel = t('popup_settings_webhook_modes_label', null, 'Modes');
      const enabledLabel = t('popup_settings_webhook_target_enabled', null, 'Enable this webhook');
      const headersLabel = t('popup_settings_webhook_headers_label', null, 'Custom headers');
      const urlPlaceholder = t('popup_settings_webhook_url_placeholder', null, 'https://your-server.example/webhook');
      const headersPlaceholder = t('popup_settings_webhook_headers_placeholder', null, 'X-API-Key: your-token');
      const headersValue = formatWebhookHeadersForInput(target.customHeaders);
      const testLabel = t('popup_settings_webhook_test_button', null, 'TEST');
      const removeLabel = t('popup_settings_webhook_remove_button', null, 'Remove');
      const editNameHint = t('popup_settings_webhook_name_edit_hint', null, 'Double-click to edit name');
      const testResultRaw = webhookTestResultByTargetId.get(target.id);
      const testStatus = typeof testResultRaw === 'string'
        ? testResultRaw
        : (testResultRaw && testResultRaw.status);
      const testedAt = testResultRaw && typeof testResultRaw === 'object'
        ? String(testResultRaw.testedAt || '')
        : '';
      const testedAtShort = formatWebhookTestTimeShort(testedAt);
      const testedAtFull = formatWebhookTestTimeFull(testedAt);
      let statusBadge = '';
      if (testStatus === 'success') {
        statusBadge = `
          <span class="webhook-test-status success" title="${escapeHtml(testedAtFull)}">
            ${escapeHtml(t('popup_settings_webhook_test_status_success', null, 'Success'))}
            ${testedAtShort ? `<span class="webhook-test-status-time">${escapeHtml(testedAtShort)}</span>` : ''}
          </span>
        `;
      } else if (testStatus === 'failed') {
        statusBadge = `
          <span class="webhook-test-status failed" title="${escapeHtml(testedAtFull)}">
            ${escapeHtml(t('popup_settings_webhook_test_status_failed', null, 'Failed'))}
            ${testedAtShort ? `<span class="webhook-test-status-time">${escapeHtml(testedAtShort)}</span>` : ''}
          </span>
        `;
      }

      return `
        <div class="webhook-target-card" data-index="${index}" data-id="${escapeHtml(target.id)}" data-name="${escapeHtml(target.name)}">
          <div class="webhook-target-head">
            <div class="webhook-target-title-wrap">
              <span class="webhook-target-title webhook-target-name-display" data-action="webhook-edit-name" data-index="${index}" title="${escapeHtml(editNameHint)}">${escapeHtml(target.name)}</span>
              ${statusBadge}
            </div>
            <div class="webhook-target-head-actions">
              <button class="icon-btn webhook-target-test-btn" data-action="webhook-test-target" data-index="${index}">${escapeHtml(testLabel)}</button>
              <button class="icon-btn" data-action="webhook-remove-target" data-index="${index}">${escapeHtml(removeLabel)}</button>
            </div>
          </div>
          <div class="webhook-field-label">${escapeHtml(modeLabel)}</div>
          <div class="webhook-target-modes">
            <label class="webhook-mode-chip">
              <input class="webhook-target-mode" data-mode="ai" type="checkbox" ${modeSet.has('ai') ? 'checked' : ''} />
              <span>${escapeHtml(modeAiLabel)}</span>
            </label>
            <label class="webhook-mode-chip">
              <input class="webhook-target-mode" data-mode="json" type="checkbox" ${modeSet.has('json') ? 'checked' : ''} />
              <span>${escapeHtml(modeJsonLabel)}</span>
            </label>
            <label class="webhook-mode-chip">
              <input class="webhook-target-mode" data-mode="plain" type="checkbox" ${modeSet.has('plain') ? 'checked' : ''} />
              <span>${escapeHtml(modePlainLabel)}</span>
            </label>
          </div>
          <input
            class="webhook-target-url-input"
            type="url"
            value="${escapeHtml(target.url)}"
            placeholder="${escapeHtml(urlPlaceholder)}"
          />
          <label class="webhook-field-label">${escapeHtml(headersLabel)}</label>
          <textarea
            class="webhook-headers-input webhook-target-headers"
            placeholder="${escapeHtml(headersPlaceholder)}"
          >${escapeHtml(headersValue)}</textarea>
          <label class="webhook-enable webhook-target-toggle">
            <input class="webhook-target-enabled" type="checkbox" ${target.enabled ? 'checked' : ''} />
            <span>${escapeHtml(enabledLabel)}</span>
          </label>
        </div>
      `;
    }).join('');
    updateWebhookDetailControls(normalized);
  }

  function setWebhookTargetNameDraft(index, name) {
    const normalized = normalizeWebhookConfig(webhookConfig);
    if (!Number.isInteger(index) || index < 0 || index >= normalized.targets.length) return;
    const nextName = String(name || '').trim() || `Webhook ${index + 1}`;
    normalized.targets[index].name = nextName;
    webhookConfig = normalized;
    renderWebhookTargetList(webhookConfig);
    scheduleWebhookConfigPersist();
  }

  function beginWebhookNameInlineEdit(card, nameEl) {
    if (!card || !nameEl) return;
    if (card.dataset.nameEditing === '1') return;

    const index = Number(card.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;

    const currentName = String(card.dataset.name || nameEl.textContent || '').trim() || `Webhook ${index + 1}`;
    card.dataset.nameEditing = '1';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'webhook-target-name-inline-input';
    input.value = currentName;
    input.setAttribute('aria-label', t('popup_settings_webhook_name_label', null, 'Name'));
    input.setAttribute('maxlength', '80');
    nameEl.replaceWith(input);

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let resolved = false;
    const finish = (shouldCommit) => {
      if (resolved) return;
      resolved = true;
      card.dataset.nameEditing = '0';
      if (shouldCommit) {
        setWebhookTargetNameDraft(index, input.value);
      } else {
        renderWebhookTargetList(webhookConfig);
      }
    };

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('input', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('blur', () => {
      finish(true);
    });
  }

  function parseWebhookTargetFromCard(card, index) {
    const enabledInput = card.querySelector('.webhook-target-enabled');
    const urlInput = card.querySelector('.webhook-target-url-input');
    const headersInput = card.querySelector('.webhook-target-headers');
    const modeInputs = Array.from(card.querySelectorAll('.webhook-target-mode'));

    const name = typeof card.dataset.name === 'string' ? card.dataset.name.trim() : '';
    const enabled = !!(enabledInput && enabledInput.checked);
    const rawUrl = urlInput ? urlInput.value.trim() : '';
    const normalizedUrl = normalizeWebhookUrl(rawUrl);
    const modes = modeInputs
      .filter((input) => input.checked)
      .map((input) => String(input.dataset.mode || '').trim().toLowerCase())
      .filter((mode, idx, arr) => WEBHOOK_MODE_LIST.includes(mode) && arr.indexOf(mode) === idx);
    const parsedHeaders = parseWebhookHeadersInput(headersInput ? headersInput.value : '');

    if (!parsedHeaders.ok) {
      return { ok: false, errorType: 'invalid_headers', focusEl: headersInput };
    }

    const target = normalizeWebhookTarget({
      id: card.dataset.id || '',
      name: name || `Webhook ${index + 1}`,
      enabled,
      modes,
      url: normalizedUrl || rawUrl,
      customHeaders: parsedHeaders.headers
    }, index);

    return {
      ok: true,
      target,
      rawUrl,
      normalizedUrl,
      modes,
      focusUrlEl: urlInput,
      focusModeEl: modeInputs[0] || card
    };
  }

  function collectWebhookTargetsFromForm(validateEnabledTargets) {
    const cards = Array.from(webhookTargetList.querySelectorAll('.webhook-target-card'));
    const targets = [];

    if (cards.length > WEBHOOK_TARGET_LIMIT) {
      return { ok: false, errorType: 'target_limit', focusEl: addWebhookTargetBtn };
    }
    if (validateEnabledTargets && cards.length === 0) {
      return { ok: false, errorType: 'no_target', focusEl: addWebhookTargetBtn };
    }

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const parsed = parseWebhookTargetFromCard(card, index);
      if (!parsed.ok) return parsed;

      if (validateEnabledTargets && parsed.target.enabled) {
        if (!parsed.modes.length) {
          return { ok: false, errorType: 'invalid_mode', focusEl: parsed.focusModeEl };
        }
        if (!parsed.normalizedUrl) {
          return { ok: false, errorType: 'invalid_url', focusEl: parsed.focusUrlEl };
        }
        parsed.target.url = parsed.normalizedUrl;
      }

      targets.push(parsed.target);
    }

    return { ok: true, targets };
  }

  function getWebhookValidationMessage(errorType) {
    if (errorType === 'target_limit') {
      return t('popup_toast_webhook_target_limit', null, 'You can add up to 3 webhooks');
    }
    if (errorType === 'no_target') {
      return t('popup_toast_webhook_no_target', null, 'Add at least one webhook');
    }
    if (errorType === 'invalid_mode') {
      return t('popup_toast_webhook_invalid_mode', null, 'Select at least one webhook mode');
    }
    if (errorType === 'invalid_headers') {
      return t('popup_toast_webhook_invalid_headers', null, 'Invalid webhook headers format');
    }
    return t('popup_toast_webhook_invalid_url', null, 'Invalid webhook URL');
  }

  function applyWebhookConfigToForm(config) {
    const normalized = normalizeWebhookConfig(config);
    renderWebhookTargetList(normalized);
  }

  async function initWebhookConfigPreference() {
    const saved = await getStorageValue(WEBHOOK_CONFIG_STORAGE_KEY);
    webhookConfig = normalizeWebhookConfig(saved || DEFAULT_WEBHOOK_CONFIG);
    applyWebhookConfigToForm(webhookConfig);
  }

  function scheduleWebhookConfigPersist() {
    clearTimeout(webhookPersistTimer);
    webhookPersistTimer = setTimeout(() => {
      void persistWebhookConfigFromForm(false);
    }, 250);
  }

  async function persistWebhookConfigFromForm(shouldToastErrors) {
    const collected = collectWebhookTargetsFromForm(false);
    if (!collected.ok) {
      if (shouldToastErrors) showToast(getWebhookValidationMessage(collected.errorType));
      if (shouldToastErrors && collected.focusEl && typeof collected.focusEl.focus === 'function') {
        collected.focusEl.focus();
      }
      return false;
    }

    webhookConfig = normalizeWebhookConfig({
      targets: collected.targets
    });

    chrome.storage.local.set({
      [WEBHOOK_CONFIG_STORAGE_KEY]: webhookConfig
    });

    return true;
  }

  async function sendWebhookTestByIndex(index, buttonEl) {
    if (!Number.isInteger(index) || index < 0 || index >= WEBHOOK_TARGET_LIMIT) return;
    const card = webhookTargetList.querySelector(`.webhook-target-card[data-index="${index}"]`);
    if (!card) return;

    const parsed = parseWebhookTargetFromCard(card, index);
    if (!parsed.ok) {
      showToast(t('popup_toast_webhook_invalid_headers', null, 'Invalid webhook headers format'));
      if (parsed.focusEl && typeof parsed.focusEl.focus === 'function') parsed.focusEl.focus();
      return;
    }

    if (!parsed.normalizedUrl) {
      showToast(t('popup_toast_webhook_invalid_url', null, 'Invalid webhook URL'));
      if (parsed.focusUrlEl && typeof parsed.focusUrlEl.focus === 'function') parsed.focusUrlEl.focus();
      return;
    }

    const i18nState = window.__AGT_I18N.getState();
    const payload = {
      event: 'agentation.webhook_test',
      webhookTarget: parsed.target.name || `Webhook ${index + 1}`,
      message: 'webhook test from popup',
      meta: {
        url: currentState.url || '',
        locale: (i18nState && i18nState.locale) || 'en',
        sentAt: new Date().toISOString()
      }
    };

    buttonEl.disabled = true;
    let testStatus = 'failed';
    try {
      const response = await fetch(parsed.normalizedUrl, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, parsed.target.customHeaders),
        body: JSON.stringify(payload)
      });
      testStatus = response.ok ? 'success' : 'failed';
      showToast(response.ok
        ? t('popup_toast_webhook_test_sent', null, 'Webhook test sent')
        : t('popup_toast_webhook_test_failed', null, 'Webhook test failed'));
    } catch (_err) {
      testStatus = 'failed';
      showToast(t('popup_toast_webhook_test_failed', null, 'Webhook test failed'));
    } finally {
      if (parsed.target.id) {
        webhookTestResultByTargetId.set(parsed.target.id, {
          status: testStatus,
          testedAt: new Date().toISOString()
        });
      }
      if (buttonEl && buttonEl.isConnected) buttonEl.disabled = false;
      renderWebhookTargetList(webhookConfig);
    }
  }

  async function sendWebhookIfNeeded(triggeredFormat) {
    if (!WEBHOOK_MODE_LIST.includes(triggeredFormat)) return 'skipped';

    const currentConfigCollected = collectWebhookTargetsFromForm(true);
    if (!currentConfigCollected.ok) {
      if (currentConfigCollected.errorType === 'no_target') return 'skipped';
      if (currentConfigCollected.errorType === 'invalid_headers') return 'invalid_headers';
      if (currentConfigCollected.errorType === 'invalid_mode') return 'invalid_mode';
      return 'invalid_url';
    }
    const config = normalizeWebhookConfig({ targets: currentConfigCollected.targets });
    webhookConfig = config;
    chrome.storage.local.set({
      [WEBHOOK_CONFIG_STORAGE_KEY]: webhookConfig
    });
    const matchedTargets = config.targets.filter((target) => (
      target.enabled && target.modes.includes(triggeredFormat)
    ));
    if (!matchedTargets.length) return 'skipped';

    const validTargets = [];
    let invalidTargetFound = false;
    matchedTargets.forEach((target) => {
      const webhookUrl = normalizeWebhookUrl(target.url);
      if (!webhookUrl) {
        invalidTargetFound = true;
        return;
      }
      validTargets.push({
        id: target.id,
        name: target.name,
        url: webhookUrl,
        customHeaders: normalizeWebhookHeaders(target.customHeaders)
      });
    });

    if (!validTargets.length) return 'invalid_url';

    const [ai, json, plain] = await Promise.all([
      sendToContent({ type: 'GET_EXPORT', payload: { format: 'ai' } }),
      sendToContent({ type: 'GET_EXPORT', payload: { format: 'json' } }),
      sendToContent({ type: 'GET_EXPORT', payload: { format: 'plain' } })
    ]);

    if (!ai || !ai.data || !json || !json.data || !plain || !plain.data) {
      return 'export_failed';
    }

    const i18nState = window.__AGT_I18N.getState();
    const payload = {
      event: 'agentation.export',
      triggeredFormat,
      exports: {
        AI: ai.data,
        Developer: json.data,
        Share: plain.data
      },
      meta: {
        url: currentState.url || '',
        selectionCount: currentState.selections.length,
        locale: (i18nState && i18nState.locale) || 'en',
        sentAt: new Date().toISOString()
      }
    };

    const results = await Promise.allSettled(validTargets.map(async (target) => {
      const response = await fetch(target.url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, target.customHeaders),
        body: JSON.stringify(Object.assign({}, payload, {
          webhookTarget: {
            id: target.id,
            name: target.name
          }
        }))
      });
      return response.ok;
    }));

    let sentCount = 0;
    let failedCount = 0;
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) sentCount += 1;
      else failedCount += 1;
    });

    if (sentCount > 0 && failedCount === 0 && !invalidTargetFound) return 'sent';
    if (sentCount > 0) return 'partial';
    if (invalidTargetFound && failedCount === 0) return 'invalid_url';
    return 'request_failed';
  }

  async function initHighlightColorPreference() {
    const saved = await getStorageValue(HIGHLIGHT_COLOR_STORAGE_KEY);
    let colors = sanitizeHighlightColors(saved, DEFAULT_HIGHLIGHT_COLORS);
    const fromContent = await sendToContent({ type: 'GET_HIGHLIGHT_COLORS' });
    if (fromContent) {
      colors = sanitizeHighlightColors(fromContent, colors);
    }
    setHighlightColorInputs(colors);
    await saveHighlightColorPreference(colors, false);
  }

  async function saveHighlightColorPreference(colors, shouldToast) {
    const normalized = sanitizeHighlightColors(colors, DEFAULT_HIGHLIGHT_COLORS);
    chrome.storage.local.set({ [HIGHLIGHT_COLOR_STORAGE_KEY]: normalized });
    const result = await sendToContent({ type: 'SET_HIGHLIGHT_COLORS', payload: normalized });
    if (shouldToast) {
      showToast(
        result && result.ok
          ? t('popup_toast_highlight_applied', null, 'Highlight color applied')
          : t('popup_toast_color_saved', null, 'Color saved')
      );
    }
  }

  function setMarkerToggleButton(visible) {
    const isVisible = visible !== false;
    markerToggleBtn.dataset.visible = isVisible ? '1' : '0';
    markerToggleBtn.textContent = isVisible
      ? t('popup_marker_hide', null, 'Hide markers')
      : t('popup_marker_show', null, 'Show markers');
    markerToggleBtn.title = isVisible
      ? t('popup_marker_title_visible', null, 'Markers are currently visible')
      : t('popup_marker_title_hidden', null, 'Markers are currently hidden');
  }

  async function initMarkerVisibilityPreference() {
    const fromContent = await sendToContent({ type: 'GET_MARKER_VISIBILITY' });
    if (fromContent && typeof fromContent.visible === 'boolean') {
      setMarkerToggleButton(fromContent.visible);
      chrome.storage.local.set({ [MARKER_VISIBILITY_STORAGE_KEY]: fromContent.visible });
      return;
    }

    const saved = await getStorageValue(MARKER_VISIBILITY_STORAGE_KEY);
    if (typeof saved === 'boolean') {
      setMarkerToggleButton(saved);
    } else {
      setMarkerToggleButton(true);
    }
  }

  async function toggleMarkerVisibility() {
    const currentVisible = markerToggleBtn.dataset.visible !== '0';
    const nextVisible = !currentVisible;
    const result = await sendToContent({
      type: 'SET_MARKER_VISIBILITY',
      payload: { visible: nextVisible }
    });
    if (result && typeof result.visible === 'boolean') {
      chrome.storage.local.set({ [MARKER_VISIBILITY_STORAGE_KEY]: result.visible });
      setMarkerToggleButton(result.visible);
      showToast(
        result.visible
          ? t('popup_toast_marker_shown', null, 'Markers shown')
          : t('popup_toast_marker_hidden', null, 'Markers hidden')
      );
    } else {
      chrome.storage.local.set({ [MARKER_VISIBILITY_STORAGE_KEY]: nextVisible });
      setMarkerToggleButton(nextVisible);
      showToast(
        nextVisible
          ? t('popup_toast_marker_shown_after_refresh', null, 'Markers shown (applies after page refresh)')
          : t('popup_toast_marker_hidden_after_refresh', null, 'Markers hidden (applies after page refresh)')
      );
    }
  }

  // ──────────────────────────────────────────
  // 상태 업데이트 → UI 렌더링
  // ──────────────────────────────────────────
  function applyState(state) {
    if (!state) return;
    currentState = state;
    renderToggle();
    renderSelections();
    renderToolbar();
    renderStatusBar();
  }

  function renderToggle() {
    if (currentState.isActive) {
      toggleBtn.className = 'toggle-btn active';
      toggleLabel.textContent = t('popup_toggle_active', null, 'Selecting (click to stop)');
    } else {
      toggleBtn.className = 'toggle-btn inactive';
      toggleLabel.textContent = t('popup_toggle_start', null, 'Start Selecting');
    }
  }

  function renderToolbar() {
    const count = currentState.selections.length;
    selCount.textContent = count;
    tabCount.textContent = count > 0 ? `(${count})` : '';
    undoBtn.disabled = !currentState.canUndo;
    redoBtn.disabled = !currentState.canRedo;
  }

  function renderStatusBar() {
    const url = currentState.url || '—';
    try {
      const parsed = new URL(url);
      statusUrl.textContent = parsed.hostname + parsed.pathname;
    } catch {
      statusUrl.textContent = url;
    }
    statusUrl.title = url;
  }

  function renderSelections() {
    const sels = currentState.selections;

    Array.from(selectionList.children).forEach((child) => {
      if (child.id !== 'emptyState') child.remove();
    });

    if (sels.length === 0) {
      emptyState.style.display = '';
      return;
    }

    emptyState.style.display = 'none';

    [...sels].reverse().forEach((sel, reverseIndex) => {
      const orderNumber = sels.length - reverseIndex;
      const item = buildSelItem(sel, orderNumber);
      selectionList.insertBefore(item, emptyState.nextSibling || null);
    });
  }

  function buildSelItem(sel, orderNumber) {
    const item = document.createElement('div');
    item.className = 'sel-item';
    item.dataset.id = sel.id;

    const text = sel.innerText
      ? sel.innerText.slice(0, 60) + (sel.innerText.length > 60 ? '…' : '')
      : t('popup_selection_no_text', null, '(no text)');

    const bb = sel.boundingBox;
    const bbStr = bb ? `${bb.width}×${bb.height} @ (${bb.x},${bb.y})` : '';
    const annotationHtml = sel.annotation ? `<div class="sel-annotation">${escapeHtml(sel.annotation)}</div>` : '';

    const rawTagName = sel.tagName || '';
    const orderText = escapeHtml(t(
      'popup_selection_tag_order',
      { tag: rawTagName, order: String(orderNumber) },
      `${rawTagName} #${orderNumber}`
    ));

    item.innerHTML = `
      <div class="sel-item-header">
        <span class="sel-tag">${orderText}</span>
        <div class="sel-actions">
          <button class="sel-btn edit-anno" title="${escapeHtml(t('popup_selection_action_edit_title', null, 'Edit annotation'))}">${escapeHtml(t('popup_selection_action_edit', null, 'Edit'))}</button>
          <button class="sel-btn copy-sel" title="${escapeHtml(t('popup_selection_action_copy_title', null, 'Copy selector'))}">${escapeHtml(t('popup_selection_action_copy', null, 'Copy'))}</button>
          <button class="sel-btn del" title="${escapeHtml(t('popup_selection_action_delete_title', null, 'Delete'))}">${escapeHtml(t('popup_selection_action_delete', null, 'Delete'))}</button>
        </div>
      </div>
      <div class="sel-selector">${escapeHtml(sel.selector)}</div>
      <div class="sel-text">${escapeHtml(text)}</div>
      <div class="sel-anno-area">${annotationHtml}</div>
      ${bbStr ? `<div class="sel-meta">${bbStr} · ${escapeHtml(sel.strategy || '')}</div>` : ''}
    `;

    item.querySelector('.edit-anno').addEventListener('click', (e) => {
      e.stopPropagation();
      enterAnnotationEditMode(item, sel);
    });

    item.querySelector('.copy-sel').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(sel.selector);
      showToast(t('popup_toast_selector_copied', null, 'Selector copied'));
    });

    item.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const state = await sendToContent({ type: 'REMOVE_SELECTION', payload: { id: sel.id } });
      applyState(state);
    });

    return item;
  }

  function enterAnnotationEditMode(item, sel) {
    if (item.dataset.editing === '1') return;
    item.dataset.editing = '1';

    const annoArea = item.querySelector('.sel-anno-area');
    const currentText = sel.annotation || '';

    annoArea.innerHTML = `
      <textarea class="anno-edit-input" rows="3" placeholder="${escapeHtml(t('popup_annotation_placeholder', null, 'Enter annotation (optional)'))}">${escapeHtml(currentText)}</textarea>
      <div class="anno-edit-actions">
        <button class="anno-cancel-btn">${escapeHtml(t('popup_annotation_cancel', null, 'Cancel'))}</button>
        <button class="anno-save-btn">${escapeHtml(t('popup_annotation_save', null, 'Save'))}</button>
      </div>
    `;

    const textarea = annoArea.querySelector('.anno-edit-input');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    async function doSave() {
      const newText = textarea.value.trim();
      item.dataset.editing = '0';
      const state = await sendToContent({
        type: 'EDIT_ANNOTATION',
        payload: { id: sel.id, annotation: newText }
      });
      if (state) {
        applyState(state);
      } else {
        sel.annotation = newText;
        exitEditMode();
      }
    }

    function exitEditMode() {
      item.dataset.editing = '0';
      annoArea.innerHTML = sel.annotation
        ? `<div class="sel-annotation">${escapeHtml(sel.annotation)}</div>`
        : '';
    }

    annoArea.querySelector('.anno-save-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      doSave();
    });

    annoArea.querySelector('.anno-cancel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      exitEditMode();
    });

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }
    });
  }

  // ──────────────────────────────────────────
  // 버튼 이벤트
  // ──────────────────────────────────────────
  toggleBtn.addEventListener('click', async () => {
    const wasActive = currentState.isActive;
    const state = await sendToContent({ type: 'TOGGLE_ACTIVE' });
    applyState(state);
    if (!wasActive && state && state.isActive) {
      window.close();
    }
  });

  undoBtn.addEventListener('click', async () => {
    const state = await sendToContent({ type: 'UNDO' });
    applyState(state);
  });

  redoBtn.addEventListener('click', async () => {
    const state = await sendToContent({ type: 'REDO' });
    applyState(state);
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!currentState.selections.length) return;
    if (!clearAllConfirmArmed) {
      armClearAllConfirm();
      showToast(t('popup_toast_clear_confirm', null, 'Press once more to clear all'));
      return;
    }
    resetClearAllConfirm();
    const state = await sendToContent({ type: 'CLEAR_ALL' });
    applyState(state);
    showToast(t('popup_toast_clear_done', null, 'All selections cleared'));
  });

  document.addEventListener('click', (e) => {
    if (!clearAllConfirmArmed) return;
    if (clearAllBtn.contains(e.target)) return;
    resetClearAllConfirm();
  });

  // ──────────────────────────────────────────
  // 검색
  // ──────────────────────────────────────────
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  async function doSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      sendToContent({ type: 'CLEAR_SEARCH' });
      searchResult.style.display = 'none';
      return;
    }

    const result = await sendToContent({ type: 'SEARCH', payload: { query } });
    searchResult.style.display = 'block';

    if (!result) {
      searchResult.innerHTML = `<span class="result-zero">${escapeHtml(t('popup_search_comm_error', null, 'Failed to communicate with the page'))}</span>`;
      return;
    }

    if (result.count === 0) {
      searchResult.innerHTML = `<span class="result-zero">${escapeHtml(t('popup_search_no_match', null, 'No matching elements:'))}</span> <code>${escapeHtml(query)}</code>`;
    } else {
      searchResult.innerHTML = `<span class="result-count">${result.count}</span> ${escapeHtml(t('popup_search_match_count', { count: String(result.count) }, `${result.count} elements found`))}`;
    }
  }

  // ──────────────────────────────────────────
  // 포맷 셀렉터 + 복사 버튼
  // ──────────────────────────────────────────
  let currentFormat = 'ai';

  document.getElementById('formatSelector').addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn');
    if (!btn) return;
    currentFormat = btn.dataset.format;
    document.querySelectorAll('#formatSelector .format-btn').forEach((node) => {
      node.classList.toggle('active', node === btn);
    });
  });

  document.getElementById('copyBtn').addEventListener('click', async () => {
    await exportAction(currentFormat);
  });

  async function exportAction(format) {
    if (!currentState.selections.length) {
      showToast(t('popup_toast_no_selection', null, 'No selected elements'));
      return;
    }

    const result = await sendToContent({ type: 'GET_EXPORT', payload: { format } });
    if (!result || !result.data) {
      showToast(t('popup_toast_copy_failed', null, 'Copy failed'));
      return;
    }

    copyToClipboard(result.data);

    const webhookStatus = await sendWebhookIfNeeded(format);
    const copiedMsg = t('popup_toast_copied', null, 'Copied');

    if (webhookStatus === 'sent') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_sent', null, 'Webhook sent')}`);
      return;
    }
    if (webhookStatus === 'partial') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_partial', null, 'Webhook partially sent')}`);
      return;
    }
    if (webhookStatus === 'invalid_url') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_invalid_url', null, 'Invalid webhook URL')}`);
      return;
    }
    if (webhookStatus === 'invalid_mode') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_invalid_mode', null, 'Select at least one webhook mode')}`);
      return;
    }
    if (webhookStatus === 'invalid_headers') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_invalid_headers', null, 'Invalid webhook headers format')}`);
      return;
    }
    if (webhookStatus === 'export_failed') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_export_failed', null, 'Webhook payload build failed')}`);
      return;
    }
    if (webhookStatus === 'request_failed') {
      showToast(`${copiedMsg} · ${t('popup_toast_webhook_failed', null, 'Webhook request failed')}`);
      return;
    }

    showToast(copiedMsg);
  }

  // ──────────────────────────────────────────
  // background → popup 메시지 (상태 업데이트)
  // ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      applyState(message.payload);
    }
  });

  // ──────────────────────────────────────────
  // 유틸
  // ──────────────────────────────────────────
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  let toastTimer = null;

  function armClearAllConfirm() {
    clearAllConfirmArmed = true;
    clearAllBtn.textContent = t('popup_clear_all_confirm_button', null, '✕ Confirm clear?');
    clearAllBtn.title = t('popup_clear_all_confirm_title', null, 'Press once more to clear all');
    clearTimeout(clearAllConfirmTimer);
    clearAllConfirmTimer = setTimeout(() => {
      resetClearAllConfirm();
    }, 2200);
  }

  function resetClearAllConfirm() {
    clearAllConfirmArmed = false;
    clearAllBtn.textContent = clearAllDefaultText;
    clearAllBtn.title = clearAllDefaultTitle;
    clearTimeout(clearAllConfirmTimer);
    clearAllConfirmTimer = null;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  async function bootstrap() {
    await initI18n();
    await initWebhookConfigPreference();
    initShortcutPreference();
    setHighlightColorInputs(DEFAULT_HIGHLIGHT_COLORS);
    setMarkerToggleButton(true);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || !tabs[0]) return;
      currentTabId = tabs[0].id;
      contentScriptStatus = 'unknown';

      const ready = await ensureContentScriptReady();
      if (!ready) {
        statusUrl.textContent = tabs[0].url || '—';
        toggleBtn.disabled = true;
        markerToggleBtn.disabled = true;
        toggleLabel.textContent = t('popup_toggle_unavailable', null, 'Not available on this page');
        return;
      }

      await initHighlightColorPreference();
      await initMarkerVisibilityPreference();

      const state = await sendToContent({ type: 'GET_STATE' });
      if (state) {
        applyState(state);
      } else {
        statusUrl.textContent = tabs[0].url || '—';
        toggleBtn.disabled = true;
        markerToggleBtn.disabled = true;
        toggleLabel.textContent = t('popup_toggle_unavailable', null, 'Not available on this page');
      }
    });
  }

  void bootstrap();
})();
