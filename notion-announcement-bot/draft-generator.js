const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANNOUNCEMENT_PROMPT = `당신은 채널톡 제품팀의 공지 작성 담당자입니다.
아래 내용을 바탕으로 사내 공지 초안을 작성해주세요.

작성 규칙:
- 제목: 핵심을 담은 한 줄 (이모지 포함 가능)
- 본문: 3~5문장으로 간결하게
- 톤: 친근하지만 명확하게
- 구조: [배경/이유] → [내용] → [일정/액션]
- 마지막에 문의처 한 줄 추가

출력 형식:
제목: (제목)

(본문)

문의: (담당팀/담당자)`;

/**
 * Notion 내용으로 공지 초안 생성
 */
async function generateAnnouncementDraft(title, content) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${ANNOUNCEMENT_PROMPT}

---
요청 제목: ${title}

요청 내용:
${content}`,
      },
    ],
  });

  return message.content[0].text;
}

module.exports = { generateAnnouncementDraft };
