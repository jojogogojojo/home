"use client";

import { useState } from "react";
import { SyncResult } from "@/types";

interface SpaceInfo {
  id: string;
  name: string;
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 18,
  marginBottom: 10,
};

const cardTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#999",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  marginBottom: 14,
};

const fieldName: React.CSSProperties = {
  fontSize: 12,
  color: "#555",
  fontWeight: 500,
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#fafafa",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  color: "#111",
  fontFamily: "inherit",
  fontSize: 13,
  padding: "9px 12px",
  outline: "none",
  boxSizing: "border-box",
};

export default function Home() {
  const [notionToken, setNotionToken] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [includeSubPages, setIncludeSubPages] = useState(false);
  const [translateEn, setTranslateEn] = useState(false);
  const [translateJp, setTranslateJp] = useState(false);

  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null);
  const [spaceError, setSpaceError] = useState("");
  const [spaceLoading, setSpaceLoading] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [syncError, setSyncError] = useState("");

  async function tryLoadSpace() {
    if (!accessKey || !accessSecret) return;
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
    <main
      style={{
        background: "#f5f5f5",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        color: "#111",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Notion → Channel Talk
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24, lineHeight: 1.6 }}>
          Notion 페이지 링크를 넣으면 Channel Talk 도큐먼트 스페이스에
          <br />
          아티클로 자동 변환해 드립니다. 번역도 함께 생성할 수 있어요.
        </p>

        {/* Notion */}
        <div style={card}>
          <div style={cardTitle}>Notion</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div style={fieldName}>Integration Token</div>
              <input
                style={inputStyle}
                type="password"
                placeholder="secret_xxxxxxxxxx"
                value={notionToken}
                onChange={(e) => setNotionToken(e.target.value)}
              />
            </label>
            <label>
              <div style={fieldName}>페이지 URL</div>
              <input
                style={inputStyle}
                type="url"
                placeholder="notion.so/your-page"
                value={notionUrl}
                onChange={(e) => setNotionUrl(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Channel Talk */}
        <div style={card}>
          <div style={cardTitle}>Channel Talk</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div style={fieldName}>Access Key</div>
              <input
                style={inputStyle}
                type="password"
                placeholder="key_xxxxxxxx"
                value={accessKey}
                onChange={(e) => {
                  setAccessKey(e.target.value);
                  setSpaceInfo(null);
                }}
                onBlur={tryLoadSpace}
              />
            </label>
            <label>
              <div style={fieldName}>Access Secret</div>
              <input
                style={inputStyle}
                type="password"
                placeholder="secret_xxxxxxxx"
                value={accessSecret}
                onChange={(e) => {
                  setAccessSecret(e.target.value);
                  setSpaceInfo(null);
                }}
                onBlur={tryLoadSpace}
              />
            </label>
          </div>
          {(spaceLoading || spaceInfo || spaceError) && (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {spaceLoading && <span style={{ color: "#888" }}>스페이스 확인 중...</span>}
              {spaceInfo && (
                <span
                  style={{
                    color: "#2a7a2a",
                    background: "#edfaed",
                    border: "1px solid #b6e8b6",
                    padding: "3px 10px",
                    borderRadius: 20,
                  }}
                >
                  ✓ {spaceInfo.name}
                </span>
              )}
              {spaceError && <span style={{ color: "#c0392b" }}>{spaceError}</span>}
            </div>
          )}
        </div>

        {/* 아티클 설정 */}
        <div style={card}>
          <div style={cardTitle}>아티클 설정</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <label>
              <div style={fieldName}>스페이스</div>
              <select style={{ ...inputStyle, appearance: "none" as const }}>
                {spaceInfo ? (
                  <option value={spaceInfo.id}>{spaceInfo.name}</option>
                ) : (
                  <option disabled>키 입력 후 로드</option>
                )}
              </select>
            </label>
            <label>
              <div style={fieldName}>작성자</div>
              <select style={{ ...inputStyle, appearance: "none" as const }}>
                <option>기본 작성자</option>
              </select>
            </label>
          </div>
          <div>
            <div style={{ ...fieldName, marginBottom: 8 }}>공개 여부</div>
            <div
              style={{
                display: "flex",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {(["public", "private"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    fontSize: 14,
                    fontWeight: visibility === v ? 700 : 500,
                    color: visibility === v ? "#111" : "#aaa",
                    background: visibility === v ? "#fff" : "#fafafa",
                    border: "none",
                    borderRight: v === "public" ? "1px solid #e0e0e0" : "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {v === "public" ? "🌐 공개" : "🔒 비공개"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 옵션 */}
        <div style={card}>
          <div style={cardTitle}>옵션</div>
          <div>
            {[
              {
                label: "하위 페이지 포함",
                desc: "연결된 모든 하위 페이지도 함께 아티클로 변환",
                checked: includeSubPages,
                onChange: setIncludeSubPages,
                badge: null,
              },
              {
                label: "영어 번역 생성",
                desc: "원본과 함께 영어(English) 아티클 자동 생성",
                checked: translateEn,
                onChange: setTranslateEn,
                badge: "Claude AI",
              },
              {
                label: "일본어 번역 생성",
                desc: "원본과 함께 일본어(日本語) 아티클 자동 생성",
                checked: translateJp,
                onChange: setTranslateJp,
                badge: "Claude AI",
              },
            ].map((item, i, arr) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid #f0f0f0" : "none",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                    {item.label}
                    {item.badge && (
                      <span
                        style={{
                          display: "inline-block",
                          background: "#f0f4ff",
                          border: "1px solid #d0daff",
                          color: "#5a7af0",
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          marginLeft: 6,
                          fontWeight: 600,
                          verticalAlign: "middle",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>{item.desc}</div>
                </div>
                <Toggle checked={item.checked} onChange={item.onChange} />
              </div>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <button
          onClick={handleSync}
          disabled={!canSync}
          style={{
            width: "100%",
            background: canSync ? "#111" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 700,
            padding: "14px",
            cursor: canSync ? "pointer" : "not-allowed",
            marginTop: 4,
          }}
        >
          {syncing ? "아티클 생성 중..." : "아티클 생성 시작"}
        </button>

        {/* 에러 */}
        {syncError && (
          <div
            style={{
              background: "#fff5f5",
              border: "1px solid #fcc",
              color: "#c0392b",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              marginTop: 10,
            }}
          >
            {syncError}
          </div>
        )}

        {/* 결과 */}
        {results && (
          <div style={{ ...card, marginTop: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={cardTitle}>결과</div>
              <span style={{ fontSize: 12, color: "#888" }}>
                {results.filter((r) => r.status === "success").length} / {results.length} 성공
              </span>
            </div>
            <div>
              {results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < results.length - 1 ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <span style={{ color: r.status === "success" ? "#2a7a2a" : "#c0392b", fontSize: 16 }}>
                    {r.status === "success" ? "✓" : "✗"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.pageTitle}
                    </div>
                    {r.status === "success" && r.articleUrl && (
                      <a
                        href={r.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#4a90e2", textDecoration: "none" }}
                      >
                        {r.articleUrl}
                      </a>
                    )}
                    {r.status === "error" && (
                      <div style={{ fontSize: 12, color: "#c0392b" }}>{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: checked ? "#4a90e2" : "#e5e5e5",
          borderRadius: 12,
          transition: "background 0.2s",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: checked ? 23 : 3,
          top: 3,
          width: 18,
          height: 18,
          background: "#fff",
          borderRadius: "50%",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}
