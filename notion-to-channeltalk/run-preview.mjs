/**
 * Notion → Channel Talk 미리보기 서버 (의존성 없는 단독 실행 버전)
 * 실행: node run-preview.mjs
 * Node.js 18+ 필요 (내장 fetch 사용)
 */

import { createServer } from "http";

const PORT = 3456;

// ── Notion 유틸 ────────────────────────────────

function extractPageId(url) {
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/([a-f0-9]{32})$/) || clean.match(/([a-f0-9-]{36})$/);
  if (!match) throw new Error("올바른 Notion URL이 아닙니다.");
  return match[1].replace(/-/g, "");
}

function formatPageId(id) {
  if (id.includes("-")) return id;
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
}

async function notionGet(token, path) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

function richTextToHtml(richTexts) {
  return richTexts.map((rt) => {
    let text = rt.plain_text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (rt.annotations.code) text = `<code>${text}</code>`;
    if (rt.annotations.bold) text = `<strong>${text}</strong>`;
    if (rt.annotations.italic) text = `<em>${text}</em>`;
    if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
    if (rt.annotations.underline) text = `<u>${text}</u>`;
    const href = rt.type === "text" ? rt.text?.link?.url : undefined;
    if (href) text = `<a href="${href}">${text}</a>`;
    return text;
  }).join("");
}

