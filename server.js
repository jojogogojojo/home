const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// ─── Notion helpers ────────────────────────────────────────────────────────

function notionClient(token) {
  return axios.create({
    baseURL: 'https://api.notion.com/v1',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  });
}

// Extract page ID from Notion URL
function extractPageId(urlOrId) {
  // Handle various Notion URL formats
  const patterns = [
    /([a-f0-9]{32})/,
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
  ];
  for (const p of patterns) {
    const m = urlOrId.match(p);
    if (m) return m[1].replace(/-/g, '');
  }
  return null;
}

// Convert Notion rich text array to plain/HTML text
function richTextToHtml(richText) {
  if (!richText || !richText.length) return '';
  return richText
    .map((t) => {
      let text = t.plain_text || '';
      if (t.href) text = `<a href="${t.href}">${text}</a>`;
      if (t.annotations) {
        if (t.annotations.bold) text = `<strong>${text}</strong>`;
        if (t.annotations.italic) text = `<em>${text}</em>`;
        if (t.annotations.code) text = `<code>${text}</code>`;
        if (t.annotations.strikethrough) text = `<s>${text}</s>`;
        if (t.annotations.underline) text = `<u>${text}</u>`;
      }
      return text;
    })
    .join('');
}

// Convert Notion blocks to HTML
function blocksToHtml(blocks) {
  const lines = [];
  let listBuffer = [];
  let listType = null;

  function flushList() {
    if (listBuffer.length === 0) return;
    const tag = listType === 'numbered' ? 'ol' : 'ul';
    lines.push(`<${tag}>`);
    listBuffer.forEach((item) => lines.push(`  <li>${item}</li>`));
    lines.push(`</${tag}>`);
    listBuffer = [];
    listType = null;
  }

  for (const block of blocks) {
    const { type } = block;

    // List blocks accumulate
    if (type === 'bulleted_list_item') {
      if (listType !== 'bullet') flushList();
      listType = 'bullet';
      listBuffer.push(richTextToHtml(block.bulleted_list_item?.rich_text));
      continue;
    }
    if (type === 'numbered_list_item') {
      if (listType !== 'numbered') flushList();
      listType = 'numbered';
      listBuffer.push(richTextToHtml(block.numbered_list_item?.rich_text));
      continue;
    }

    flushList();

    switch (type) {
      case 'heading_1':
        lines.push(`<h1>${richTextToHtml(block.heading_1?.rich_text)}</h1>`);
        break;
      case 'heading_2':
        lines.push(`<h2>${richTextToHtml(block.heading_2?.rich_text)}</h2>`);
        break;
      case 'heading_3':
        lines.push(`<h3>${richTextToHtml(block.heading_3?.rich_text)}</h3>`);
        break;
      case 'paragraph': {
        const text = richTextToHtml(block.paragraph?.rich_text);
        if (text.trim()) lines.push(`<p>${text}</p>`);
        else lines.push('<br>');
        break;
      }
      case 'quote':
        lines.push(`<blockquote>${richTextToHtml(block.quote?.rich_text)}</blockquote>`);
        break;
      case 'code':
        lines.push(`<pre><code>${richTextToHtml(block.code?.rich_text)}</code></pre>`);
        break;
      case 'divider':
        lines.push('<hr>');
        break;
      case 'callout': {
        const emoji = block.callout?.icon?.emoji || '';
        const text = richTextToHtml(block.callout?.rich_text);
        lines.push(`<p>${emoji} ${text}</p>`);
        break;
      }
      case 'image': {
        const url = block.image?.file?.url || block.image?.external?.url || '';
        const caption = richTextToHtml(block.image?.caption) || '';
        if (url) lines.push(`<figure><img src="${url}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`);
        break;
      }
      case 'toggle': {
        const summary = richTextToHtml(block.toggle?.rich_text);
        lines.push(`<details><summary>${summary}</summary></details>`);
        break;
      }
      default:
        break;
    }
  }

  flushList();
  return lines.join('\n');
}

// Fetch all blocks (handles pagination)
async function fetchAllBlocks(client, blockId) {
  let blocks = [];
  let cursor;
  do {
    const params = cursor ? { start_cursor: cursor } : {};
    const res = await client.get(`/blocks/${blockId}/children`, { params });
    blocks = blocks.concat(res.data.results);
    cursor = res.data.has_more ? res.data.next_cursor : null;
  } while (cursor);
  return blocks;
}

// Get Notion page title
function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of ['title', 'Title', 'Name', 'name', '제목', '이름']) {
    if (props[key]?.title) {
      return props[key].title.map((t) => t.plain_text).join('');
    }
  }
  // Check page title from root
  if (page.title) return page.title.map((t) => t.plain_text).join('');
  return '제목 없음';
}

