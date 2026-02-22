/**
 * background.js — Service Worker (Manifest v3)
 * popup ↔ content script 메시지 중계 및 탭별 상태 관리
 */

// 탭별 활성화 상태 (메모리, service worker 재시작 시 초기화됨)
const tabActiveState = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, tabId, payload } = message;

  // popup → content 포워딩
  if (type === 'FORWARD_TO_CONTENT') {
    const targetTabId = tabId;
    chrome.tabs.sendMessage(targetTabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
    return true; // 비동기 응답 유지
  }

  // content → background: 탭 활성 상태 기록
  if (type === 'SET_ACTIVE_STATE') {
    const senderTabId = sender.tab?.id;
    if (senderTabId) {
      tabActiveState.set(senderTabId, payload.isActive);
    }
    sendResponse({ ok: true });
    return false;
  }

  // popup → background: 탭 활성 상태 조회
  if (type === 'GET_ACTIVE_STATE') {
    const state = tabActiveState.get(tabId) ?? false;
    sendResponse({ isActive: state });
    return false;
  }

  // 탭 닫힘 시 정리
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActiveState.delete(tabId);
});

// Extension 설치/업데이트 시 이미 열린 탭에 content script 자동 주입
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: [
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
