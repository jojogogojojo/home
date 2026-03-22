import Anthropic from "@anthropic-ai/sdk";
import type { Feedback } from "./channeltalk";

export const FIXED_CATEGORIES = ["AI", "워크플로우", "유저챗", "통계(리포트)", "전화", "팀챗", "기타"] as const;
export type CategoryName = (typeof FIXED_CATEGORIES)[number];

export interface FeedbackGroup {
  title: string;
  summary: string;
  count: number;
  feedbackIds: string[];
}

export interface Category {
  name: CategoryName;
  groups: FeedbackGroup[];
  totalCount: number;
}

export interface AnalysisResult {
  categories: Category[];
  totalCount: number;
}

export async function analyzeFeedbacks(
  feedbacks: Feedback[],
  apiKey: string
): Promise<AnalysisResult> {
  if (feedbacks.length === 0) {
    return { categories: [], totalCount: 0 };
  }

  const client = new Anthropic({ apiKey });

  const feedbackList = feedbacks
    .map((f) => `ID: ${f.id}\n제목: ${f.title}\n내용: ${f.userVoice || f.title}`)
    .join("\n\n---\n\n");

  const prompt = `다음은 채널톡 고객 피드백 목록입니다. 분석해서 JSON으로만 응답해주세요.

${feedbackList}

지시사항:
1. 각 피드백을 아래 7개 고정 카테고리 중 하나로 분류하세요:
   - AI: AI 기능, 자동 답변, 챗봇 관련
   - 워크플로우: 자동화, 팔로업, 알림 설정, 조건 분기
   - 유저챗: 상담 창, 채팅 UI, 상담 이력, 검색/필터
   - 통계(리포트): 대시보드, 리포트, 데이터 내보내기
   - 전화: 전화 상담, 녹음, 전사
   - 팀챗: 내부 팀 소통, 팀챗 알림
   - 기타: 위 카테고리에 해당하지 않는 것

2. 각 카테고리 안에서 유사한 피드백끼리 그룹으로 묶고, 그룹마다 공통 주제 제목과 요약을 작성하세요.

3. 그룹은 피드백 수가 많은 순서로 정렬하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 포함 금지:
{
  "categories": [
    {
      "name": "카테고리명 (7개 중 하나)",
      "groups": [
        {
          "title": "그룹 주제 (한국어, 10자 이내)",
          "summary": "이 그룹 피드백의 핵심 요약 1문장",
          "feedbackIds": ["피드백ID1", "피드백ID2"]
        }
      ]
    }
  ]
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude API 응답에서 JSON을 파싱할 수 없습니다.");
  }

  const raw = JSON.parse(jsonMatch[0]);

  // 카테고리별 totalCount 계산, groups에 count 추가
  const categories: Category[] = (raw.categories || []).map((cat: { name: CategoryName; groups: { title: string; summary: string; feedbackIds: string[] }[] }) => {
    const groups: FeedbackGroup[] = (cat.groups || [])
      .map((g: { title: string; summary: string; feedbackIds: string[] }) => ({
        ...g,
        count: g.feedbackIds.length,
      }))
      .sort((a: FeedbackGroup, b: FeedbackGroup) => b.count - a.count);

    return {
      name: cat.name,
      groups,
      totalCount: groups.reduce((sum: number, g: FeedbackGroup) => sum + g.count, 0),
    };
  });

  return { categories, totalCount: feedbacks.length };
}
