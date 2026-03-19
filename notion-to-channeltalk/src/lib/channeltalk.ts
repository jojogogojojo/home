/**
 * Channel Talk Documents Open API client
 * Base URL: https://document-api.channel.io
 * Auth: Basic base64(accessKey:accessSecret)
 * Docs: https://developers.channel.io/docs/documents-open-api-welcome
 */

const BASE_URL = "https://document-api.channel.io";

function makeAuthHeader(accessKey: string, accessSecret: string): string {
  const credentials = Buffer.from(`${accessKey}:${accessSecret}`).toString("base64");
  return `Basic ${credentials}`;
}

async function request<T>(
  method: string,
  path: string,
  accessKey: string,
  accessSecret: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: makeAuthHeader(accessKey, accessSecret),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Channel Talk API 오류 (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface ChannelTalkSpaceInfo {
  id: string;
  name: string;
  domain?: string;
}

/** 현재 API Key에 해당하는 스페이스 정보 조회 */
export async function getSpace(
  accessKey: string,
  accessSecret: string
): Promise<ChannelTalkSpaceInfo> {
  return request<ChannelTalkSpaceInfo>(
    "GET",
    "/open/v1/spaces/$me",
    accessKey,
    accessSecret
  );
}

export interface CreateArticleResponse {
  id: string;
  title: string;
  url?: string;
  webUrl?: string;
}

/**
 * 아티클 생성
 * Channel Talk Documents API의 아티클 생성 엔드포인트
 * 공식 docs: https://developers.channel.io/docs/references-rest-api
 */
export async function createArticle(
  accessKey: string,
  accessSecret: string,
  title: string,
  htmlBody: string
): Promise<CreateArticleResponse> {
  return request<CreateArticleResponse>(
    "POST",
    "/open/v1/articles",
    accessKey,
    accessSecret,
    {
      title,
      body: htmlBody,
      // status: "published" — 필요시 초안으로 만들려면 "draft"
      status: "published",
    }
  );
}
