import type { NextRequest } from "next/server";
import { fetchFeedbacks } from "@/lib/channeltalk";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey, apiSecret, groupId, start, end } = body;

  if (!apiKey || !groupId || !start || !end) {
    return Response.json(
      { error: "apiKey, groupId, start, end 필드가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const feedbacks = await fetchFeedbacks(groupId, apiKey, apiSecret || "", start, end);
    return Response.json({ feedbacks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