function blockToHtml(block) {
  switch (block.type) {
    case "paragraph": return `<p>${richTextToHtml(block.paragraph.rich_text)}</p>`;
    case "heading_1": return `<h1>${richTextToHtml(block.heading_1.rich_text)}</h1>`;
    case "heading_2": return `<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>`;
    case "heading_3": return `<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>`;
    case "bulleted_list_item": return `<li>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`;
    case "numbered_list_item": return `<li>${richTextToHtml(block.numbered_list_item.rich_text)}</li>`;
    case "code": return `<pre><code>${richTextToHtml(block.code.rich_text)}</code></pre>`;
    case "quote": return `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`;
    case "callout": return `<blockquote>${richTextToHtml(block.callout.rich_text)}</blockquote>`;
    case "divider": return `<hr/>`;
    case "image": {
      const url = block.image.type === "external" ? block.image.external.url : block.image.file.url;
      const cap = block.image.caption.length ? richTextToHtml(block.image.caption) : "";
      return `<figure><img src="${url}" alt="${cap}"/>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
    }
    case "to_do": return `<p><input type="checkbox"${block.to_do.checked ? " checked" : ""} disabled/> ${richTextToHtml(block.to_do.rich_text)}</p>`;
    case "child_page": return "";
    default: return "";
  }
}

function blocksToHtml(blocks) {
  const parts = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "bulleted_list_item") {
      const items = [];
      while (i < blocks.length && blocks[i].type === "bulleted_list_item") { items.push(blockToHtml(blocks[i])); i++; }
      parts.push(`<ul>${items.join("")}</ul>`);
    } else if (block.type === "numbered_list_item") {
      const items = [];
      while (i < blocks.length && blocks[i].type === "numbered_list_item") { items.push(blockToHtml(blocks[i])); i++; }
      parts.push(`<ol>${items.join("")}</ol>`);
    } else {
      const html = blockToHtml(block);
      if (html) parts.push(html);
      i++;
    }
  }
  return parts.join("\n");
}

function getPageTitle(page) {
  for (const val of Object.values(page.properties)) {
    if (val.type === "title" && val.title.length > 0) return val.title.map(t => t.plain_text).join("");
  }
  return "Untitled";
}

async function fetchPage(token, pageId, includeSubPages, depth = 0) {
  const id = formatPageId(pageId);
  const page = await notionGet(token, `/pages/${id}`);
  const title = getPageTitle(page);

  const allBlocks = [];
  let cursor;
  do {
    const url = `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await notionGet(token, url);
    allBlocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const htmlContent = blocksToHtml(allBlocks);
  const children = [];

  if (includeSubPages && depth < 5) {
    for (const b of allBlocks.filter(b => b.type === "child_page")) {
      try { children.push(await fetchPage(token, b.id, includeSubPages, depth + 1)); } catch {}
    }
  }

  return { id: pageId, title, url: page.url, htmlContent, children };
}

async function fetchNotionPages(notionUrl, notionToken, includeSubPages) {
  const pageId = extractPageId(notionUrl);
  const root = await fetchPage(notionToken, pageId, includeSubPages);
  const flatten = (p) => [p, ...p.children.flatMap(flatten)];
  return flatten(root);
}

// ── Channel Talk ────────────────────────────────

function makeAuth(key, secret) {
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function ctRequest(method, path, key, secret, body) {
  const res = await fetch(`https://document-api.channel.io${path}`, {
    method,
    headers: { Authorization: makeAuth(key, secret), "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Channel Talk API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

async function getSpace(key, secret) { return ctRequest("GET", "/open/v1/spaces/$me", key, secret); }
async function createArticle(key, secret, title, body) {
  return ctRequest("POST", "/open/v1/articles", key, secret, { title, body, status: "published" });
}

// ── API 핸들러 ──────────────────────────────────

async function handleApi(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());

  const { notionToken, notionUrl, accessKey, accessSecret, includeSubPages, action } = body;

  if (action === "validate") {
    try {
      const space = await getSpace(accessKey, accessSecret);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, space }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (action === "preview") {
    try {
      const pages = await fetchNotionPages(notionUrl, notionToken, includeSubPages);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pages: pages.map(p => ({ id: p.id, title: p.title, url: p.url, size: p.htmlContent.length, preview: p.htmlContent.slice(0, 500) })) }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (action === "sync") {
    try {
      const pages = await fetchNotionPages(notionUrl, notionToken, includeSubPages);
      const results = [];
      for (const p of pages) {
        try {
          const article = await createArticle(accessKey, accessSecret, p.title, p.htmlContent);
          results.push({ title: p.title, ok: true, url: article.webUrl || article.url || "" });
        } catch (e) {
          results.push({ title: p.title, ok: false, error: e.message });
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, results }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(400); res.end("unknown action");
}

// ── HTML UI ─────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Notion → Channel Talk</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh;padding:32px 16px}
  .wrap{max-width:720px;margin:0 auto}
  h1{font-size:24px;font-weight:700;margin-bottom:4px}
  .sub{color:#6e6e73;font-size:14px;margin-bottom:32px}
  .card{background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .card h2{font-size:13px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
  label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:#1d1d1f}
  input[type=text],input[type=password],input[type=url]{width:100%;border:1px solid #d2d2d7;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;transition:border .15s}
  input:focus{border-color:#0071e3;box-shadow:0 0 0 3px rgba(0,113,227,.15)}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .field{margin-bottom:14px}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border-radius:20px;margin-top:8px}
  .badge.ok{background:#f0faf3;color:#1a7f3c}
  .badge.err{background:#fff0f0;color:#c0392b}
  .badge.loading{background:#f5f5f7;color:#6e6e73}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0}
  .toggle-row span{font-size:14px}
  .toggle{position:relative;width:44px;height:26px}
  .toggle input{opacity:0;width:0;height:0}
  .slider{position:absolute;inset:0;background:#ccc;border-radius:13px;cursor:pointer;transition:.2s}
  .slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
  input:checked+.slider{background:#0071e3}
  input:checked+.slider:before{transform:translateX(18px)}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:10px;border:none;font-size:15px;font-weight:600;cursor:pointer;transition:.15s}
  .btn-primary{background:#0071e3;color:#fff}
  .btn-primary:hover{background:#0077ed}
  .btn-primary:disabled{background:#b0c8e8;cursor:not-allowed}
  .btn-secondary{background:#f5f5f7;color:#1d1d1f}
  .btn-secondary:hover{background:#e8e8ed}
  .actions{display:flex;gap:10px;flex-wrap:wrap}
  .preview-box{margin-top:16px}
  .page-item{border:1px solid #e5e5ea;border-radius:10px;margin-bottom:8px;overflow:hidden}
  .page-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;background:#fafafa}
  .page-header:hover{background:#f0f0f5}
  .page-title{font-size:14px;font-weight:500}
  .page-meta{font-size:12px;color:#8e8e93}
  .page-body{padding:16px;border-top:1px solid #e5e5ea;font-size:13px;color:#3a3a3c;max-height:300px;overflow-y:auto;line-height:1.6}
  .page-body h1,.page-body h2,.page-body h3{margin:8px 0 4px;font-size:inherit;font-weight:600}
  .page-body p{margin:4px 0}
  .page-body code{background:#f5f5f7;padding:1px 4px;border-radius:4px;font-size:12px}
  .page-body pre{background:#f5f5f7;padding:10px;border-radius:8px;overflow-x:auto}
  .page-body blockquote{border-left:3px solid #d2d2d7;padding-left:10px;color:#6e6e73}
  .page-body ul,.page-body ol{padding-left:20px}
  .result-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;margin-bottom:6px;font-size:14px}
  .result-item.ok{background:#f0faf3}
  .result-item.err{background:#fff0f0}
  .result-item a{color:#0071e3;font-size:12px;margin-left:auto}
  .spinner{width:16px;height:16px;border:2px solid #d2d2d7;border-top-color:#0071e3;border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
  .section-title{font-size:13px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
</style>
</head>
<body>
<div class="wrap">
  <h1>Notion → Channel Talk</h1>
  <p class="sub">Notion 페이지를 Channel Talk 아티클로 동기화</p>

  <div class="card">
    <h2>Notion</h2>
    <div class="field">
      <label>Integration Token</label>
      <input type="password" id="notionToken" placeholder="secret_..." autocomplete="off"/>
    </div>
    <div class="field">
      <label>페이지 URL</label>
      <input type="url" id="notionUrl" placeholder="https://www.notion.so/..."/>
    </div>
  </div>

  <div class="card">
    <h2>Channel Talk</h2>
    <div class="row">
      <div class="field">
        <label>Access Key</label>
        <input type="text" id="accessKey" autocomplete="off"/>
      </div>
      <div class="field">
        <label>Access Secret</label>
        <input type="password" id="accessSecret" autocomplete="off"/>
      </div>
    </div>
    <div id="spaceStatus"></div>
  </div>

  <div class="card">
    <h2>옵션</h2>
    <div class="toggle-row">
      <span>하위 페이지 포함</span>
      <label class="toggle"><input type="checkbox" id="includeSubPages" checked/><span class="slider"></span></label>
    </div>
  </div>

  <div class="actions" style="margin-bottom:16px">
    <button class="btn btn-secondary" id="btnPreview" onclick="doPreview()">미리보기</button>
    <button class="btn btn-primary" id="btnSync" onclick="doSync()" disabled>동기화 시작</button>
  </div>

  <div id="previewArea"></div>
  <div id="resultArea"></div>
</div>

<script>
let validateTimer;
['accessKey','accessSecret'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(validateCT, 800);
  });
});

async function validateCT() {
  const key = v('accessKey'), secret = v('accessSecret');
  const el = document.getElementById('spaceStatus');
  if (!key || !secret) { el.innerHTML=''; return; }
  el.innerHTML = '<div class="badge loading"><span class="spinner"></span> 확인 중...</div>';
  const res = await api({ action:'validate', accessKey:key, accessSecret:secret });
  el.innerHTML = res.ok
    ? '<div class="badge ok">✓ ' + res.space.name + '</div>'
    : '<div class="badge err">✗ ' + res.error + '</div>';
}

function v(id) { return document.getElementById(id).value.trim(); }
async function api(body) {
  const r = await fetch('/api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return r.json();
}
function getParams() {
  return { notionToken:v('notionToken'), notionUrl:v('notionUrl'), accessKey:v('accessKey'), accessSecret:v('accessSecret'), includeSubPages:document.getElementById('includeSubPages').checked };
}

async function doPreview() {
  const p = getParams();
  if (!p.notionToken || !p.notionUrl) { alert('Notion Token과 URL을 입력하세요.'); return; }
  const btn = document.getElementById('btnPreview');
  btn.innerHTML = '<span class="spinner"></span> 가져오는 중...';
  btn.disabled = true;
  document.getElementById('previewArea').innerHTML = '';
  document.getElementById('resultArea').innerHTML = '';
  document.getElementById('btnSync').disabled = true;
  const res = await api({ action:'preview', ...p });
  btn.innerHTML = '미리보기';
  btn.disabled = false;
  if (!res.ok) {
    document.getElementById('previewArea').innerHTML = '<div class="card" style="color:#c0392b">✗ ' + res.error + '</div>';
    return;
  }
  document.getElementById('btnSync').disabled = false;
  document.getElementById('previewArea').innerHTML = '<div class="card"><div class="section-title">미리보기 — ' + res.pages.length + '개 페이지</div>' +
    res.pages.map((p, i) =>
      '<div class="page-item"><div class="page-header" onclick="togglePage(' + i + ')">' +
      '<div><div class="page-title">' + esc(p.title) + '</div><div class="page-meta">' + (p.size > 1024 ? (p.size/1024).toFixed(1)+'KB' : p.size+'B') + '</div></div>' +
      '<span id="arrow' + i + '">▶</span></div>' +
      '<div class="page-body" id="body' + i + '" style="display:none">' + (p.preview || '<em>내용 없음</em>') + (p.size > 500 ? '…' : '') + '</div></div>'
    ).join('') + '</div>';
}

function togglePage(i) {
  const el = document.getElementById('body' + i);
  const arrow = document.getElementById('arrow' + i);
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  arrow.textContent = open ? '▼' : '▶';
}

async function doSync() {
  const p = getParams();
  if (!p.accessKey || !p.accessSecret) { alert('Channel Talk 자격증명을 입력하세요.'); return; }
  const btn = document.getElementById('btnSync');
  btn.innerHTML = '<span class="spinner"></span> 동기화 중...';
  btn.disabled = true;
  document.getElementById('resultArea').innerHTML = '';
  const res = await api({ action:'sync', ...p });
  btn.innerHTML = '동기화 시작';
  btn.disabled = false;
  if (!res.ok) {
    document.getElementById('resultArea').innerHTML = '<div class="card" style="color:#c0392b">✗ ' + res.error + '</div>';
    return;
  }
  const success = res.results.filter(r => r.ok).length;
  const fail = res.results.filter(r => !r.ok).length;
  document.getElementById('resultArea').innerHTML = '<div class="card"><div class="section-title">결과 — 성공 ' + success + ' / 실패 ' + fail + '</div>' +
    res.results.map(r =>
      '<div class="result-item ' + (r.ok ? 'ok' : 'err') + '">' +
      (r.ok ? '✓' : '✗') + ' ' + esc(r.title) +
      (r.url ? ' <a href="' + r.url + '" target="_blank">열기 ↗</a>' : '') +
      (r.error ? ' <span style="color:#c0392b;font-size:12px">— ' + esc(r.error) + '</span>' : '') +
      '</div>'
    ).join('') + '</div>';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
</script>
</body>
</html>`;

// ── HTTP 서버 ───────────────────────────────────

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api") {
    try { await handleApi(req, res); } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`\n✓ 서버 실행 중: http://localhost:${PORT}\n`);
});
