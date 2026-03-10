/**
 * console-capture.js — 콘솔 에러 수집 (MAIN world, document_start)
 * console.error / console.warn 오버라이드 + uncaught error / unhandled rejection + WebSocket 에러 감지.
 *
 * 타이밍 문제 해결:
 *   - ISOLATED world content script(document_idle)보다 먼저 실행되므로
 *     초기 에러는 postMessage가 유실될 수 있음.
 *   - _buffer에 에러를 보관하고, ISOLATED world가 로드된 후
 *     __AGT_REQUEST_ERRORS__ 메시지를 보내면 버퍼를 전달한다.
 */
(function () {
  'use strict';

  var MAX_ERRORS = 100;
  var _buffer = [];   // 전체 버퍼 (ISOLATED world 요청 시 전달)
  var _seen = {};     // MAIN world 중복 제거

  function dedupKey(type, message) {
    return type + '::' + String(message).slice(0, 300);
  }

  function emit(type, message, source) {
    if (_buffer.length >= MAX_ERRORS) return;
    var key = dedupKey(type, message);
    if (_seen[key]) return;
    _seen[key] = true;

    var entry = {
      type: type,
      message: String(message).slice(0, 500),
      source: source || '',
      ts: Date.now()
    };
    _buffer.push(entry);

    // 실시간 전달 (ISOLATED world 리스너가 이미 있는 경우)
    try {
      window.postMessage({ __AGT_CONSOLE_CAPTURE__: true, entry: entry }, '*');
    } catch (_err) {}
  }

  function argsToMessage(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a instanceof Error) {
        parts.push(a.message);
      } else if (a !== null && typeof a === 'object') {
        try { parts.push(JSON.stringify(a)); } catch (_) { parts.push(String(a)); }
      } else {
        parts.push(String(a));
      }
    }
    return parts.join(' ');
  }

  // console.error 오버라이드
  var _origError = console.error;
  console.error = function () {
    emit('error', argsToMessage(Array.prototype.slice.call(arguments)), '');
    return _origError.apply(console, arguments);
  };

  // console.warn 오버라이드
  var _origWarn = console.warn;
  console.warn = function () {
    emit('warn', argsToMessage(Array.prototype.slice.call(arguments)), '');
    return _origWarn.apply(console, arguments);
  };

  // JS 오류 + 리소스 로드 실패 (img, script, link 등 401/404 포함)
  window.addEventListener('error', function (e) {
    var target = e.target;
    // 리소스 로드 에러 (e.target이 DOM 요소인 경우)
    if (target && target !== window && target.tagName) {
      var tag = target.tagName.toUpperCase();
      var url = target.src || target.href || target.currentSrc || '';
      if (url) {
        emit('network', tag + ' load failed: ' + String(url).slice(0, 300), '');
      }
      return;
    }
    // JS 오류
    var msg = (e && e.message) ? e.message : String(e);
    var src = (e && e.filename) ? (e.filename + ':' + (e.lineno || 0) + ':' + (e.colno || 0)) : '';
    if (msg) emit('uncaught', msg, src);
  }, true);

  // 처리되지 않은 Promise rejection
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    var msg = (reason instanceof Error) ? reason.message : String(reason);
    emit('rejection', msg, '');
  }, true);

  // WebSocket 에러 감지 (네트워크 레벨 에러 포함)
  if (typeof WebSocket !== 'undefined') {
    var _OrigWS = WebSocket;
    window.WebSocket = function (url, protocols) {
      var ws = protocols !== undefined
        ? new _OrigWS(url, protocols)
        : new _OrigWS(url);
      ws.addEventListener('error', function () {
        emit('websocket', 'WebSocket connection failed: ' + String(url), '');
      });
      return ws;
    };
    window.WebSocket.prototype = _OrigWS.prototype;
    window.WebSocket.CONNECTING = _OrigWS.CONNECTING;
    window.WebSocket.OPEN = _OrigWS.OPEN;
    window.WebSocket.CLOSING = _OrigWS.CLOSING;
    window.WebSocket.CLOSED = _OrigWS.CLOSED;
  }

  // fetch 4xx/5xx 에러 감지 (window에 bind하여 Illegal invocation 방지)
  if (typeof fetch !== 'undefined') {
    var _origFetch = window.fetch.bind(window);
    window.fetch = function () {
      var args = Array.prototype.slice.call(arguments);
      var req = args[0];
      var url = req ? (typeof req === 'string' ? req : (req.url || String(req))) : '';
      return _origFetch.apply(window, args).then(function (res) {
        if (!res.ok) {
          emit('network', res.status + ' ' + res.statusText + ' — ' + String(url).slice(0, 300), '');
        }
        return res;
      }, function (err) {
        emit('network', 'fetch failed: ' + String(err.message || err) + ' — ' + String(url).slice(0, 300), '');
        throw err;
      });
    };
  }

  // XMLHttpRequest 4xx/5xx 에러 감지
  if (typeof XMLHttpRequest !== 'undefined') {
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__agtUrl = String(url).slice(0, 300);
      return _origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      xhr.addEventListener('load', function () {
        if (xhr.status >= 400) {
          emit('network', xhr.status + ' ' + xhr.statusText + ' — ' + (xhr.__agtUrl || ''), '');
        }
      });
      xhr.addEventListener('error', function () {
        emit('network', 'XHR failed — ' + (xhr.__agtUrl || ''), '');
      });
      return _origSend.apply(this, arguments);
    };
  }

  // img 요소 직접 감시 (capture phase로 못 잡히는 경우 대비)
  function _attachImgListener(img) {
    if (!img || img.__agtErrAttached) return;
    img.__agtErrAttached = true;
    img.addEventListener('error', function () {
      var url = img.currentSrc || img.src || '';
      if (url) emit('network', 'IMG load failed: ' + String(url).slice(0, 300), '');
    });
  }

  // MutationObserver로 동적으로 추가되는 img 감시
  var _mo = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (!node || node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') {
          _attachImgListener(node);
        } else if (node.querySelectorAll) {
          var imgs = node.querySelectorAll('img');
          for (var k = 0; k < imgs.length; k++) _attachImgListener(imgs[k]);
        }
      }
    }
  });

  // DOM이 준비되면 기존 img + 감시 시작
  function _startImgObserver() {
    var root = document.documentElement || document.body;
    if (!root) return;
    var existing = root.querySelectorAll('img');
    for (var i = 0; i < existing.length; i++) _attachImgListener(existing[i]);
    _mo.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startImgObserver);
  } else {
    _startImgObserver();
  }

  // ISOLATED world 요청 시 버퍼 전달
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.__AGT_REQUEST_ERRORS__ !== true) return;
    try {
      window.postMessage({ __AGT_CONSOLE_BUFFER__: true, errors: _buffer.slice() }, '*');
    } catch (_err) {}
  });
})();
