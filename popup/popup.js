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
  const toggleBtn    = document.getElementById('toggleBtn');
  const toggleLabel  = document.getElementById('toggleLabel');
  const tabCount     = document.getElementById('tabCount');
  const selCount     = document.getElementById('selCount');
  const undoBtn      = document.getElementById('undoBtn');
  const redoBtn      = document.getElementById('redoBtn');
  const clearAllBtn  = document.getElementById('clearAllBtn');
  const selectionList = document.getElementById('selectionList');
  const emptyState   = document.getElementById('emptyState');
  const searchInput  = document.getElementById('searchInput');
  const searchBtn    = document.getElementById('searchBtn');
  const searchResult = document.getElementById('searchResult');
  const statusUrl    = document.getElementById('statusUrl');
  const markerToggleBtn = document.getElementById('markerToggleBtn');
  const toast        = document.getElementById('toast');
  const osWinBtn     = document.getElementById('osWinBtn');
  const osMacBtn     = document.getElementById('osMacBtn');
  const shortcutOsLabel = document.getElementById('shortcutOsLabel');
  const shortcutTableBody = document.getElementById('shortcutTableBody');
  const selectedColorInput = document.getElementById('selectedColorInput');
  const searchColorInput = document.getElementById('searchColorInput');
  const selectedColorHex = document.getElementById('selectedColorHex');
  const searchColorHex = document.getElementById('searchColorHex');
  const selectedColorPalette = document.getElementById('selectedColorPalette');
  const searchColorPalette = document.getElementById('searchColorPalette');
  const resetHighlightColorsBtn = document.getElementById('resetHighlightColorsBtn');
  const clearAllDefaultText = clearAllBtn.textContent;
  const clearAllDefaultTitle = clearAllBtn.title;
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
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899'
  ];

  const SHORTCUT_ROWS = [
    { label: '선택 모드 토글', win: 'Ctrl+Shift+X', mac: 'Cmd+Shift+X' },
    { label: '실행 취소', win: 'Ctrl+Z', mac: 'Cmd+Z' },
    { label: '다시 실행', win: 'Ctrl+Y', mac: 'Cmd+Shift+Z' },
    { label: '팝오버 취소/종료', win: 'Esc', mac: 'Esc' },
    { label: '주석 확정 (Add)', win: 'Enter', mac: 'Enter' },
    { label: '팝오버 줄바꿈', win: 'Shift+Enter', mac: 'Shift+Enter' }
  ];

  // ──────────────────────────────────────────
  // 탭 전환
  // ──────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');

      // 검색 탭을 벗어나면 하이라이트 제거
      if (tab.dataset.tab !== 'search') {
        sendToContent({ type: 'CLEAR_SEARCH' });
      }
    });
  });

  initShortcutPreference();
  renderRecommendedColorPalettes();
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
  setHighlightColorInputs(DEFAULT_HIGHLIGHT_COLORS);
  setMarkerToggleButton(true);

  // ──────────────────────────────────────────
  // content script 메시지 전송
  // ──────────────────────────────────────────
  function sendToContent(message) {
    return new Promise((resolve) => {
      if (!currentTabId) { resolve(null); return; }
      chrome.tabs.sendMessage(currentTabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
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
    shortcutOsLabel.textContent = shortcutPlatform === 'mac' ? 'Mac' : 'Win';
    renderShortcutTable();

    if (shouldPersist) {
      chrome.storage.local.set({ agt_shortcut_platform: shortcutPlatform });
    }
  }

  function renderShortcutTable() {
    const key = shortcutPlatform === 'mac' ? 'mac' : 'win';
    shortcutTableBody.innerHTML = SHORTCUT_ROWS.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td class="cell-key"><span class="kbd">${escapeHtml(row[key])}</span></td>
      </tr>
    `).join('');
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
      btn.title = `${targetKey === 'selected' ? '선택' : '검색'} 색상 ${color}`;
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
      showToast(result && result.ok ? '하이라이트 색상 적용됨' : '색상 저장됨');
    }
  }

  function setMarkerToggleButton(visible) {
    const isVisible = visible !== false;
    markerToggleBtn.dataset.visible = isVisible ? '1' : '0';
    markerToggleBtn.textContent = isVisible ? '마커 숨김' : '마커 표시';
    markerToggleBtn.title = isVisible ? '현재 마커 표시 중' : '현재 마커 숨김 중';
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
    if (!result || typeof result.visible !== 'boolean') {
      showToast('페이지와 통신 실패');
      return;
    }
    const finalVisible = result.visible;
    chrome.storage.local.set({ [MARKER_VISIBILITY_STORAGE_KEY]: finalVisible });
    setMarkerToggleButton(finalVisible);
    showToast(finalVisible ? '마커 표시' : '마커 숨김');
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
      toggleLabel.textContent = '선택 중 (클릭하여 중지)';
    } else {
      toggleBtn.className = 'toggle-btn inactive';
      toggleLabel.textContent = '선택 시작';
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
      const u = new URL(url);
      statusUrl.textContent = u.hostname + u.pathname;
    } catch {
      statusUrl.textContent = url;
    }
    statusUrl.title = url;
  }

  function renderSelections() {
    const sels = currentState.selections;

    // 기존 아이템 제거 (emptyState 제외)
    Array.from(selectionList.children).forEach(child => {
      if (child.id !== 'emptyState') child.remove();
    });

    if (sels.length === 0) {
      emptyState.style.display = '';
      return;
    }

    emptyState.style.display = 'none';

    // 역순으로 표시 (최신 선택이 위에)
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
      : '(텍스트 없음)';

    const bb = sel.boundingBox;
    const bbStr = bb ? `${bb.width}×${bb.height} @ (${bb.x},${bb.y})` : '';

    const annotationHtml = sel.annotation
      ? `<div class="sel-annotation">${escapeHtml(sel.annotation)}</div>`
      : '';

    item.innerHTML = `
      <div class="sel-item-header">
        <span class="sel-tag">${escapeHtml(sel.tagName)} ${orderNumber}번</span>
        <div class="sel-actions">
          <button class="sel-btn copy-sel" title="셀렉터 복사">복사</button>
          <button class="sel-btn del" title="삭제">삭제</button>
        </div>
      </div>
      <div class="sel-selector">${escapeHtml(sel.selector)}</div>
      <div class="sel-text">${escapeHtml(text)}</div>
      ${annotationHtml}
      ${bbStr ? `<div class="sel-meta">${bbStr} · ${sel.strategy}</div>` : ''}
    `;

    // 복사 버튼
    item.querySelector('.copy-sel').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(sel.selector);
      showToast('셀렉터 복사됨');
    });

    // 삭제 버튼
    item.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const state = await sendToContent({ type: 'REMOVE_SELECTION', payload: { id: sel.id } });
      applyState(state);
    });

    return item;
  }

  // ──────────────────────────────────────────
  // 버튼 이벤트
  // ──────────────────────────────────────────
  toggleBtn.addEventListener('click', async () => {
    const wasActive = currentState.isActive;
    const state = await sendToContent({ type: 'TOGGLE_ACTIVE' });
    applyState(state);
    // 비활성 → 활성 전환 시 팝업 닫기
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
      showToast('한 번 더 누르면 전체 삭제');
      return;
    }
    resetClearAllConfirm();
    const state = await sendToContent({ type: 'CLEAR_ALL' });
    applyState(state);
    showToast('전체 삭제됨');
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
      searchResult.innerHTML = '<span class="result-zero">페이지와 통신 실패</span>';
      return;
    }
    if (result.count === 0) {
      searchResult.innerHTML = `<span class="result-zero">일치하는 요소 없음:</span> <code>${escapeHtml(query)}</code>`;
    } else {
      searchResult.innerHTML = `<span class="result-count">${result.count}개</span> 요소 발견 — 설정한 검색 색상으로 표시`;
    }
  }

  // ──────────────────────────────────────────
  // 하단 내보내기 버튼 (클립보드 복사)
  // ──────────────────────────────────────────
  document.getElementById('quickJsonBtn').addEventListener('click', async () => {
    await exportAction('json');
  });

  async function exportAction(format) {
    if (!currentState.selections.length) {
      showToast('선택된 요소가 없습니다');
      return;
    }

    const result = await sendToContent({ type: 'GET_EXPORT', payload: { format } });
    if (!result || !result.data) {
      showToast('복사 실패');
      return;
    }

    copyToClipboard(result.data);
    showToast('복사되었습니다');
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

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let toastTimer = null;

  function armClearAllConfirm() {
    clearAllConfirmArmed = true;
    clearAllBtn.textContent = '✕ 정말삭제?';
    clearAllBtn.title = '한 번 더 누르면 전체 삭제';
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

  // ──────────────────────────────────────────
  // 초기화 — 현재 탭 가져와서 상태 요청
  // ──────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || !tabs[0]) return;
    currentTabId = tabs[0].id;
    await initHighlightColorPreference();
    await initMarkerVisibilityPreference();

    const state = await sendToContent({ type: 'GET_STATE' });
    if (state) {
      applyState(state);
    } else {
      // content script가 아직 없는 경우 (특수 페이지 등)
      statusUrl.textContent = tabs[0].url || '—';
      toggleBtn.disabled = true;
      markerToggleBtn.disabled = true;
      toggleLabel.textContent = '이 페이지에서 불가';
    }
  });

})();
