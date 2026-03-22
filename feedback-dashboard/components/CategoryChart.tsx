"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Category } from "@/lib/claude";

interface CategoryChartProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelect: (name: string) => void;
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#ef4444", "#84cc16",
  "#f97316", "#6366f1",
];

export default function CategoryChart({
  categories,
  selectedCategory,
  onSelect,
}: CategoryChartProps) {
  const data = categories.map((c) => ({
    name: c.name,
    count: c.feedbackIds.length,
    summary: c.summary,
  }));

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <h2 className="text-base font-semibold text-gray-800 mb-4">
        카테고리별 피드백 수
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [`${value}건`, "피드백 수"]}
            labelFormatter={(label) => {
              const name = String(label);
              const cat = categories.find((c) => c.name === name);
              return cat ? `${name} — ${cat.summary}` : name;
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => d.name && onSelect(d.name)}>
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={COLORS[index % COLORS.length]}
                opacity={selectedCategory && selectedCategory !== entry.name ? 0.4 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 카테고리 요약 칩 */}
      <div className="flex flex-wrap gap-2 mt-4">
        {categories.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => onSelect(cat.name)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              selectedCategory === cat.name
                ? "border-transparent text-white shadow"
                : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
            }`}
            style={
              selectedCategory === cat.name
                ? { backgroundColor: COLORS[i % COLORS.length] }
                : {}
            }
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {cat.name}
            <span className="font-bold">{cat.feedbackIds.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
