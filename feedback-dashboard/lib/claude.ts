import Anthropic from "@anthropic-ai/sdk";
import { Feedback } from "./channeltalk";

export interface Category {
  name: string;
  summary: string;
  feedbackIds: string[];
}

export interface AnalysisResult {
  categories: Category[];
}

export async function analyzeFeedbacks(
  feedbacks: Feedback[]
): Promise<AnalysisResult> {
  if (feedbacks.length === 0) {
    return { categories: [] };
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const feedbackList = feedbacks
    .map(
      (f, i) =>
        `[${i + 1}] ID: ${f.id}\n제목: ${f.title}\n내용: ${f.userVoice || f.title}`
    )
    .join("\n\n");

  const prompt = `다음은 SaaS 제품의 고객 피드백 목록입니다. 분석해서 JSON으로 응답해주세요.

${feedbackList}

요청사항:
1. 공통 주제를 기반으로 카테고리를 생성하세요 (최소 3개, 최대 10개)
2. 각 피드백을 가장 적합한 카테고리에 분류하세요
3. 각 카테고리의 핵심 요약을 1문장으로 작성하세요 (한국어)

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
{
  "categories": [
    {
      "name": "카테고리명",
      "summary": "이 카테고리 피드백 요약",
      "feedbackIds": ["피드백ID1", "피드백ID2"]
    }
  ]
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  // JSON 파싱
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude API 응답에서 JSON을 파싱할 수 없습니다.");
  }

  const result: AnalysisResult = JSON.parse(jsonMatch[0]);
  return result;
}
