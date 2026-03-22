"use client";

import { Feedback } from "@/lib/channeltalk";
import { Category } from "@/lib/claude";

interface FeedbackListProps {
  feedbacks: Feedback[];
  categories: Category[];
  selectedCategory: string | null;
  onClearFilter: () => void;
}

export default function FeedbackList({
  feedbacks,
  categories,
  selectedCategory,
  onClearFilter,
}: FeedbackListProps) {
  const filtered = selectedCategory
    ? (() => {
        const cat = categories.find((c) => c.name === selectedCategory);
        if (!cat) return feedbacks;
        const idSet = new Set(cat.feedbackIds);
        return feedbacks.filter((f) => idSet.has(f.id));
      })()
    : feedbacks;

  const selectedCat = categories.find((c) => c.name === selectedCategory);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            {selectedCategory ? `"${selectedCategory}" 피드백` : "전체 피드백"}
          </h2>
          {selectedCat && (
            <p className="text-xs text-gray-500 mt-0.5">{selectedCat.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{filtered.length}건</span>
          {selectedCategory && (
            <button
              onClick={onClearFilter}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              전체 보기
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">피드백이 없습니다.</p>
        ) : (
          filtered.map((fb) => (
            <div
              key={fb.id}
              className="border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-medium text-gray-800 leading-snug">
                  {fb.title}
                </h3>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(fb.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {fb.userVoice && (
                <p className="text-xs text-gray-600 leading-relaxed mb-2 whitespace-pre-wrap">
                  {fb.userVoice}
                </p>
              )}

              {fb.managerComment && fb.managerComment !== "/" && (
                <div className="bg-blue-50 rounded px-3 py-2 mb-2">
                  <p className="text-xs text-blue-700 leading-relaxed">
                    <span className="font-medium">Manager: </span>
                    {fb.managerComment}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-2">
                {fb.channelName && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {fb.channelName}
                  </span>
                )}
                {fb.servicePlan && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">
                    {fb.servicePlan}
                  </span>
                )}
                {fb.author && (
                  <span className="text-xs text-gray-400">by @{fb.author}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
