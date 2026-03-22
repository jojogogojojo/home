import type { NextRequest } from "next/server";
import { analyzeFeedbacks } from "@/lib/claude";
import type { Feedback } from "@/lib/channeltalk";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const feedbacks: Feedback[] = body.feedbacks;

  if (!feedbacks || !Array.isArray(feedbacks)) {
    return Response.json(
      { error: "feedbacks 배열이 필요합니다." },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY 환경변수가 필요합니다." },
      { status: 500 }
    );
  }

  try {
    const result = await analyzeFeedbacks(feedbacks);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
