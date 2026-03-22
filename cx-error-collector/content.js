// content.js — Content Script
// 페이지의 console.error/warn과 미처리 에러를 가로채어 background로 전달합니다.
// MV3에서 main world의 console을 재정의하려면 <script> 태그 주입 방식을 사용해야 합니다.

(function () {
  // ── Main World 스크립트 주입 ────────────────────────────────────
  // content script는 isolated world에서 실행되므로
  // 페이지 실제 console을 가로채려면 <script> 태그로 주입해야 합니다.
  const injectedScript = document.createElement('script');
  injectedScript.textContent = `
    (function () {
      const _origError = console.error.bind(console);
      const _origWarn  = console.warn.bind(console);

      function relay(level, args) {
        const message = args.map(function (a) {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
          catch (e) { return String(a); }
        }).join(' ');

        window.postMessage({
          __cx_collector: true,
          level: level,
          message: message,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }, '*');
      }

      console.error = function () {
        relay('error', Array.prototype.slice.call(arguments));
        return _origError.apply(console, arguments);
      };

      console.warn = function () {
        relay('warn', Array.prototype.slice.call(arguments));
        return _origWarn.apply(console, arguments);
      };

      // 미처리 런타임 에러
      window.addEventListener('error', function (e) {
        window.postMessage({
          __cx_collector: true,
          level: 'uncaught',
          message: e.message || String(e),
          stack: e.error ? e.error.stack : null,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }, '*');
      }, true);

      // 미처리 Promise rejection
      window.addEventListener('unhandledrejection', function (e) {
        window.postMessage({
          __cx_collector: true,
          level: 'unhandledrejection',
          message: String(e.reason),
          url: window.location.href,
          timestamp: new Date().toISOString()
        }, '*');
      }, true);
    })();
  `;

  // document_start 시점에 head/html에 주입 후 제거 (DOM 정리)
  (document.head || document.documentElement).appendChild(injectedScript);
  injectedScript.remove();

  // ── postMessage 수신 → background로 전달 ────────────────────────
  window.addEventListener('message', function (event) {
    if (!event.data || !event.data.__cx_collector) return;

    chrome.runtime.sendMessage({
      type: 'CONSOLE_ERROR',
      payload: {
        message: event.data.message,
        level: event.data.level,
        url: event.data.url,
        stack: event.data.stack || null,
        timestamp: event.data.timestamp
      }
    }).catch(function () {
      // service worker가 대기 중일 수 있음 — 무시
    });
  });

  // ── 페이지 방문 기록 ────────────────────────────────────────────
  function reportPageVisit() {
    chrome.runtime.sendMessage({
      type: 'PAGE_VISIT',
      payload: { url: window.location.href }
    }).catch(function () {});
  }

  // 초기 로드
  reportPageVisit();

  // SPA 네비게이션 감지 (pushState 패치)
  const _origPushState = history.pushState.bind(history);
  history.pushState = function () {
    _origPushState.apply(history, arguments);
    setTimeout(reportPageVisit, 100);
  };

  window.addEventListener('popstate', function () {
    setTimeout(reportPageVisit, 100);
  });
})();
