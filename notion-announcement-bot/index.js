require("dotenv").config();

const {
  fetchPendingAnnouncements,
  extractPageContent,
  extractTitle,
  markAsProcessed,
} = require("./notion-fetcher");
const { generateAnnouncementDraft } = require("./draft-generator");
const { sendToTeamChat } = require("./channeltalk-sender");

// 전송할 채널톡 팀챗 그룹 ID (환경변수로 관리)
const TEAM_CHAT_GROUP_ID = process.env.CHANNEL_TEAM_CHAT_GROUP_ID;

async function run() {
  console.log(`[${new Date().toISOString()}] 공지 자동화 시작`);

  // 1. Notion에서 요청 완료 항목 조회
  const pages = await fetchPendingAnnouncements();
  console.log(`→ ${pages.length}개 항목 발견`);

  if (pages.length === 0) {
    console.log("처리할 항목 없음. 종료.");
    return;
  }

  for (const page of pages) {
    const title = extractTitle(page);
    console.log(`\n처리 중: "${title}" (${page.id})`);

    try {
      // 2. 페이지 본문 추출
      const content = await extractPageContent(page.id);
      if (!content.trim()) {
        console.log("  ⚠ 본문 없음, 스킵");
        continue;
      }

      // 3. Claude로 공지 초안 생성
      const draft = await generateAnnouncementDraft(title, content);
      console.log("  ✓ 초안 생성 완료");

      // 4. 채널톡 팀챗으로 전송
      await sendToTeamChat(TEAM_CHAT_GROUP_ID, draft);
      console.log("  ✓ 채널톡 전송 완료");

      // 5. Notion 상태 업데이트
      await markAsProcessed(page.id);
      console.log("  ✓ Notion 상태 업데이트 완료");
    } catch (err) {
      console.error(`  ✗ 오류 발생: ${err.message}`);
    }
  }

  console.log("\n완료");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
