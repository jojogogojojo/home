"use client";

import { useState } from "react";
import { SyncResult } from "@/types";

interface SpaceInfo {
  id: string;
  name: string;
}

export default function Home() {
  // 폼 상태
  const [notionUrl, setNotionUrl] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [includeSubPages, setIncludeSubPages] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [accessSecret, setAccessSecret] = useState("");

  // 스페이스 검증 상태
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null);
  const [spaceError, setSpaceError] = useState("");
  const [spaceLoading, setSpaceLoading] = useState(false);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [syncError, setSyncError] = useState("");

  async function verifySpace() {
    setSpaceLoading(true);
    setSpaceInfo(null);
    setSpaceError("");

    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey, accessSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpaceInfo(data);
    } catch (err) {
      setSpaceError(err instanceof Error ? err.message : "스페이스 확인 실패");
    } finally {
      setSpaceLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setResults(null);
    setSyncError("");

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionUrl,
          notionToken,
          includeSubPages,
          channeltalkAccessKey: accessKey,
          channeltalkAccessSecret: accessSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  const canSync =
    notionUrl && notionToken && accessKey && accessSecret && spaceInfo && !syncing;

  return (
    <main className="max-w-2xl mx-auto py-12 px-4">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Notion → Channel Talk 아티클
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Notion 페이지를 Channel Talk 도큐먼트 스페이스에 아티클로 내보냅니다
        </p>
      </div>

      <div className="space-y-6">
        {/* Notion 설정 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Notion</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              페이지 URL
            </label>
            <input
              type="url"
              value={notionUrl}
              onChange={(e) => setNotionUrl(e.target.value)}
              placeholder="https://www.notion.so/workspace/Title-abc123..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Integration Token
            </label>
            <input
              type="password"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
              placeholder="secret_xxxxxxxxxxxx"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              notion.so/my-integrations에서 발급 후 대상 페이지에 연결 필요
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSubPages}
              onChange={(e) => setIncludeSubPages(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              하위 페이지도 함께 가져오기
              <span className="ml-1 text-gray-400">(각 페이지당 아티클 1개 생성)</span>
            </span>
          </label>
        </section>

        {/* Channel Talk 설정 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Channel Talk</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Key
              </label>
              <input
                type="password"
                value={accessKey}
                onChange={(e) => {
                  setAccessKey(e.target.value);
                  setSpaceInfo(null);
                }}
                placeholder="Access Key"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Secret
              </label>
              <input
                type="password"
                value={accessSecret}
                onChange={(e) => {
                  setAccessSecret(e.target.value);
                  setSpaceInfo(null);
                }}
                placeholder="Access Secret"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Channel Desk &gt; 설정 &gt; API Key 관리에서 발급 (스페이스별)
          </p>

          {/* 스페이스 확인 */}
          <div className="flex items-center gap-3">
            <button
              onClick={verifySpace}
              disabled={!accessKey || !accessSecret || spaceLoading}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {spaceLoading ? "확인 중..." : "스페이스 확인"}
            </button>

            {spaceInfo && (
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                {spaceInfo.name}
              </span>
            )}
            {spaceError && (
              <span className="text-sm text-red-600">{spaceError}</span>
            )}
          </div>
        </section>

        {/* 실행 버튼 */}
        <button
          onClick={handleSync}
          disabled={!canSync}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {syncing ? "아티클 생성 중..." : "아티클 생성 시작"}
        </button>

        {/* 에러 */}
        {syncError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {syncError}
          </div>
        )}

        {/* 결과 */}
        {results && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">결과</h2>
              <span className="text-xs text-gray-500">
                {results.filter((r) => r.status === "success").length} /{" "}
                {results.length} 성공
              </span>
            </div>
            <ul className="divide-y divide-gray-100">
              {results.map((r, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-lg ${
                      r.status === "success" ? "text-green-500" : "text-red-400"
                    }`}
                  >
                    {r.status === "success" ? "✓" : "✗"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {r.pageTitle}
                    </p>
                    {r.status === "success" && r.articleUrl && (
                      <a
                        href={r.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block"
                      >
                        {r.articleUrl}
                      </a>
                    )}
                    {r.status === "error" && (
                      <p className="text-xs text-red-500">{r.error}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
