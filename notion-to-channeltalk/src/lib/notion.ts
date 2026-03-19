import { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { NotionPage } from "@/types";

/** Notion URL에서 페이지 ID 추출 */
export function extractPageId(url: string): string {
  // 형식: https://www.notion.so/workspace/Title-abc123def456
  // 또는:  https://notion.so/abc123def456
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/([a-f0-9]{32})$/) || clean.match(/([a-f0-9-]{36})$/);
  if (!match) throw new Error("올바른 Notion URL이 아닙니다.");
  return match[1].replace(/-/g, "");
}

function formatPageId(id: string): string {
  // 32자 hex → UUID 형식
  if (id.includes("-")) return id;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function richTextToHtml(richTexts: RichTextItemResponse[]): string {
  return richTexts
    .map((rt) => {
      let text = rt.plain_text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      if (rt.annotations.code) text = `<code>${text}</code>`;
      if (rt.annotations.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations.italic) text = `<em>${text}</em>`;
      if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
      if (rt.annotations.underline) text = `<u>${text}</u>`;

      const href = rt.type === "text" ? rt.text.link?.url : undefined;
      if (href) text = `<a href="${href}">${text}</a>`;

      return text;
    })
    .join("");
}

function blockToHtml(block: BlockObjectResponse, depth = 0): string {
  const indent = depth > 0 ? ' style="margin-left:1.5em"' : "";

  switch (block.type) {
    case "paragraph":
      return `<p>${richTextToHtml(block.paragraph.rich_text)}</p>`;

    case "heading_1":
      return `<h1>${richTextToHtml(block.heading_1.rich_text)}</h1>`;

    case "heading_2":
      return `<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>`;

    case "heading_3":
      return `<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>`;

    case "bulleted_list_item":
      return `<li${indent}>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`;

    case "numbered_list_item":
      return `<li${indent}>${richTextToHtml(block.numbered_list_item.rich_text)}</li>`;

    case "code":
      return `<pre><code class="language-${block.code.language}">${richTextToHtml(block.code.rich_text)}</code></pre>`;

    case "quote":
      return `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`;

    case "callout":
      return `<blockquote>${richTextToHtml(block.callout.rich_text)}</blockquote>`;

    case "divider":
      return `<hr/>`;

    case "image": {
      const url =
        block.image.type === "external"
          ? block.image.external.url
          : block.image.file.url;
      const caption = block.image.caption.length
        ? richTextToHtml(block.image.caption)
        : "";
      return `<figure><img src="${url}" alt="${caption}"/>${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }

    case "toggle":
      return `<details><summary>${richTextToHtml(block.toggle.rich_text)}</summary></details>`;

    case "to_do":
      return `<p><input type="checkbox"${block.to_do.checked ? " checked" : ""} disabled/> ${richTextToHtml(block.to_do.rich_text)}</p>`;

    case "table_row":
      return `<tr>${block.table_row.cells.map((cell) => `<td>${richTextToHtml(cell)}</td>`).join("")}</tr>`;

    case "child_page":
      // 하위 페이지는 별도 처리
      return "";

    default:
      return "";
  }
}

/** 블록 목록을 HTML로 변환 (ul/ol 래핑 포함) */
function blocksToHtml(blocks: BlockObjectResponse[]): string {
  const parts: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === "bulleted_list_item") {
      const items: string[] = [];
      while (i < blocks.length && blocks[i].type === "bulleted_list_item") {
        items.push(blockToHtml(blocks[i]));
        i++;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
    } else if (block.type === "numbered_list_item") {
      const items: string[] = [];
      while (i < blocks.length && blocks[i].type === "numbered_list_item") {
        items.push(blockToHtml(blocks[i]));
        i++;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
    } else if (block.type === "table") {
      // table은 children에 table_row가 있음 — 별도 처리 필요
      parts.push("<table>");
      i++;
    } else {
      const html = blockToHtml(block);
      if (html) parts.push(html);
      i++;
    }
  }

  return parts.join("\n");
}

/** 페이지 제목 추출 */
function getPageTitle(page: PageObjectResponse): string {
  for (const value of Object.values(page.properties)) {
    if (value.type === "title" && value.title.length > 0) {
      return value.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

/** 단일 Notion 페이지를 재귀적으로 fetch */
async function fetchPage(
  client: Client,
  pageId: string,
  includeSubPages: boolean,
  depth = 0
): Promise<NotionPage> {
  const formattedId = formatPageId(pageId);

  const page = (await client.pages.retrieve({
    page_id: formattedId,
  })) as PageObjectResponse;

  const title = getPageTitle(page);

  // 블록 fetch (페이지 최대 100개씩 pagination)
  const allBlocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: formattedId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      allBlocks.push(block as BlockObjectResponse);
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const htmlContent = blocksToHtml(allBlocks);

  // 하위 페이지 재귀 fetch
  const children: NotionPage[] = [];

  if (includeSubPages && depth < 5) {
    const childPageBlocks = allBlocks.filter((b) => b.type === "child_page");
    for (const childBlock of childPageBlocks) {
      try {
        const childPage = await fetchPage(
          client,
          childBlock.id,
          includeSubPages,
          depth + 1
        );
        children.push(childPage);
      } catch {
        // 접근 권한 없는 하위 페이지는 skip
      }
    }
  }

  return {
    id: pageId,
    title,
    url: page.url,
    htmlContent,
    children,
  };
}

/** 엔트리포인트: Notion URL → NotionPage 트리 */
export async function fetchNotionPages(
  notionUrl: string,
  notionToken: string,
  includeSubPages: boolean
): Promise<NotionPage[]> {
  const client = new Client({ auth: notionToken });
  const pageId = extractPageId(notionUrl);
  const root = await fetchPage(client, pageId, includeSubPages);

  // 플랫 배열로 변환 (루트 + 모든 하위 페이지)
  const flatten = (page: NotionPage): NotionPage[] => [
    page,
    ...page.children.flatMap(flatten),
  ];

  return flatten(root);
}
