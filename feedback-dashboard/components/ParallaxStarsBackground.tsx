"use client";

import React, { useMemo } from "react";

const generateBoxShadows = (n: number) => {
  let value = `${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #FFF`;
  for (let i = 2; i <= n; i++) {
    value += `, ${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #FFF`;
  }
  return value;
};

export function ParallaxStarsBackground() {
  const shadowsSmall = useMemo(() => generateBoxShadows(700), []);
  const shadowsMedium = useMemo(() => generateBoxShadows(200), []);
  const shadowsBig = useMemo(() => generateBoxShadows(100), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#090A0F] -z-10">
      <style>{`
        .stars-bg {
          background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%);
        }
        @keyframes animStar {
          from { transform: translateY(0px); }
          to { transform: translateY(-2000px); }
        }
      `}</style>

      <div className="absolute inset-0 stars-bg" />

      {/* 작은 별 */}
      <div
        className="absolute left-0 top-0 w-[1px] h-[1px] bg-transparent"
        style={{ boxShadow: shadowsSmall, animation: `animStar 50s linear infinite` }}
      >
        <div className="absolute top-[2000px] w-[1px] h-[1px] bg-transparent" style={{ boxShadow: shadowsSmall }} />
      </div>

      {/* 중간 별 */}
      <div
        className="absolute left-0 top-0 w-[2px] h-[2px] bg-transparent"
        style={{ boxShadow: shadowsMedium, animation: `animStar 100s linear infinite` }}
      >
        <div className="absolute top-[2000px] w-[2px] h-[2px] bg-transparent" style={{ boxShadow: shadowsMedium }} />
      </div>

      {/* 큰 별 */}
      <div
        className="absolute left-0 top-0 w-[3px] h-[3px] bg-transparent"
        style={{ boxShadow: shadowsBig, animation: `animStar 150s linear infinite` }}
      >
        <div className="absolute top-[2000px] w-[3px] h-[3px] bg-transparent" style={{ boxShadow: shadowsBig }} />
      </div>
    </div>
  );
}
