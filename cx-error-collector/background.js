// CX 에러 수집기 - Service Worker

const SLOW_THRESHOLD_MS = 3000;
const MAX_HISTORY = 10;

async function getState() {
  const data = await chrome.storage.session.get(['isRecording', 'events', 'startTime']);
  return {
    isRecording: data.isRecording || false,
    events: data.events || [],
    startTime: data.startTime || null,
  };
}

async function setState(updates) {
  await chrome.storage.session.set(updates);
}

// 요청 시작 시각 추적
const requestStartTimes = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    requestStartTimes.set(details.requestId, Date.now());
  },
  { urls: ['<all_urls>'] }
);

// 완료된 요청 처리 (에러 + 느린 요청 통합)
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const reqStart = requestStartTimes.get(details.requestId);
    requestStartTimes.delete(details.requestId);
    const duration = reqStart ? Date.now() - reqStart : null;

    const { isRecording, events } = await getState();
    if (!isRecording) return;

    const isError = details.statusCode >= 400;
    const isSlow = duration !== null && duration >= SLOW_THRESHOLD_MS;

    if (!isError && !isSlow) return;

    // 발생한 페이지 URL
    let pageUrl = '';
    if (details.tabId >= 0) {
      try {
        const tab = await chrome.tabs.get(details.tabId);
        pageUrl = tab.url || '';
      } catch (_) {}
    }

    // 응답 상태 텍스트
    const STATUS_TEXTS = {
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
      409: 'Conflict', 410: 'Gone', 422: 'Unprocessable Entity',
      429: 'Too Many Requests', 500: 'Internal Server Error',
      502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
    };
    const statusText = STATUS_TEXTS[details.statusCode] || '';

    if (isError) {
      events.push({
        timestamp: new Date().toISOString(),
        category: details.statusCode >= 500 ? 'server_error' : 'client_error',
        url: details.url,
        pageUrl,
        statusCode: details.statusCode,
        statusText,
        method: details.method,
        duration,
      });
    } else if (isSlow) {
      events.push({
        timestamp: new Date().toISOString(),
        category: 'slow_request',
        url: details.url,
        pageUrl,
        statusCode: details.statusCode,
        method: details.method,
        duration,
      });
    }

    await setState({ events });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    requestStartTimes.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

// 메시지 핸들러
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'CONSOLE_ERROR') {
    (async () => {
      const { isRecording, events } = await getState();
      if (!isRecording) { sendResponse({ ok: false }); return; }
      events.push({
        timestamp: new Date().toISOString(),
        category: 'console_error',
        level: message.level,
        message: message.message,
        pageUrl: sender.url || '',
      });
      await setState({ events });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'START_RECORDING') {
    (async () => {
      await setState({
        isRecording: true,
        events: [],
        startTime: new Date().toISOString(),
      });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    (async () => {
      const { events, startTime } = await getState();
      await setState({ isRecording: false });

      // 기록 저장 (이슈가 있을 때만)
      if (events.length > 0) {
        const { history = [] } = await chrome.storage.local.get('history');
        history.unshift({
          startTime,
          endTime: new Date().toISOString(),
          events,
        });
        if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
        await chrome.storage.local.set({ history });
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'GET_STATUS') {
    (async () => {
      const state = await getState();
      sendResponse(state);
    })();
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    (async () => {
      const { history = [] } = await chrome.storage.local.get('history');
      sendResponse({ history });
    })();
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    (async () => {
      await chrome.storage.local.set({ history: [] });
      sendResponse({ ok: true });
    })();
    return true;
  }
});
