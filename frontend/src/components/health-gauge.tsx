"use client";

import { useMemo } from "react";
import { useLocale } from "@/lib/i18n";

interface HealthGaugeProps {
  score: number;
  status: string;
}

function getColor(score: number): { stroke: string; text: string; glow: string; bg: string } {
  if (score >= 70) return { stroke: "#14b8a6", text: "text-teal-600 dark:text-teal-400", glow: "rgba(20,184,166,0.15)", bg: "bg-teal-500/10" };
  if (score >= 40) return { stroke: "#eab308", text: "text-yellow-600 dark:text-yellow-400", glow: "rgba(234,179,8,0.15)", bg: "bg-yellow-500/10" };
  return { stroke: "#ef4444", text: "text-red-600 dark:text-red-400", glow: "rgba(239,68,68,0.15)", bg: "bg-red-500/10" };
}

export function HealthGauge({ score, status }: HealthGaugeProps) {
  const { t } = useLocale();
  const colors = useMemo(() => getColor(score), [score]);

  const radius = 105;
  const circumference = 2 * Math.PI * radius;
  const sweepAngle = 270;
  const sweepLength = (sweepAngle / 360) * circumference;
  const filledLength = (score / 100) * sweepLength;
  const dashOffset = sweepLength - filledLength;

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Ambient glow behind gauge */}
      <div
        className="absolute w-64 h-64 rounded-full blur-[60px] opacity-60"
        style={{ backgroundColor: colors.glow }}
      />

      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        className="relative -rotate-[135deg]"
      >
        {/* Track */}
        <circle
          cx="140"
          cy="140"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${sweepLength} ${circumference}`}
          className="text-zinc-200 dark:text-zinc-800"
        />
        {/* Filled arc */}
        <circle
          cx="140"
          cy="140"
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          strokeDashoffset="0"
          className="transition-all duration-700 ease-out animate-gauge-fill"
          style={{
            filter: `drop-shadow(0 0 8px ${colors.stroke}40)`,
          }}
        />
        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const angle = (pct * sweepAngle * Math.PI) / 180;
          const outerR = radius + 18;
          const innerR = radius + 12;
          const x1 = 140 + outerR * Math.cos(angle);
          const y1 = 140 + outerR * Math.sin(angle);
          const x2 = 140 + innerR * Math.cos(angle);
          const y2 = 140 + innerR * Math.sin(angle);
          return (
            <line
              key={pct}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-zinc-400 dark:text-zinc-600"
            />
          );
        })}
      </svg>

      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-5xl font-bold tabular-nums tracking-tighter font-mono ${colors.text}`}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-sm uppercase tracking-[0.2em] text-zinc-500 mt-1">
          {t("health_index")}
        </span>
        <span
          className={`mt-2 text-sm font-semibold uppercase tracking-wider px-3 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
