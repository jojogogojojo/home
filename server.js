const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// ─── Notion helpers ──────────────────────────────────────────────────────────

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

function extractPageId(urlOrId) {
  const patterns = [
    /([a-f0-9]{32})(?:[?#]|$)/,
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
  ];
  for (const p of patterns) {
    const m = (urlOrId || '').match(p);
    if (m) return m[1].replace(/-/g, '');
  }
  return null;
}

function richTextToHtml(richText) {
  if (!richText?.length) return '';
  return richText.map((t) => {
    let text = t.plain_text || '';
    if (t.href) text = `<a href="${t.href}">${text}</a>`;
    if (t.annotations?.bold) text = `<strong>${text}</strong>`;
    if (t.annotations?.italic) text = `<em>${text}</em>`;
    if (t.annotations?.code) text = `<code>${text}</code>`;
    if (t.annotations?.strikethrough) text = `<s>${text}</s>`;
    if (t.annotations?.underline) text = `<u>${text}</u>`;
    return text;
  }).join('');
}

function blocksToHtml(blocks) {
  const lines = [];
  let listBuffer = [], listType = null;

  function flushList() {
    if (!listBuffer.length) return;
    const tag = listType === 'numbered' ? 'ol' : 'ul';
    lines.push(`<${tag}>${listBuffer.map(i => `<li>${i}</li>`).join('')}</${tag}>`);
    listBuffer = []; listType = null;
  }

  for (const block of blocks) {
    const { type } = block;

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
      case 'child_page':
        lines.push(`<hr><h2>${block.child_page?.title || '하위 페이지'}</h2>`);
        break;
      case 'heading_1': lines.push(`<h1>${richTextToHtml(block.heading_1?.rich_text)}</h1>`); break;
      case 'heading_2': lines.push(`<h2>${richTextToHtml(block.heading_2?.rich_text)}</h2>`); break;
      case 'heading_3': lines.push(`<h3>${richTextToHtml(block.heading_3?.rich_text)}</h3>`); break;
      case 'paragraph': {
        const text = richTextToHtml(block.paragraph?.rich_text);
        lines.push(text.trim() ? `<p>${text}</p>` : '<br>');
        break;
      }
      case 'quote': lines.push(`<blockquote>${richTextToHtml(block.quote?.rich_text)}</blockquote>`); break;
      case 'code': lines.push(`<pre><code>${richTextToHtml(block.code?.rich_text)}</code></pre>`); break;
      case 'divider': lines.push('<hr>'); break;
      case 'callout': {
        const em = block.callout?.icon?.emoji || '';
        lines.push(`<p>${em} ${richTextToHtml(block.callout?.rich_text)}</p>`);
        break;
      }
      case 'image': {
        const url = block.image?.file?.url || block.image?.external?.url || '';
        const cap = richTextToHtml(block.image?.caption) || '';
        if (url) lines.push(`<figure><img src="${url}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`);
        break;
      }
      case 'toggle':
        lines.push(`<details><summary>${richTextToHtml(block.toggle?.rich_text)}</summary></details>`);
        break;
      default: break;
    }
  }
  flushList();
  return lines.join('\n');
}

async function fetchAllBlocks(client, blockId) {
  let blocks = [], cursor;
  do {
    const params = cursor ? { start_cursor: cursor } : {};
    const res = await client.get(`/blocks/${blockId}/children`, { params });
    blocks = blocks.concat(res.data.results);
    cursor = res.data.has_more ? res.data.next_cursor : null;
  } while (cursor);
  return blocks;
}

async function fetchBlocksDeep(client, blockId, depth = 0) {
  if (depth > 3) return [];
  const blocks = await fetchAllBlocks(client, blockId);
  const result = [];
  for (const b of blocks) {
    result.push(b);
    if (b.type === 'child_page') {
      const sub = await fetchBlocksDeep(client, b.id, depth + 1);
      result.push(...sub);
    }
  }
  return result;
}

function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of ['title', 'Title', 'Name', 'name', '제목', '이름']) {
    if (props[key]?.title) return props[key].title.map(t => t.plain_text).join('');
  }
  return page.title?.map(t => t.plain_text).join('') || '제목 없음';
}

// ─── Claude translation ──────────────────────────────────────────────────────

