// popup.js — Popup UI 로직

let pollInterval = null;

// ── 화면 전환 ─────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

// ── 초기화 ────────────────────────────────────────────────────────
async function init() {
  const data = await chrome.storage.local.get([
    'isRecording', 'httpErrors', 'slowRequests', 'consoleErrors'
  ]);

  if (data.isRecording) {
    // 녹화 중 — 카운트 복원 후 RECORDING 화면
    showScreen('screen-recording');
    updateLiveCounts(data.httpErrors || [], data.slowRequests || [], data.consoleErrors || []);
    startLivePoll();
  } else if (
    Array.isArray(data.httpErrors) &&
    (data.httpErrors.length > 0 || (data.slowRequests || []).length > 0 || (data.consoleErrors || []).length > 0)
  ) {
    // 이전 녹화 결과가 있으면 RESULTS 화면
    renderResults(data);
    showScreen('screen-results');
  } else {
    showScreen('screen-idle');
  }
}

// ── 버튼 이벤트 ───────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', async function () {
  await startRecording();
  showScreen('screen-recording');
  startLivePoll();
});

document.getElementById('btn-stop').addEventListener('click', async function () {
  stopLivePoll();
  const data = await stopRecording();
  renderResults(data);
  showScreen('screen-results');
});

document.getElementById('btn-copy').addEventListener('click', async function () {
  const data = await loadResults();
  const text = formatForClipboard(data);
  await navigator.clipboard.writeText(text);
  const confirm = document.getElementById('copy-confirm');
  confirm.classList.remove('hidden');
  setTimeout(function () { confirm.classList.add('hidden'); }, 2500);
});

document.getElementById('btn-download').addEventListener('click', async function () {
  const data = await loadResults();
  downloadJSON(data);
});

document.getElementById('btn-reset').addEventListener('click', async function () {
  await chrome.storage.local.clear();
  showScreen('screen-idle');
});

// ── 녹화 상태 관리 ────────────────────────────────────────────────
async function startRecording() {
  const browserInfo = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: screen.width + '\u00d7' + screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  await chrome.storage.local.set({
    isRecording: true,
    recordingStartTime: new Date().toISOString(),
    browserInfo: browserInfo,
    httpErrors: [],
    slowRequests: [],
    consoleErrors: [],
    pageVisits: []
  });
}

async function stopRecording() {
  await chrome.storage.local.set({ isRecording: false });
  return loadResults();
}

async function loadResults() {
  return chrome.storage.local.get([
    'httpErrors', 'slowRequests', 'consoleErrors',
    'pageVisits', 'browserInfo', 'recordingStartTime'
  ]);
}

// ── 실시간 카운트 폴링 ────────────────────────────────────────────
function startLivePoll() {
  pollInterval = setInterval(async function () {
    const data = await chrome.storage.local.get(['httpErrors', 'slowRequests', 'consoleErrors']);
    updateLiveCounts(data.httpErrors || [], data.slowRequests || [], data.consoleErrors || []);
  }, 1000);
}

