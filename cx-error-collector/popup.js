// CX 에러 수집기 - Popup Script

const screens = {
  idle: document.getElementById('screen-idle'),
  recording: document.getElementById('screen-recording'),
  result: document.getElementById('screen-result'),
};

const badge = document.getElementById('status-badge');
const cntErrors = document.getElementById('cnt-errors');
const cntSlow = document.getElementById('cnt-slow');
const cntConsole = document.getElementById('cnt-console');
const eventList = document.getElementById('event-list');
const summaryTotal = document.getElementById('summary-total');
const summaryTime = document.getElementById('summary-time');
const copyToast = document.getElementById('copy-toast');
const historySection = document.getElementById('history-section');
const historyListEl = document.getElementById('history-list');

let currentEvents = [];
let recordingStartTime = null;

// 화면 전환
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// 배지 업데이트
function setBadge(state) {
  badge.className = 'badge';
  if (state === 'recording') {
    badge.classList.add('badge-recording');
    badge.textContent = '녹화 중';
  } else if (state === 'done') {
    badge.classList.add('badge-done');
    badge.textContent = '완료';
  } else {
    badge.classList.add('badge-idle');
    badge.textContent = '대기중';
  }
}

// 카운터 업데이트
function updateCounters(events) {
  cntErrors.textContent = events.filter(e => e.category === 'server_error' || e.category === 'client_error').length;
  cntSlow.textContent = events.filter(e => e.category === 'slow_request').length;
  cntConsole.textContent = events.filter(e => e.category === 'console_error').length;
}

