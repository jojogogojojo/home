import { NextRequest, NextResponse } from "next/server";
import { getSpace } from "@/lib/channeltalk";

export async function POST(req: NextRequest) {
  try {
    const { accessKey, accessSecret } = await req.json();

    if (!accessKey || !accessSecret) {
      return NextResponse.json(
        { error: "accessKey와 accessSecret을 모두 입력해주세요." },
        { status: 400 }
      );
    }

    const space = await getSpace(accessKey, accessSecret);
    return NextResponse.json(space);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