function stopLivePoll() {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function updateLiveCounts(httpErrors, slowRequests, consoleErrors) {
  document.getElementById('count-http').textContent = httpErrors.length;
  document.getElementById('count-slow').textContent = slowRequests.length;
  document.getElementById('count-console').textContent = consoleErrors.length;
}

// ── 결과 렌더링 ───────────────────────────────────────────────────
function renderResults(data) {
  var httpErrors    = data.httpErrors    || [];
  var slowRequests  = data.slowRequests  || [];
  var consoleErrors = data.consoleErrors || [];
  var pageVisits    = data.pageVisits    || [];

  var el = document.getElementById('summary-stats');
  el.innerHTML =
    '<div class="stat-row"><span>HTTP 오류 (4xx/5xx)</span><b>' + httpErrors.length    + '건</b></div>' +
    '<div class="stat-row"><span>느린 요청 (3초 이상)</span><b>' + slowRequests.length  + '건</b></div>' +
    '<div class="stat-row"><span>콘솔 오류</span><b>'             + consoleErrors.length + '건</b></div>' +
    '<div class="stat-row"><span>방문 페이지</span><b>'           + pageVisits.length    + '건</b></div>';
}

// ── 클립보드 포맷 ─────────────────────────────────────────────────
function formatForClipboard(data) {
  var httpErrors    = data.httpErrors    || [];
  var slowRequests  = data.slowRequests  || [];
  var consoleErrors = data.consoleErrors || [];
  var pageVisits    = data.pageVisits    || [];
  var browserInfo   = data.browserInfo   || {};
  var startTime     = data.recordingStartTime;

  var SEP = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  var lines = [];

  lines.push(SEP);
  lines.push('\ud83d\udccb CX \uc624\ub958 \uc218\uc9d1 \ubcf4\uace0\uc11c');
  lines.push('\uc218\uc9d1 \uc2dc\uac01: ' + formatDateTime(startTime));
  lines.push(SEP);
  lines.push('');

  // 환경 정보
  lines.push('\u3010 \ud658\uacbd \uc815\ubcf4 \u3011');
  if (browserInfo.userAgent) lines.push('\ube0c\ub77c\uc6b0\uc800: ' + parseBrowser(browserInfo.userAgent));
  if (browserInfo.platform)  lines.push('\uc6b4\uc601\uccb4\uc81c: ' + browserInfo.platform);
  if (browserInfo.screenResolution) lines.push('\ud654\uba74 \ud574\uc0c1\ub3c4: ' + browserInfo.screenResolution);
  if (browserInfo.language)  lines.push('\uc5b8\uc5b4: ' + browserInfo.language);
  if (browserInfo.timezone)  lines.push('\uc2dc\uac04\ub300: ' + browserInfo.timezone);
  lines.push('');

  // 방문 페이지
  lines.push('\u3010 \ubc29\ubb38 \ud398\uc774\uc9c0 \u3011');
  if (pageVisits.length === 0) {
    lines.push('  (\uc5c6\uc74c)');
  } else {
    pageVisits.forEach(function (v, i) {
      lines.push('  ' + (i + 1) + '. ' + v.url);
      lines.push('     \uc2dc\uac01: ' + formatDateTime(v.timestamp));
    });
  }
  lines.push('');

  // HTTP 에러
  lines.push('\u3010 HTTP \uc624\ub958 (4xx/5xx) \u3011');
  if (httpErrors.length === 0) {
    lines.push('  (\uc5c6\uc74c)');
  } else {
    httpErrors.forEach(function (e, i) {
      lines.push('  ' + (i + 1) + '. [' + e.status + '] ' + e.url);
      lines.push('     \uc2dc\uac01: ' + formatDateTime(e.timestamp) + ' / \uc751\ub2f5\uc2dc\uac04: ' + e.duration + 'ms');
    });
  }
  lines.push('');

  // 느린 요청
  lines.push('\u3010 \ub290\ub9b0 \uc694\uccad (3\ucd08 \uc774\uc0c1) \u3011');
  if (slowRequests.length === 0) {
    lines.push('  (\uc5c6\uc74c)');
  } else {
    slowRequests.forEach(function (r, i) {
      lines.push('  ' + (i + 1) + '. ' + r.url);
      lines.push('     \uc18c\uc694\uc2dc\uac04: ' + (r.duration / 1000).toFixed(1) + '\ucd08 / \uc0c1\ud0dc: ' + r.status);
      lines.push('     \uc2dc\uac01: ' + formatDateTime(r.timestamp));
    });
  }
  lines.push('');

  // 콘솔 에러
  lines.push('\u3010 \ucf58\uc194 \uc624\ub958 \u3011');
  if (consoleErrors.length === 0) {
    lines.push('  (\uc5c6\uc74c)');
  } else {
    consoleErrors.forEach(function (e, i) {
      var label = e.level === 'warn'              ? '\uacbd\uace0'      :
                  e.level === 'uncaught'          ? '\ubbf8\ucc98\ub9ac \uc624\ub958' :
                  e.level === 'unhandledrejection' ? '\ube44\ub3d9\uae30 \uc624\ub958' : '\uc624\ub958';
      lines.push('  ' + (i + 1) + '. [' + label + '] ' + e.message.slice(0, 200));
      lines.push('     \ud398\uc774\uc9c0: ' + e.url);
      lines.push('     \uc2dc\uac01: ' + formatDateTime(e.timestamp));
    });
  }
  lines.push('');
  lines.push(SEP);

  return lines.join('\n');
}

function formatDateTime(iso) {
  if (!iso) return '\uc54c \uc218 \uc5c6\uc74c';
  var d = new Date(iso);
  return d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds());
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseBrowser(ua) {
  var m = ua.match(/Chrome\/([\d.]+)/);
  if (m) return 'Chrome ' + m[1];
  m = ua.match(/Firefox\/([\d.]+)/);
  if (m) return 'Firefox ' + m[1];
  m = ua.match(/Safari\/([\d.]+)/);
  if (m) return 'Safari';
  return ua.slice(0, 60);
}

// ── JSON 다운로드 ─────────────────────────────────────────────────
function downloadJSON(data) {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'cx-errors-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ── 시작 ─────────────────────────────────────────────────────────
init();
