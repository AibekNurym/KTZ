"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { Header } from "@/components/header";
import { SubsystemCard } from "@/components/subsystem-card";
import { TopFactors } from "@/components/top-factors";
import { AlertsFeed } from "@/components/alerts-feed";
import { AlertTriangle, TrendingDown, Activity } from "lucide-react";
import { useLocale, PARAM_KEY_MAP } from "@/lib/i18n";

const SUBSYSTEM_PARAMS: Record<string, string[]> = {
  Traction: ["traction_motor_current_a", "traction_motor_temp_c", "dc_bus_voltage_v", "wheel_slip_pct"],
  Electrical: ["catenary_voltage_kv", "onboard_voltage_v", "battery_voltage_v", "pantograph_current_a"],
  Braking: ["brake_main_pressure_bar", "brake_reservoir_pressure_bar", "brake_cylinder_pressure_bar", "regen_braking_power_kw"],
  Cooling: ["coolant_temp_c", "oil_temp_c"],
  Speed: ["speed_kmh", "ambient_temp_c"],
  Diesel: ["coolant_temp_c", "oil_temp_c", "oil_pressure_kpa", "engine_rpm", "exhaust_temp_c", "fuel_level_pct", "fuel_consumption_g_kwh"],
  Auxiliary: ["dc_bus_voltage_v", "oil_pressure_idle_kpa"],
};

function getSubsystemParams(subsystemName: string, allParams: Record<string, number>) {
  const keys = SUBSYSTEM_PARAMS[subsystemName] || [];
  const result: Record<string, number> = {};
  for (const k of keys) {
    if (k in allParams) result[k] = allParams[k];
  }
  return result;
}

function getScoreColor(score: number) {
  if (score >= 70) return "#14b8a6";
  if (score >= 40) return "#eab308";
  return "#ef4444";
}

function getScoreLabel(score: number, t: (key: string) => string) {
  if (score >= 90) return t("excellent");
  if (score >= 70) return t("good");
  if (score >= 40) return t("warning");
  return t("critical");
}

function HeroGauge({ score, status }: { score: number; status: string }) {
  const { t } = useLocale();
  const color = getScoreColor(score);
  const label = getScoreLabel(score, t);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const sweepAngle = 270;
  const sweepLength = (sweepAngle / 360) * circumference;
  const filledLength = (score / 100) * sweepLength;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-[135deg]">
          <circle
            cx="74" cy="74" r={radius}
            fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${sweepLength} ${circumference}`}
            className="text-zinc-200 dark:text-zinc-800"
          />
          <circle
            cx="74" cy="74" r={radius}
            fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${filledLength} ${circumference}`}
            className="transition-all duration-700 ease-out animate-gauge-fill"
            style={{ filter: `drop-shadow(0 0 6px ${color}50)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums font-mono" style={{ color }}>
            {score.toFixed(1)}
          </span>
          <span className="text-sm text-zinc-400 mt-0.5">{label}</span>
        </div>
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t("health_index")}</h2>
        <p className="text-base text-zinc-500 mt-0.5">{t("realtime_condition")}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const { healthIndex, parameters, recentAlerts, locoId, connectionStatus } = useTelemetryStore();
  const isStale = connectionStatus === "disconnected" || connectionStatus === "reconnecting";

  useEffect(() => { loadFromStorage(); }, [loadFromStorage]);
  useEffect(() => { if (!isLoading && !token) router.replace("/login"); }, [isLoading, token, router]);
  useWebSocket();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-zinc-400 text-base">{t("loading")}</div>
      </div>
    );
  }
  if (!token) return null;

  const subsystemScores = healthIndex.subsystem_scores;
  const subsystemNames = Object.keys(subsystemScores);
  const recommendations = healthIndex.top_factors
    .filter((f) => f.norm < 1.0)
    .slice(0, 3);

  return (
    <div className="flex flex-col h-screen bg-stone-100/60 dark:bg-zinc-950 overflow-hidden">
      <Header />

      <main className="flex-1 p-4 lg:px-6 lg:py-4 relative overflow-y-auto overflow-x-hidden">
        {isStale && (
          <div className="absolute inset-0 z-40 flex items-start justify-center pt-4 pointer-events-none">
            <div className="pointer-events-auto bg-red-500 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 animate-fade-in-up">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="text-base font-medium">{t("connection_lost")}</span>
            </div>
          </div>
        )}

        <div className={`grid grid-rows-[1fr_auto_1fr_auto] h-full gap-3 max-w-[1800px] mx-auto transition-opacity duration-500 ${isStale ? "opacity-40" : "opacity-100"}`}>
          {/* ═══ TOP ROW: Gauge + Factors + Alerts ═══ */}
          <div className="grid grid-cols-12 gap-4 min-h-0">
            {/* Gauge */}
            <div className="col-span-12 lg:col-span-4 bg-stone-50 dark:bg-zinc-900/50 rounded-2xl border border-stone-200/80 dark:border-zinc-800 p-4 flex items-center">
              <HeroGauge score={healthIndex.score} status={healthIndex.status} />
            </div>

            {/* Top Factors */}
            <div className="col-span-12 lg:col-span-4 bg-stone-50 dark:bg-zinc-900/50 rounded-2xl border border-stone-200/80 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-zinc-400" />
                <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">{t("degradation_factors")}</h3>
              </div>
              <TopFactors />
            </div>

            {/* Alerts */}
            <div className="col-span-12 lg:col-span-4 bg-stone-50 dark:bg-zinc-900/50 rounded-2xl border border-stone-200/80 dark:border-zinc-800 p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">{t("recent_alerts")}</h3>
                </div>
                {recentAlerts.length > 0 && (
                  <span className="text-base font-medium text-zinc-500 bg-stone-200/60 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                    {recentAlerts.length}
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <AlertsFeed />
              </div>
            </div>
          </div>

          {/* ═══ SUBSYSTEM HEADER ═══ */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-400" />
            <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">{t("subsystems")}</h3>
            <span className="text-base text-zinc-400 ml-1">{locoId}</span>
          </div>

          {/* ═══ BOTTOM: Subsystem Cards ═══ */}
          <div className="grid grid-cols-5 gap-3 min-h-0">
            {subsystemNames.map((name) => (
              <SubsystemCard
                key={name}
                name={name}
                score={subsystemScores[name]}
                parameters={getSubsystemParams(name, parameters)}
              />
            ))}
          </div>

          {recommendations.length > 0 && (
            <div className="bg-amber-50/60 dark:bg-yellow-500/5 border border-amber-200/80 dark:border-yellow-500/20 rounded-xl px-4 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {recommendations.map((r, i) => {
                    const paramName = PARAM_KEY_MAP[r.parameter] ? t(PARAM_KEY_MAP[r.parameter]) : r.parameter.replace(/_/g, " ");
                    const actionText = r.value === null
                      ? t("action_check_sensor")
                      : r.norm === 0
                        ? t("action_critical", { param: paramName, value: r.value.toFixed(1) })
                        : r.norm < 0.5
                          ? t("action_warning", { param: paramName, value: r.value.toFixed(1) })
                          : t("action_monitor", { param: paramName });
                    return <p key={i} className="text-base text-amber-800 dark:text-yellow-300/80">{actionText}</p>;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
