"use client";

import { useState } from "react";

interface DateRangePickerProps {
  onSearch: (start: string, end: string) => void;
  loading: boolean;
}

export default function DateRangePicker({ onSearch, loading }: DateRangePickerProps) {
  const today = new Date().toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);

  return (
    <div className="flex flex-wrap items-end gap-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">시작일</label>
        <input
          type="date"
          value={start}
          max={end}
          onChange={(e) => setStart(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">종료일</label>
        <input
          type="date"
          value={end}
          min={start}
          max={today}
          onChange={(e) => setEnd(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={() => onSearch(start, end)}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
      >
        {loading ? "분석 중..." : "피드백 분석"}
      </button>
    </div>
  );
}
