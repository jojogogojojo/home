// CX 에러 수집기 - Content Script
// 콘솔 에러/경고 및 미처리 예외 캡처

(function () {
  'use strict';

  function sendToBackground(level, args) {
    try {
      const message = Array.from(args).map(arg => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ');

      chrome.runtime.sendMessage({
        type: 'CONSOLE_ERROR',
        level,
        message: message.slice(0, 1000), // 최대 1000자
      }).catch(() => {}); // 녹화 중 아닐 때 무시
    } catch (_) {}
  }

  // console.error 오버라이드
  const origError = console.error.bind(console);
  console.error = function (...args) {
    sendToBackground('error', args);
    return origError(...args);
  };

  // console.warn 오버라이드
  const origWarn = console.warn.bind(console);
  console.warn = function (...args) {
    sendToBackground('warn', args);
    return origWarn(...args);
  };

  // 미처리 JS 예외
  window.addEventListener('error', (event) => {
    sendToBackground('uncaught', [
      `${event.message} (${event.filename}:${event.lineno}:${event.colno})`
    ]);
  });

  // 미처리 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    let msg = 'Unhandled Promise rejection';
    if (reason) {
      if (reason.message) msg += `: ${reason.message}`;
      else try { msg += `: ${JSON.stringify(reason)}`; } catch { msg += `: ${String(reason)}`; }
    }
    sendToBackground('unhandled_rejection', [msg]);
  });
})();