// 이벤트 아이템 생성
function buildEventItem(ev) {
  const item = document.createElement('div');
  let cls, catCls, catLabel;

  if (ev.category === 'server_error' || ev.category === 'client_error') {
    cls = 'error'; catCls = 'cat-error';
    catLabel = `${ev.statusCode}${ev.statusText ? ' ' + ev.statusText : ''}`;
  } else if (ev.category === 'slow_request') {
    cls = 'slow'; catCls = 'cat-slow';
    catLabel = `느린 요청 ${ev.duration ? '(' + (ev.duration / 1000).toFixed(1) + 's)' : ''}`;
  } else {
    cls = 'console'; catCls = 'cat-console';
    catLabel = ev.level === 'error' ? '콘솔 에러' :
               ev.level === 'warn' ? '콘솔 경고' :
               ev.level === 'uncaught' ? '미처리 예외' : '미처리 Promise';
  }

  const time = new Date(ev.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const mainText = ev.url || ev.message || '';
  const pageLine = ev.pageUrl ? `<div class="event-page">📄 ${truncate(ev.pageUrl, 60)}</div>` : '';

  item.className = `event-item ${cls}`;
  item.innerHTML = `
    <div class="event-top">
      <span class="event-category ${catCls}">${catLabel}</span>
      <span class="event-time">${time}${ev.method ? ' · ' + ev.method : ''}</span>
    </div>
    <div class="event-url">${truncate(mainText, 72)}</div>
    ${pageLine}
  `;
  return item;
}

// 결과 화면 렌더링
function renderResult(events, startTime) {
  currentEvents = events;
  recordingStartTime = startTime;

  summaryTotal.textContent = `${events.length}개 이슈`;
  if (startTime) {
    const d = new Date(startTime);
    summaryTime.textContent = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  eventList.innerHTML = '';
  if (events.length === 0) {
    eventList.innerHTML = '<div class="event-item empty">수집된 이슈가 없습니다.</div>';
    return;
  }
  events.forEach(ev => eventList.appendChild(buildEventItem(ev)));
}

// 이전 기록 렌더링
function renderHistory(history) {
  if (!history || history.length === 0) {
    historySection.classList.add('hidden');
    return;
  }
  historySection.classList.remove('hidden');
  historyListEl.innerHTML = '';

  history.forEach((session, idx) => {
    const d = new Date(session.startTime);
    const dateStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    const errCount = session.events.filter(e => e.category === 'server_error' || e.category === 'client_error').length;
    const slowCount = session.events.filter(e => e.category === 'slow_request').length;
    const consCount = session.events.filter(e => e.category === 'console_error').length;

    const parts = [];
    if (errCount) parts.push(`HTTP ${errCount}건`);
    if (slowCount) parts.push(`느린 ${slowCount}건`);
    if (consCount) parts.push(`콘솔 ${consCount}건`);

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-date">${dateStr}</div>
      <div class="history-summary">${parts.length ? parts.join(' · ') : '이슈 없음'}</div>
    `;
    item.addEventListener('click', () => {
      showScreen('result');
      setBadge('done');
      renderResult(session.events, session.startTime);
    });
    historyListEl.appendChild(item);
  });
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// 클립보드 포맷
function formatForClipboard(events, startTime) {
  const lines = [];
  lines.push('=== CX 에러 수집 리포트 ===');
  lines.push(`수집 시작: ${startTime ? new Date(startTime).toLocaleString('ko-KR') : '-'}`);
  lines.push(`수집 완료: ${new Date().toLocaleString('ko-KR')}`);
  lines.push(`브라우저: ${navigator.userAgent}`);
  lines.push('');

  const httpErrors = events.filter(e => e.category === 'server_error' || e.category === 'client_error');
  const slowReqs = events.filter(e => e.category === 'slow_request');
  const consoleErrs = events.filter(e => e.category === 'console_error');

  if (httpErrors.length > 0) {
    lines.push(`[HTTP 에러] ${httpErrors.length}건`);
    httpErrors.forEach(e => {
      const status = e.statusText ? `${e.statusCode} ${e.statusText}` : `${e.statusCode}`;
      lines.push(`  - [${status}] ${e.method} ${e.url}`);
      lines.push(`    시각: ${new Date(e.timestamp).toLocaleTimeString('ko-KR')}`);
      if (e.pageUrl) lines.push(`    페이지: ${e.pageUrl}`);
      if (e.duration) lines.push(`    소요: ${(e.duration / 1000).toFixed(2)}s`);
    });
    lines.push('');
  }

  if (slowReqs.length > 0) {
    lines.push(`[느린 요청] ${slowReqs.length}건 (3초 이상)`);
    slowReqs.forEach(e => {
      lines.push(`  - ${e.method} ${e.url}`);
      lines.push(`    소요: ${(e.duration / 1000).toFixed(2)}s`);
      if (e.pageUrl) lines.push(`    페이지: ${e.pageUrl}`);
    });
    lines.push('');
  }

  if (consoleErrs.length > 0) {
    lines.push(`[콘솔 에러] ${consoleErrs.length}건`);
    consoleErrs.forEach(e => {
      lines.push(`  - [${e.level}] ${e.message}`);
      if (e.pageUrl) lines.push(`    페이지: ${e.pageUrl}`);
    });
    lines.push('');
  }

  if (events.length === 0) lines.push('수집된 이슈 없음');

  lines.push('========================');
  return lines.join('\n');
}

// 폴링
let pollInterval = null;

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (!state.isRecording) { clearInterval(pollInterval); return; }
    updateCounters(state.events || []);
  }, 800);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// 초기화
async function init() {
  const [state, { history }] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }),
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }),
  ]);

  if (state.isRecording) {
    showScreen('recording');
    setBadge('recording');
    updateCounters(state.events || []);
    startPolling();
  } else if (state.events && state.events.length > 0 && state.startTime) {
    showScreen('result');
    setBadge('done');
    renderResult(state.events, state.startTime);
  } else {
    showScreen('idle');
    setBadge('idle');
    renderHistory(history);
  }
}

// 이벤트 핸들러
document.getElementById('btn-start').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  showScreen('recording');
  setBadge('recording');
  cntErrors.textContent = '0';
  cntSlow.textContent = '0';
  cntConsole.textContent = '0';
  startPolling();
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  stopPolling();
  await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  showScreen('result');
  setBadge('done');
  renderResult(state.events || [], state.startTime);
});

document.getElementById('btn-back').addEventListener('click', async () => {
  showScreen('idle');
  setBadge('idle');
  const { history } = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
  renderHistory(history);
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  const text = formatForClipboard(currentEvents, recordingStartTime);
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  copyToast.classList.remove('hidden');
  setTimeout(() => copyToast.classList.add('hidden'), 2500);
});

document.getElementById('btn-download').addEventListener('click', () => {
  const payload = {
    collectedAt: new Date().toISOString(),
    startTime: recordingStartTime,
    userAgent: navigator.userAgent,
    events: currentEvents,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cx-error-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  // 세션 데이터 초기화 후 새 녹화
  await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  currentEvents = [];
  recordingStartTime = null;
  const { history } = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
  showScreen('idle');
  setBadge('idle');
  renderHistory(history);
});

document.getElementById('btn-clear-history').addEventListener('click', async (e) => {
  e.stopPropagation();
  await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
  historySection.classList.add('hidden');
  historyListEl.innerHTML = '';
});

init();
