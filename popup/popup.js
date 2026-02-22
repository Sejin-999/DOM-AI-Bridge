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

  let clearAllDefaultText = '';
  let clearAllDefaultTitle = '';
  let clearAllConfirmArmed = false;
  let clearAllConfirmTimer = null;
  let shortcutPlatform = 'win';

  const HIGHLIGHT_COLOR_STORAGE_KEY = 'agt_highlight_colors';
  const MARKER_VISIBILITY_STORAGE_KEY = 'agt_marker_visibility';

  const DEFAULT_HIGHLIGHT_COLORS = {
    selected: '#16a34a',
    search: '#d97706'
  };

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

  function t(key, vars, fallback) {
    return window.__AGT_I18N.t(key, vars, fallback);
  }

  // ──────────────────────────────────────────
  // 탭 전환
  // ──────────────────────────────────────────
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((node) => node.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');

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

  // ──────────────────────────────────────────
  // content script 메시지 전송
  // ──────────────────────────────────────────
  function sendToContent(message) {
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

  async function initI18n() {
    const state = await window.__AGT_I18N.init();
    applyLocalizedStaticText();
    populateLanguageOptions(state);
  }

  function applyLocalizedStaticText() {
    window.__AGT_I18N.applyToDocument(document);

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

    const safeTagName = escapeHtml(sel.tagName || '');
    const orderText = t(
      'popup_selection_tag_order',
      { tag: safeTagName, order: String(orderNumber) },
      `${safeTagName} #${orderNumber}`
    );

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
    document.querySelectorAll('#formatSelector .format-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });

  document.getElementById('copyBtn').addEventListener('click', async () => {
    await exportAction(currentFormat);
  });

  async function exportAction(format) {
    if (!currentState.selections.length) {
      showToast(t('popup_toast_no_selection', null, '선택된 요소가 없습니다'));
      return;
    }

    const result = await sendToContent({ type: 'GET_EXPORT', payload: { format } });
    if (!result || !result.data) {
      showToast(t('popup_toast_copy_failed', null, '복사 실패'));
      return;
    }

    copyToClipboard(result.data);
    const formatLabel = { ai: 'AI용', json: '개발자용', plain: '공유용' }[format] || '';
    showToast(`${formatLabel} ${t('popup_toast_copied', null, '복사됨')}`);
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
    initShortcutPreference();
    setHighlightColorInputs(DEFAULT_HIGHLIGHT_COLORS);
    setMarkerToggleButton(true);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || !tabs[0]) return;
      currentTabId = tabs[0].id;
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
