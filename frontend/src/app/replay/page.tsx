"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/header";
import { HealthGauge } from "@/components/health-gauge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react";
import { useLocale } from "@/lib/i18n";

interface HiPoint {
  ts: string;
  score: number;
  status: string;
}

interface AlertItem {
  ts: string;
  parameter: string;
  severity: string;
  value: number;
  message: string;
}

const RANGE_OPTIONS = [
  { labelKey: "last_5min", minutes: 5 },
  { labelKey: "last_10min", minutes: 10 },
  { labelKey: "last_15min", minutes: 15 },
];

const SPEED_OPTIONS = [1, 2, 5];

export default function ReplayPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const locoId = useTelemetryStore((s) => s.locoId);

  const [rangeMin, setRangeMin] = useState(5);
  const [hiData, setHiData] = useState<HiPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);

  // Fetch historical data
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setPlaying(false);
    setCursorIdx(0);

    const now = new Date();
    const from = new Date(now.getTime() - rangeMin * 60 * 1000);

    try {
      const [hiRes, alertRes] = await Promise.all([
        apiFetch<{ data: HiPoint[] }>(
          `/api/v1/health-index/${locoId}/history?from=${from.toISOString()}&to=${now.toISOString()}&limit=5000`,
        ),
        apiFetch<{ data: AlertItem[] }>(
          `/api/v1/alerts/${locoId}?from=${from.toISOString()}&to=${now.toISOString()}&limit=500`,
        ),
      ]);
      setHiData(hiRes.data);
      setAlerts(alertRes.data);
    } catch {
      setHiData([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [token, locoId, rangeMin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Playback timer
  useEffect(() => {
    if (playing && hiData.length > 0) {
      intervalRef.current = setInterval(() => {
        setCursorIdx((prev) => {
          if (prev >= hiData.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, hiData.length]);

  const currentPoint = hiData[cursorIdx] || null;
  const currentTime = currentPoint
    ? new Date(currentPoint.ts).toLocaleTimeString("en-GB", { hour12: false })
    : "--:--:--";

  // Alerts up to current cursor time
  const visibleAlerts = currentPoint
    ? alerts.filter((a) => a.ts <= currentPoint.ts).slice(0, 10)
    : [];

  const progress = hiData.length > 1 ? cursorIdx / (hiData.length - 1) : 0;

  if (isLoading || !token) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-100/60 dark:bg-zinc-950">
      <Header />
      <main className="flex-1 p-4 lg:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        {/* Controls */}
        <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
          <CardContent className="p-4 space-y-3">
            {/* Range + Speed selectors */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {RANGE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.minutes}
                    variant={rangeMin === opt.minutes ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-sm"
                    onClick={() => setRangeMin(opt.minutes)}
                  >
                    {t(opt.labelKey)}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Playback controls */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setCursorIdx(0);
                    setPlaying(false);
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>

                <Button
                  variant={playing ? "default" : "outline"}
                  size="sm"
                  className={`h-8 px-3 text-sm gap-1 ${playing ? "bg-teal-600 hover:bg-teal-500" : ""}`}
                  onClick={() => setPlaying(!playing)}
                  disabled={hiData.length === 0}
                >
                  {playing ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {playing ? t("pause") : t("play")}
                </Button>

                <div className="flex items-center gap-1">
                  <SkipForward className="w-3 h-3 text-zinc-500" />
                  {SPEED_OPTIONS.map((s) => (
                    <Button
                      key={s}
                      variant={speed === s ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-8 text-sm font-mono p-0"
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Timeline scrubber */}
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, hiData.length - 1)}
                value={cursorIdx}
                onChange={(e) => {
                  setCursorIdx(Number(e.target.value));
                  setPlaying(false);
                }}
                className="w-full h-2 accent-teal-500 cursor-pointer"
                disabled={hiData.length === 0}
              />
              <div className="flex items-center justify-between text-base font-mono text-zinc-500">
                <span>
                  {hiData.length > 0
                    ? new Date(hiData[0].ts).toLocaleTimeString("en-GB", { hour12: false })
                    : "--:--:--"}
                </span>
                <span className="text-zinc-700 dark:text-zinc-400 text-sm font-bold">
                  {currentTime}
                </span>
                <span>
                  {hiData.length > 0
                    ? new Date(hiData[hiData.length - 1].ts).toLocaleTimeString("en-GB", { hour12: false })
                    : "--:--:--"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="py-20 text-center text-base text-zinc-500 font-mono">
            {t("loading_history")}
          </div>
        ) : hiData.length === 0 ? (
          <div className="py-20 text-center text-base text-zinc-500 font-mono">
            {t("no_data_range")}
          </div>
        ) : (
          /* Replay Dashboard */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: HI Gauge + mini chart */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
                <CardContent className="flex flex-col items-center py-8">
                  <HealthGauge
                    score={currentPoint?.score ?? 0}
                    status={currentPoint?.status ?? "Unknown"}
                  />
                  <div className="mt-4 text-base font-mono text-zinc-500">
                    {t("replay_label")} {currentTime} | {t("replay_frame", { current: cursorIdx + 1, total: hiData.length })}
                  </div>
                </CardContent>
              </Card>

              {/* Mini HI timeline visualization */}
              <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
                <CardContent className="p-4">
                  <div className="text-base font-mono text-zinc-500 uppercase tracking-wider mb-2">
                    {t("hi_timeline")}
                  </div>
                  <div className="h-16 flex items-end gap-px">
                    {hiData.map((point, i) => {
                      const height = Math.max(2, (point.score / 100) * 100);
                      const color =
                        point.score >= 70
                          ? "bg-teal-500"
                          : point.score >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500";
                      const isActive = i === cursorIdx;
                      return (
                        <div
                          key={i}
                          className={`flex-1 min-w-[1px] rounded-t-sm transition-all cursor-pointer ${color} ${
                            isActive ? "opacity-100 ring-1 ring-zinc-900 dark:ring-white" : "opacity-30"
                          }`}
                          style={{ height: `${height}%` }}
                          onClick={() => {
                            setCursorIdx(i);
                            setPlaying(false);
                          }}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Alerts at current time */}
            <div>
              <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-mono uppercase tracking-wider text-zinc-500">
                      {t("alerts_at", { time: currentTime })}
                    </h3>
                    <Badge variant="outline" className="text-base font-mono">
                      {visibleAlerts.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {visibleAlerts.length === 0 ? (
                    <p className="text-base text-zinc-500 font-mono py-4 text-center">
                      {t("no_alerts_at")}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                      {visibleAlerts.map((a, i) => (
                        <div
                          key={`${a.parameter}-${a.ts}-${i}`}
                          className={`p-2 rounded text-base ${
                            a.severity === "critical"
                              ? "bg-red-500/5 border border-red-500/10"
                              : "bg-yellow-500/5 border border-yellow-500/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <Badge
                              className={`text-base ${
                                a.severity === "critical"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-yellow-500/10 text-yellow-400"
                              }`}
                            >
                              {a.severity}
                            </Badge>
                            <span className="text-base font-mono text-zinc-600">
                              {new Date(a.ts).toLocaleTimeString("en-GB", { hour12: false })}
                            </span>
                          </div>
                          <p className="text-zinc-400 mt-1 truncate">
                            {a.parameter.replace(/_/g, " ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
