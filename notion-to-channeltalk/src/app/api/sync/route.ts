import { NextRequest, NextResponse } from "next/server";
import { fetchNotionPages } from "@/lib/notion";
import { createArticle } from "@/lib/channeltalk";
import { SyncRequest, SyncResult } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body: SyncRequest = await req.json();
    const {
      notionUrl,
      notionToken,
      includeSubPages,
      channeltalkAccessKey,
      channeltalkAccessSecret,
    } = body;

    if (!notionUrl || !notionToken || !channeltalkAccessKey || !channeltalkAccessSecret) {
      return NextResponse.json(
        { error: "필수 항목을 모두 입력해주세요." },
        { status: 400 }
      );
    }

    // 1. Notion 페이지 수집
    const pages = await fetchNotionPages(notionUrl, notionToken, includeSubPages);

    // 2. 각 페이지를 Channel Talk 아티클로 생성
    const results: SyncResult[] = [];

    for (const page of pages) {
      try {
        const article = await createArticle(
          channeltalkAccessKey,
          channeltalkAccessSecret,
          page.title,
          page.htmlContent
        );

        results.push({
          pageTitle: page.title,
          notionPageId: page.id,
          status: "success",
          articleId: article.id,
          articleUrl: article.webUrl ?? article.url,
        });
      } catch (err) {
        results.push({
          pageTitle: page.title,
          notionPageId: page.id,
          status: "error",
          error: err instanceof Error ? err.message : "아티클 생성 실패",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
