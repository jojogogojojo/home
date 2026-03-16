const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DATABASE_ID = "1ce74b55ec7c80eaa364e441d762c6a6";
const TODAY = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

/**
 * Notion DB에서 오늘 이후 "요청 완료" 상태인 항목 조회
 */
async function fetchPendingAnnouncements() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        {
          property: "상태",
          status: {
            equals: "요청 완료",
          },
        },
        {
          property: "생성일시",
          date: {
            on_or_after: TODAY,
          },
        },
      ],
    },
  });

  return response.results;
}

/**
 * 페이지 본문 텍스트 추출
 */
async function extractPageContent(pageId) {
  const blocks = await notion.blocks.children.list({ block_id: pageId });

  const texts = blocks.results
    .map((block) => {
      const type = block.type;
      const richTexts = block[type]?.rich_text || [];
      return richTexts.map((rt) => rt.plain_text).join("");
    })
    .filter(Boolean);

  return texts.join("\n");
}

/**
 * 페이지 제목 추출
 */
function extractTitle(page) {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (!titleProp) return "제목 없음";
  return titleProp.title.map((t) => t.plain_text).join("") || "제목 없음";
}

/**
 * 처리 완료 후 상태 업데이트
 */
async function markAsProcessed(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      상태: {
        status: {
          name: "처리 완료",
        },
      },
    },
  });
}

module.exports = {
  fetchPendingAnnouncements,
  extractPageContent,
  extractTitle,
  markAsProcessed,
};
