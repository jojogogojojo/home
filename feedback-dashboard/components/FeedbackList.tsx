"use client";

import { useState } from "react";
import type { Feedback } from "@/lib/channeltalk";
import type { Category, FeedbackGroup } from "@/lib/claude";

interface FeedbackListProps {
  feedbacks: Feedback[];
  categories: Category[];
  selectedCategory: string | null;
  onClearFilter: () => void;
}

function GroupCard({ group, feedbacks }: { group: FeedbackGroup; feedbacks: Feedback[] }) {
  const [open, setOpen] = useState(false);
  const groupFeedbacks = feedbacks.filter((f) => group.feedbackIds.includes(f.id));

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
            {group.count}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{group.title}</p>
            <p className="text-xs text-gray-500 truncate">{group.summary}</p>
          </div>
        </div>
        <span className="text-gray-400 shrink-0 ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {groupFeedbacks.map((fb) => (
            <div key={fb.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-gray-800 leading-snug">{fb.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(fb.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                  {fb.threadUrl && (
                    <a
                      href={fb.threadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700"
                      title="스레드 보기"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              {fb.userVoice && (
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap mb-1">
                  {fb.userVoice}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {fb.channelName && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{fb.channelName}</span>
                )}
                {fb.servicePlan && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">{fb.servicePlan}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FeedbackList({
  feedbacks,
  categories,
  selectedCategory,
  onClearFilter,
}: FeedbackListProps) {
  const visibleCategories = selectedCategory
    ? categories.filter((c) => c.name === selectedCategory)
    : categories;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">
          {selectedCategory ? `"${selectedCategory}" 피드백 그룹` : "전체 피드백 그룹"}
        </h2>
        {selectedCategory && (
          <button
            onClick={onClearFilter}
            className="text-xs text-blue-500 hover:text-blue-700 underline"
          >
            전체 보기
          </button>
        )}
      </div>

      <div className="space-y-6">
        {visibleCategories.map((cat) => (
          <div key={cat.name}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {cat.name} ({cat.totalCount}건)
            </p>
            <div className="space-y-2">
              {cat.groups.map((group) => (
                <GroupCard key={group.title} group={group} feedbacks={feedbacks} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
