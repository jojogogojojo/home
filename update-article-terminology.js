#!/usr/bin/env node
/**
 * Channel.io Documents Open API - 아티클 용어 일괄 치환 스크립트
 * "매니저" → "팀 멤버" 로 모든 아티클에서 일괄 수정
 *
 * 사용법:
 *   ACCESS_KEY=<your-key> ACCESS_SECRET=<your-secret> node update-article-terminology.js
 *
 * 환경변수:
 *   ACCESS_KEY    - Channel.io Documents API Access Key
 *   ACCESS_SECRET - Channel.io Documents API Access Secret
 *   LANGUAGE      - 아티클 언어 코드 (기본값: "ko")
 *   DRY_RUN       - "true" 설정 시 실제 수정 없이 변경 내용만 출력
 */

const https = require("https");

const ACCESS_KEY = process.env.ACCESS_KEY;
const ACCESS_SECRET = process.env.ACCESS_SECRET;
const LANGUAGE = process.env.LANGUAGE || "ko";
const DRY_RUN = process.env.DRY_RUN === "true";

const BASE_URL = "document-api.channel.io";
const SEARCH_FROM = "매니저";
const REPLACE_TO = "팀 멤버";

if (!ACCESS_KEY || !ACCESS_SECRET) {
  console.error("❌ 환경변수 ACCESS_KEY와 ACCESS_SECRET을 설정해주세요.");
  console.error(
    "   예시: ACCESS_KEY=xxx ACCESS_SECRET=yyy node update-article-terminology.js"
  );
  process.exit(1);
}

const authHeader =
  "Basic " +
  Buffer.from(`${ACCESS_KEY}:${ACCESS_SECRET}`).toString("base64");

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(
            new Error(
              `HTTP ${res.statusCode} ${method} ${path}: ${data}`
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function listAllArticles() {
  const articles = [];
  let cursor = null;

  console.log("📋 아티클 목록 조회 중...");
  do {
    const query = cursor
      ? `/open/v1/spaces/$me/articles?language=${LANGUAGE}&cursor=${cursor}&limit=100`
      : `/open/v1/spaces/$me/articles?language=${LANGUAGE}&limit=100`;

    const res = await request("GET", query);
    const items = res.articles || res.items || [];
    articles.push(...items);
    cursor = res.nextCursor || res.cursor || null;

    console.log(
      `  → ${articles.length}개 아티클 로드됨 (cursor: ${cursor || "없음"})`
    );
  } while (cursor);

  return articles;
}

async function getArticle(articleId) {
  return request(
    "GET",
    `/open/v1/spaces/$me/articles/${articleId}?language=${LANGUAGE}`
  );
}

async function updateArticle(articleId, body) {
  return request(
    "PATCH",
    `/open/v1/spaces/$me/articles/${articleId}`,
    body
  );
}

function replaceInText(text) {
  if (!text || typeof text !== "string") return text;
  return text.split(SEARCH_FROM).join(REPLACE_TO);
}

/**
 * 아티클 콘텐츠(body)는 Channel.io Docs API에서 보통
 * Slate.js 기반 JSON 블록 구조로 반환됩니다.
 * 재귀적으로 모든 text 노드의 텍스트를 치환합니다.
 */
function replaceInContent(node) {
  if (Array.isArray(node)) {
    return node.map(replaceInContent);
  }
  if (node && typeof node === "object") {
    const result = {};
    for (const [key, val] of Object.entries(node)) {
      if (key === "text" && typeof val === "string") {
        result[key] = replaceInText(val);
      } else {
        result[key] = replaceInContent(val);
      }
    }
    return result;
  }
  return node;
}

function hasSearchTerm(node) {
  const str = JSON.stringify(node);
  return str.includes(SEARCH_FROM);
}

async function main() {
  console.log(`\n🔍 "${SEARCH_FROM}" → "${REPLACE_TO}" 치환 시작`);
  console.log(`   언어: ${LANGUAGE}`);
  console.log(`   모드: ${DRY_RUN ? "🔍 DRY RUN (미리보기만)" : "✏️  실제 수정"}\n`);

  let articles;
  try {
    articles = await listAllArticles();
  } catch (err) {
    console.error("❌ 아티클 목록 조회 실패:", err.message);
    process.exit(1);
  }

  console.log(`\n총 ${articles.length}개 아티클 검색 중...\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const article of articles) {
    const articleId = article.id;
    const title = article.title || article.name || "(제목 없음)";

    let detail;
    try {
      detail = await getArticle(articleId);
    } catch (err) {
      console.error(`  ❌ [${articleId}] "${title}" 조회 실패: ${err.message}`);
      errorCount++;
      continue;
    }

    const articleData = detail.article || detail;
    const originalTitle = articleData.title || "";
    const originalBody = articleData.body || articleData.content || null;

    const titleHasTerm = originalTitle.includes(SEARCH_FROM);
    const bodyHasTerm = originalBody && hasSearchTerm(originalBody);

    if (!titleHasTerm && !bodyHasTerm) {
      skippedCount++;
      continue;
    }

    const newTitle = replaceInText(originalTitle);
    const newBody = originalBody ? replaceInContent(originalBody) : undefined;

    console.log(`  ✅ [${articleId}] "${originalTitle}"`);
    if (titleHasTerm) {
      console.log(`     제목: "${originalTitle}" → "${newTitle}"`);
    }
    if (bodyHasTerm) {
      const count = (JSON.stringify(originalBody).match(
        new RegExp(SEARCH_FROM, "g")
      ) || []).length;
      console.log(`     본문: ${count}곳 치환`);
    }

    if (!DRY_RUN) {
      const patchBody = {};
      if (titleHasTerm) patchBody.title = newTitle;
      if (bodyHasTerm) patchBody.body = newBody;
      if (newBody !== undefined && !titleHasTerm) patchBody.content = newBody;

      try {
        await updateArticle(articleId, { language: LANGUAGE, ...patchBody });
        updatedCount++;
      } catch (err) {
        console.error(`     ❌ 업데이트 실패: ${err.message}`);
        errorCount++;
      }
    } else {
      updatedCount++;
    }
  }

  console.log("\n─────────────────────────────");
  console.log(`📊 결과 요약`);
  console.log(`   전체 아티클: ${articles.length}개`);
  console.log(`   치환 대상:   ${updatedCount}개`);
  console.log(`   변경 없음:   ${skippedCount}개`);
  if (errorCount > 0) console.log(`   오류:       ${errorCount}개`);
  if (DRY_RUN) {
    console.log(
      '\n💡 실제로 수정하려면 DRY_RUN 환경변수를 제거하고 다시 실행하세요.'
    );
  } else {
    console.log(`\n✅ 완료! ${updatedCount}개 아티클이 수정되었습니다.`);
  }
}

main();