// ─── Channel Talk helpers ───────────────────────────────────────────────────

function channelTalkClient(accessKey, accessSecret) {
  return axios.create({
    baseURL: 'https://api.channel.io',
    headers: {
      'x-access-key': accessKey,
      'x-access-secret': accessSecret,
      'Content-Type': 'application/json',
    },
  });
}

// ─── API Routes ─────────────────────────────────────────────────────────────

// Test Notion connection
app.post('/api/notion/test', async (req, res) => {
  const { token, pageUrl } = req.body;
  if (!token) return res.status(400).json({ error: 'Integration Token이 필요합니다.' });

  try {
    const client = notionClient(token);
    const pageId = extractPageId(pageUrl || '');

    if (!pageId) {
      // Just test auth with user endpoint
      await client.get('/users/me');
      return res.json({ ok: true, message: '인증 성공! 페이지 URL을 입력해주세요.' });
    }

    const page = await client.get(`/pages/${pageId}`);
    const title = getPageTitle(page.data);
    return res.json({ ok: true, message: `연결 성공: "${title}"` });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(400).json({ error: `Notion 오류: ${msg}` });
  }
});

// Get Notion page preview (title + HTML content)
app.post('/api/notion/preview', async (req, res) => {
  const { token, pageUrl } = req.body;
  if (!token || !pageUrl) return res.status(400).json({ error: '토큰과 페이지 URL이 필요합니다.' });

  const pageId = extractPageId(pageUrl);
  if (!pageId) return res.status(400).json({ error: '유효한 Notion 페이지 URL이 아닙니다.' });

  try {
    const client = notionClient(token);
    const [pageRes, blocksRes] = await Promise.all([
      client.get(`/pages/${pageId}`),
      fetchAllBlocks(client, pageId),
    ]);

    const title = getPageTitle(pageRes.data);
    const body = blocksToHtml(blocksRes);

    res.json({ ok: true, title, body, pageId });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(400).json({ error: `Notion 오류: ${msg}` });
  }
});

// Test Channel Talk connection
app.post('/api/channeltalk/test', async (req, res) => {
  const { accessKey, accessSecret } = req.body;
  if (!accessKey || !accessSecret) return res.status(400).json({ error: 'Access Key와 Secret이 필요합니다.' });

  try {
    const client = channelTalkClient(accessKey, accessSecret);
    // Try fetching the channel info
    const r = await client.get('/open/v5/channels');
    const channel = r.data?.channel;
    return res.json({ ok: true, message: `연결 성공: ${channel?.name || '채널'}` });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(400).json({ error: `Channel Talk 오류: ${msg}` });
  }
});

// Get Channel Talk categories
app.post('/api/channeltalk/categories', async (req, res) => {
  const { accessKey, accessSecret } = req.body;
  if (!accessKey || !accessSecret) return res.status(400).json({ error: 'Key/Secret 필요' });

  try {
    const client = channelTalkClient(accessKey, accessSecret);
    const r = await client.get('/open/v5/help-center/categories');
    res.json({ ok: true, categories: r.data?.categories || [] });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

// Sync: fetch Notion page → create Channel Talk article
app.post('/api/sync', async (req, res) => {
  const { notionToken, pageUrl, accessKey, accessSecret, categoryId, visibility } = req.body;

  if (!notionToken || !pageUrl || !accessKey || !accessSecret) {
    return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
  }

  const pageId = extractPageId(pageUrl);
  if (!pageId) return res.status(400).json({ error: '유효한 Notion 페이지 URL이 아닙니다.' });

  try {
    // 1. Fetch Notion content
    const nClient = notionClient(notionToken);
    const [pageRes, blocks] = await Promise.all([
      nClient.get(`/pages/${pageId}`),
      fetchAllBlocks(nClient, pageId),
    ]);

    const title = getPageTitle(pageRes.data);
    const body = blocksToHtml(blocks);

    // 2. Create Channel Talk article
    const ctClient = channelTalkClient(accessKey, accessSecret);

    const articlePayload = {
      title,
      body,
      ...(categoryId ? { categoryId } : {}),
    };

    const r = await ctClient.post('/open/v5/help-center/articles', articlePayload);
    const article = r.data?.article || r.data;

    // 3. Publish if public
    if (visibility === 'public' && article?.id) {
      await ctClient.put(`/open/v5/help-center/articles/${article.id}/publish`).catch(() => {});
    }

    res.json({
      ok: true,
      message: `아티클 생성 완료: "${title}"`,
      articleId: article?.id,
    });
  } catch (err) {
    const detail = err.response?.data;
    const msg = detail?.message || detail?.error || err.message;
    res.status(400).json({ error: msg, detail });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   notion-channeltalk.html 접속`);
});
