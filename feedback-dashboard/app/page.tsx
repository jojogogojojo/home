"use client";

import { useState } from "react";
import DateRangePicker from "@/components/DateRangePicker";
import CategoryChart from "@/components/CategoryChart";
import FeedbackList from "@/components/FeedbackList";
import { ParallaxStarsBackground } from "@/components/ParallaxStarsBackground";
import type { Feedback } from "@/lib/channeltalk";
import type { Category } from "@/lib/claude";

type Step = "idle" | "fetching" | "analyzing" | "done" | "error";

export default function Home() {
  const [channeltalkApiKey, setChanneltalkApiKey] = useState("");
  const [channeltalkApiSecret, setChanneltalkApiSecret] = useState("");
  const [channeltalkGroupId, setChanneltalkGroupId] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  async function handleSearch(start: string, end: string) {
    if (!channeltalkApiKey || !channeltalkGroupId || !anthropicApiKey) {
      setError("채널톡 API Key, Group ID, Anthropic API Key를 모두 입력해주세요.");
      setStep("error");
      return;
    }

    setError(null);
    setFeedbacks([]);
    setCategories([]);
    setSelectedCategory(null);
    setStep("fetching");

    try {
      // 1. 채널톡에서 피드백 가져오기
      const fbRes = await fetch("/api/feedbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: channeltalkApiKey,
          apiSecret: channeltalkApiSecret,
          groupId: channeltalkGroupId,
          start,
          end,
        }),
      });
      const fbData = await fbRes.json();
      if (!fbRes.ok) throw new Error(fbData.error);

      const fetchedFeedbacks: Feedback[] = fbData.feedbacks;
      setFeedbacks(fetchedFeedbacks);

      if (fetchedFeedbacks.length === 0) {
        setStep("done");
        return;
      }

      // 2. Claude로 분류
      setStep("analyzing");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbacks: fetchedFeedbacks,
          anthropicApiKey,
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error);

      setCategories(analyzeData.categories);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setStep("error");
    }
  }

  function handleCategorySelect(name: string) {
    setSelectedCategory((prev) => (prev === name ? null : name));
  }

  const totalGroups = categories.reduce((sum, c) => sum + c.groups.length, 0);
  const topCategory = categories.length > 0
    ? categories.reduce((a, b) => a.totalCount >= b.totalCount ? a : b).name
    : "-";

  return (
    <main className="min-h-screen">
      <ParallaxStarsBackground />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">채널톡 피드백 분석</h1>
          <p className="text-sm text-gray-500 mt-1">
            FeedbackBot 메시지를 기간별로 수집하고 AI로 자동 분류합니다.
          </p>
        </div>

        {/* Step 1: API 키 입력 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Step 1 — API 키 설정</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">채널톡 Access Key *</label>
              <input
                type="password"
                value={channeltalkApiKey}
                onChange={(e) => setChanneltalkApiKey(e.target.value)}
                placeholder="x-access-key"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">채널톡 Access Secret</label>
              <input
                type="password"
                value={channeltalkApiSecret}
                onChange={(e) => setChanneltalkApiSecret(e.target.value)}
                placeholder="x-access-secret (선택)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">채널톡 Group ID *</label>
              <input
                type="text"
                value={channeltalkGroupId}
                onChange={(e) => setChanneltalkGroupId(e.target.value)}
                placeholder="팀챗 그룹 ID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Anthropic API Key *</label>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
        </div>

        {/* Step 2: 기간 선택 */}
        <div className="mb-6">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Step 2 — 기간 선택</h2>
            <DateRangePicker
              onSearch={handleSearch}
              loading={step === "fetching" || step === "analyzing"}
            />
          </div>
        </div>

        {/* 진행 상태 */}
        {(step === "fetching" || step === "analyzing") && (
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {step === "fetching"
              ? "채널톡에서 피드백 수집 중..."
              : "Claude AI로 분류 중..."}
          </div>
        )}

        {/* 오류 */}
        {step === "error" && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* 결과 없음 */}
        {step === "done" && feedbacks.length === 0 && (
          <div className="text-center text-gray-400 py-16 text-sm">
            선택한 기간에 피드백이 없습니다.
          </div>
        )}

        {/* 결과 */}
        {step === "done" && feedbacks.length > 0 && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">총 피드백</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{feedbacks.length}건</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">그룹 수</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalGroups}개</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">가장 많은 카테고리</p>
                <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{topCategory}</p>
              </div>
            </div>

            {/* 차트 */}
            {categories.length > 0 && (
              <div className="mb-6">
                <CategoryChart
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelect={handleCategorySelect}
                />
              </div>
            )}

            {/* 피드백 목록 */}
            <FeedbackList
              feedbacks={feedbacks}
              categories={categories}
              selectedCategory={selectedCategory}
              onClearFilter={() => setSelectedCategory(null)}
            />
          </>
        )}
      </div>
    </main>
  );
}
