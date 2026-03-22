// CX 에러 수집기 - Service Worker
// HTTP 에러(4xx/5xx) 및 느린 요청(3초↑) 수집

const SLOW_THRESHOLD_MS = 3000;

// 녹화 상태 초기화
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

// webRequest 리스너 등록
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { isRecording, events } = await getState();
    if (!isRecording) return;

    const isError = details.statusCode >= 400;
    const isSlow = details.timeStamp && details.fromCache === false &&
      details.timeStamp > 0;

    // 소요 시간 계산 (webRequest API는 직접 duration을 주지 않으므로 추정)
    const entry = {
      timestamp: new Date().toISOString(),
      url: details.url,
      statusCode: details.statusCode,
      method: details.method,
      type: details.type,
    };

    let shouldAdd = false;

    if (isError) {
      entry.category = details.statusCode >= 500 ? 'server_error' : 'client_error';
      shouldAdd = true;
    }

    if (shouldAdd) {
      events.push(entry);
      await setState({ events });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 느린 요청 감지를 위한 시작 시간 추적
const requestStartTimes = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    requestStartTimes.set(details.requestId, Date.now());
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const startTime = requestStartTimes.get(details.requestId);
    if (!startTime) return;

    const duration = Date.now() - startTime;
    requestStartTimes.delete(details.requestId);

    if (duration < SLOW_THRESHOLD_MS) return;

    const { isRecording, events } = await getState();
    if (!isRecording) return;

    // 이미 에러로 추가된 항목에 소요시간 정보 추가
    const existingIdx = events.findIndex(
      e => e.url === details.url && !e.duration
    );

    if (existingIdx >= 0) {
      events[existingIdx].duration = duration;
    } else {
      // 느린 요청 (에러 아닌 것)
      if (details.statusCode < 400) {
        events.push({
          timestamp: new Date().toISOString(),
          url: details.url,
          statusCode: details.statusCode,
          method: details.method,
          duration,
          category: 'slow_request',
        });
      }
    }

    await setState({ events });
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    requestStartTimes.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

// 콘솔 에러 수신 (content script에서 전달)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONSOLE_ERROR') {
    (async () => {
      const { isRecording, events } = await getState();
      if (!isRecording) return;

      events.push({
        timestamp: new Date().toISOString(),
        category: 'console_error',
        level: message.level,
        message: message.message,
        url: sender.url || '',
      });
      await setState({ events });
      sendResponse({ ok: true });
    })();
    return true; // async response
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
      await setState({ isRecording: false });
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
});
