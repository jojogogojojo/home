// background.js — Service Worker
// 네트워크 요청을 감시하여 HTTP 에러와 느린 요청을 수집합니다.

const pendingRequests = new Map(); // requestId → { url, startTime, tabId }
const SLOW_REQUEST_THRESHOLD_MS = 3000;

// ── 네트워크 리스너 등록 ─────────────────────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
  handleBeforeRequest,
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onCompleted.addListener(
  handleCompleted,
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.webRequest.onErrorOccurred.addListener(
  handleErrorOccurred,
  { urls: ['<all_urls>'] }
);

// ── 핸들러 ────────────────────────────────────────────────────────

async function handleBeforeRequest(details) {
  const { isRecording } = await chrome.storage.local.get('isRecording');
  if (!isRecording) return;

  pendingRequests.set(details.requestId, {
    url: details.url,
    startTime: Date.now(),
    tabId: details.tabId
  });
}

async function handleCompleted(details) {
  const { isRecording } = await chrome.storage.local.get('isRecording');
  if (!isRecording) {
    pendingRequests.delete(details.requestId);
    return;
  }

  const pending = pendingRequests.get(details.requestId);
  if (!pending) return;
  pendingRequests.delete(details.requestId);

  const duration = Date.now() - pending.startTime;
  const status = details.statusCode;
  const timestamp = new Date().toISOString();
  const updates = {};

  // 4xx / 5xx 에러 수집
  if (status >= 400) {
    const { httpErrors = [] } = await chrome.storage.local.get('httpErrors');
    httpErrors.push({
      url: pending.url,
      status,
      timestamp,
      duration
    });
    updates.httpErrors = httpErrors;
  }

  // 느린 요청 수집 (3초 이상)
  if (duration >= SLOW_REQUEST_THRESHOLD_MS) {
    const { slowRequests = [] } = await chrome.storage.local.get('slowRequests');
    slowRequests.push({
      url: pending.url,
      duration,
      status,
      timestamp
    });
    updates.slowRequests = slowRequests;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function handleErrorOccurred(details) {
  // 네트워크 레벨 에러 (DNS 실패, 연결 거부 등) — Map 정리
  pendingRequests.delete(details.requestId);
}

// ── Content Script 메시지 수신 ────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONSOLE_ERROR') {
    handleConsoleError(message.payload, sender).then(() => sendResponse({ ok: true }));
    return true; // 비동기 응답
  }
  if (message.type === 'PAGE_VISIT') {
    handlePageVisit(message.payload, sender).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleConsoleError(payload, sender) {
  const { isRecording } = await chrome.storage.local.get('isRecording');
  if (!isRecording) return;

  const { consoleErrors = [] } = await chrome.storage.local.get('consoleErrors');
  consoleErrors.push({
    message: payload.message,
    level: payload.level,
    url: sender.url || payload.url || '',
    timestamp: new Date().toISOString(),
    stack: payload.stack || null
  });
  await chrome.storage.local.set({ consoleErrors });
}

async function handlePageVisit(payload, sender) {
  const { isRecording } = await chrome.storage.local.get('isRecording');
  if (!isRecording) return;

  const { pageVisits = [] } = await chrome.storage.local.get('pageVisits');
  const url = payload.url || sender.url || '';
  const last = pageVisits[pageVisits.length - 1];
  if (last && last.url === url) return; // 중복 제거

  pageVisits.push({ url, timestamp: new Date().toISOString() });
  await chrome.storage.local.set({ pageVisits });
}
