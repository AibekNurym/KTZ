"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { useLocale } from "@/lib/i18n";

// Dynamic import for ECharts (SSR-incompatible)
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface ChartData {
  ts: string[];
  values: number[];
}

const DEFAULT_METRICS = [
  { key: "speed_kmh", labelKey: "metric_speed", color: "#14b8a6" },
  { key: "traction_motor_temp_c", labelKey: "metric_motor_temp", color: "#ef4444" },
  { key: "brake_main_pressure_bar", labelKey: "metric_brake_press", color: "#3b82f6" },
  { key: "coolant_temp_c", labelKey: "metric_coolant_temp", color: "#f59e0b" },
];

const TIME_PRESETS = [
  { label: "5m", minutes: 5 },
  { label: "10m", minutes: 10 },
  { label: "15m", minutes: 15 },
];

function buildChartOption(label: string, data: ChartData, color: string, isDark: boolean) {
  return {
    animation: false,
    grid: { top: 30, right: 16, bottom: 24, left: 50 },
    title: {
      text: label,
      textStyle: {
        fontSize: 17,
        fontWeight: 500,
        fontFamily: "monospace",
        color: isDark ? "#a1a1aa" : "#71717a",
      },
      left: 8,
      top: 4,
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: isDark ? "#18181b" : "#fff",
      borderColor: isDark ? "#3f3f46" : "#e4e4e7",
      textStyle: { fontSize: 17, color: isDark ? "#e4e4e7" : "#27272a" },
    },
    xAxis: {
      type: "category" as const,
      data: data.ts.map((t) => {
        try {
          return new Date(t).toLocaleTimeString("en-GB", { hour12: false });
        } catch {
          return t;
        }
      }),
      axisLabel: { fontSize: 15, color: isDark ? "#71717a" : "#a1a1aa" },
      axisLine: { lineStyle: { color: isDark ? "#3f3f46" : "#e4e4e7" } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: { fontSize: 15, color: isDark ? "#71717a" : "#a1a1aa" },
      splitLine: { lineStyle: { color: isDark ? "#27272a" : "#f4f4f5" } },
    },
    series: [
      {
        type: "line",
        data: data.values,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color },
        areaStyle: { color: `${color}15` },
      },
    ],
  };
}

export default function TrendsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const locoId = useTelemetryStore((s) => s.locoId);
  const parameters = useTelemetryStore((s) => s.parameters);
  const connectionStatus = useTelemetryStore((s) => s.connectionStatus);
  useWebSocket();

  const [timeRange, setTimeRange] = useState(5);
  const [isLive, setIsLive] = useState(true);
  const [chartData, setChartData] = useState<Record<string, ChartData>>({});
  const [isDark, setIsDark] = useState(true);
  const liveBuffer = useRef<Record<string, { ts: string[]; values: number[] }>>({});

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Fetch historical data
  const fetchHistory = useCallback(async () => {
    if (!token) return;
    const now = new Date();
    const from = new Date(now.getTime() - timeRange * 60 * 1000);
    const newData: Record<string, ChartData> = {};

    await Promise.all(
      DEFAULT_METRICS.map(async (metric) => {
        try {
          const res = await apiFetch<{
            data: { ts: string; value_smooth: number }[];
          }>(
            `/api/v1/telemetry/${locoId}/history?parameter=${metric.key}&from=${from.toISOString()}&to=${now.toISOString()}&limit=2000`,
          );
          newData[metric.key] = {
            ts: res.data.map((d) => d.ts),
            values: res.data.map((d) => d.value_smooth),
          };
        } catch {
          newData[metric.key] = { ts: [], values: [] };
        }
      }),
    );

    setChartData(newData);
    // Init live buffer from historical data
    liveBuffer.current = {};
    for (const [key, d] of Object.entries(newData)) {
      liveBuffer.current[key] = { ts: [...d.ts], values: [...d.values] };
    }
  }, [token, locoId, timeRange]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Append live data from WS
  useEffect(() => {
    if (!isLive || connectionStatus !== "connected") return;
    const maxPoints = timeRange * 60;

    for (const metric of DEFAULT_METRICS) {
      const val = parameters[metric.key];
      if (val === undefined) continue;

      if (!liveBuffer.current[metric.key]) {
        liveBuffer.current[metric.key] = { ts: [], values: [] };
      }
      const buf = liveBuffer.current[metric.key];
      buf.ts.push(new Date().toISOString());
      buf.values.push(val);
      // Trim to window
      while (buf.ts.length > maxPoints) {
        buf.ts.shift();
        buf.values.shift();
      }
    }

    // Update chart data from buffer
    const newData: Record<string, ChartData> = {};
    for (const metric of DEFAULT_METRICS) {
      const buf = liveBuffer.current[metric.key];
      if (buf) {
        newData[metric.key] = { ts: [...buf.ts], values: [...buf.values] };
      }
    }
    setChartData(newData);
  }, [parameters, isLive, connectionStatus, timeRange]);

  if (isLoading || !token) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-100/60 dark:bg-zinc-950">
      <Header />
      <main className="flex-1 p-4 lg:p-6 max-w-[1600px] mx-auto w-full">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t("trends_title")}</h1>
          <div className="flex items-center gap-2">
            {TIME_PRESETS.map((preset) => (
              <Button
                key={preset.minutes}
                variant={timeRange === preset.minutes ? "default" : "outline"}
                size="sm"
                className="h-7 text-sm font-mono"
                onClick={() => {
                  setTimeRange(preset.minutes);
                  setIsLive(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
            <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />
            <Button
              variant={isLive ? "default" : "outline"}
              size="sm"
              className={`h-7 text-sm gap-1 ${isLive ? "bg-teal-600 hover:bg-teal-500" : ""}`}
              onClick={() => {
                setIsLive(!isLive);
                if (!isLive) fetchHistory();
              }}
            >
              {isLive ? (
                <>
                  <Pause className="w-3 h-3" /> {t("live_btn")}
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" /> {t("paused_btn")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DEFAULT_METRICS.map((metric) => {
            const data = chartData[metric.key] || { ts: [], values: [] };
            return (
              <Card
                key={metric.key}
                className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40 overflow-hidden"
              >
                <CardContent className="p-2">
                  {data.ts.length > 0 ? (
                    <ReactECharts
                      option={buildChartOption(t(metric.labelKey), data, metric.color, isDark)}
                      style={{ height: 220 }}
                      notMerge
                    />
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-base text-zinc-500 font-mono">
                      {t("waiting_data")}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