async function translateWithClaude(claudeKey, title, body, targetLangName) {
  const client = new Anthropic({ apiKey: claudeKey });

  const [translatedTitle, translatedBody] = await Promise.all([
    client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Translate this title to ${targetLangName}. Return only the translated title, nothing else:\n\n${title}`,
      }],
    }).then(r => r.content[0].text.trim()),

    client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `Translate the following HTML content to ${targetLangName}. Preserve ALL HTML tags exactly as-is. Only translate the visible text content inside the tags. Return only the translated HTML:\n\n${body}`,
      }],
    }).then(r => r.content[0].text.trim()),
  ]);

  return { title: translatedTitle, body: translatedBody };
}

// ─── Channel Talk helpers ────────────────────────────────────────────────────

function ctClient(key, secret) {
  return axios.create({
    baseURL: 'https://api.channel.io',
    headers: {
      'x-access-key': key,
      'x-access-secret': secret,
      'Content-Type': 'application/json',
    },
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post('/api/notion/test', async (req, res) => {
  const { token, pageUrl } = req.body;
  if (!token) return res.status(400).json({ error: 'Integration Token이 필요합니다.' });
  try {
    const client = notionClient(token);
    const pageId = extractPageId(pageUrl || '');
    if (pageId) {
      const page = await client.get(`/pages/${pageId}`);
      return res.json({ ok: true, message: `연결 성공: "${getPageTitle(page.data)}"` });
    }
    await client.get('/users/me');
    res.json({ ok: true, message: '인증 성공! 페이지 URL도 입력해보세요.' });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.message || err.message });
  }
});

app.post('/api/notion/preview', async (req, res) => {
  const { token, pageUrl, includeSubpages } = req.body;
  const pageId = extractPageId(pageUrl);
  if (!token || !pageId) return res.status(400).json({ error: '토큰과 페이지 URL이 필요합니다.' });
  try {
    const client = notionClient(token);
    const [pageRes, blocks] = await Promise.all([
      client.get(`/pages/${pageId}`),
      includeSubpages ? fetchBlocksDeep(client, pageId) : fetchAllBlocks(client, pageId),
    ]);
    res.json({ ok: true, title: getPageTitle(pageRes.data), body: blocksToHtml(blocks), blockCount: blocks.length });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.message || err.message });
  }
});

app.post('/api/channeltalk/test', async (req, res) => {
  const { accessKey, accessSecret } = req.body;
  if (!accessKey || !accessSecret) return res.status(400).json({ error: 'Key와 Secret이 필요합니다.' });
  try {
    const client = ctClient(accessKey, accessSecret);
    const r = await client.get('/open/v5/channels');
    res.json({ ok: true, message: `연결 성공: ${r.data?.channel?.name || '채널'}` });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.message || err.message });
  }
});

app.post('/api/channeltalk/meta', async (req, res) => {
  const { accessKey, accessSecret } = req.body;
  if (!accessKey || !accessSecret) return res.status(400).json({ error: 'Key/Secret 필요' });
  try {
    const client = ctClient(accessKey, accessSecret);
    const [catRes, memberRes] = await Promise.allSettled([
      client.get('/open/v5/help-center/categories'),
      client.get('/open/v5/team-members'),
    ]);
    res.json({
      ok: true,
      categories: catRes.status === 'fulfilled' ? (catRes.value.data?.categories || []) : [],
      members: memberRes.status === 'fulfilled' ? (memberRes.value.data?.members || memberRes.value.data?.teamMembers || []) : [],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sync', async (req, res) => {
  const {
    notionToken, pageUrl, accessKey, accessSecret,
    categoryId, visibility, includeSubpages,
    translateEn, translateJa, claudeApiKey,
  } = req.body;

  if (!notionToken || !pageUrl || !accessKey || !accessSecret)
    return res.status(400).json({ error: '필수 필드를 모두 입력해주세요.' });

  const pageId = extractPageId(pageUrl);
  if (!pageId) return res.status(400).json({ error: '유효한 Notion 페이지 URL이 아닙니다.' });

  try {
    // 1. Notion 콘텐츠 수집
    const nClient = notionClient(notionToken);
    const [pageRes, blocks] = await Promise.all([
      nClient.get(`/pages/${pageId}`),
      includeSubpages ? fetchBlocksDeep(nClient, pageId) : fetchAllBlocks(nClient, pageId),
    ]);
    const koTitle = getPageTitle(pageRes.data);
    const koBody = blocksToHtml(blocks);

    const ct = ctClient(accessKey, accessSecret);
    const created = [];

    // 2. 한국어 아티클 생성 (항상)
    const koRes = await ct.post('/open/v5/help-center/articles', {
      title: koTitle, body: koBody, ...(categoryId ? { categoryId } : {}),
    });
    const koArticle = koRes.data?.article || koRes.data;
    if (visibility === 'public' && koArticle?.id)
      await ct.put(`/open/v5/help-center/articles/${koArticle.id}/publish`).catch(() => {});
    created.push({ lang: '한국어', id: koArticle?.id, title: koTitle });

    // 3. 영어 번역 생성
    if (translateEn && claudeApiKey) {
      const en = await translateWithClaude(claudeApiKey, koTitle, koBody, 'English');
      const enRes = await ct.post('/open/v5/help-center/articles', {
        title: en.title, body: en.body, ...(categoryId ? { categoryId } : {}),
      });
      const enArticle = enRes.data?.article || enRes.data;
      if (visibility === 'public' && enArticle?.id)
        await ct.put(`/open/v5/help-center/articles/${enArticle.id}/publish`).catch(() => {});
      created.push({ lang: '영어', id: enArticle?.id, title: en.title });
    }

    // 4. 일본어 번역 생성
    if (translateJa && claudeApiKey) {
      const ja = await translateWithClaude(claudeApiKey, koTitle, koBody, 'Japanese');
      const jaRes = await ct.post('/open/v5/help-center/articles', {
        title: ja.title, body: ja.body, ...(categoryId ? { categoryId } : {}),
      });
      const jaArticle = jaRes.data?.article || jaRes.data;
      if (visibility === 'public' && jaArticle?.id)
        await ct.put(`/open/v5/help-center/articles/${jaArticle.id}/publish`).catch(() => {});
      created.push({ lang: '일본어', id: jaArticle?.id, title: ja.title });
    }

    res.json({ ok: true, created });
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    res.status(400).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
