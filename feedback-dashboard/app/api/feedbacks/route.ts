import type { NextRequest } from "next/server";
import { fetchFeedbacks } from "@/lib/channeltalk";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return Response.json(
      { error: "start, end 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const apiKey = process.env.CHANNELTALK_API_KEY;
  const apiSecret = process.env.CHANNELTALK_API_SECRET || "";
  const groupId = process.env.CHANNELTALK_GROUP_ID;

  if (!apiKey || !groupId) {
    return Response.json(
      { error: "CHANNELTALK_API_KEY, CHANNELTALK_GROUP_ID 환경변수가 필요합니다." },
      { status: 500 }
    );
  }

  try {
    const feedbacks = await fetchFeedbacks(groupId, apiKey, apiSecret, start, end);
    return Response.json({ feedbacks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
