"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  XCircle,
  Info,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useLocale, PARAM_KEY_MAP } from "@/lib/i18n";

interface AlertItem {
  id: number;
  ts: string;
  loco_id: string;
  parameter: string;
  severity: string;
  value: number;
  threshold: number;
  message: string;
  acknowledged: boolean;
  annotation: string | null;
}

const PAGE_SIZE = 20;

function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useLocale();
  if (severity === "critical")
    return (
      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-base gap-1">
        <XCircle className="w-3 h-3" /> {t("severity_critical")}
      </Badge>
    );
  if (severity === "warning")
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-base gap-1">
        <AlertTriangle className="w-3 h-3" /> {t("severity_warning")}
      </Badge>
    );
  return (
    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-base gap-1">
      <Info className="w-3 h-3" /> {t("severity_info")}
    </Badge>
  );
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      hour12: false,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function AlertsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const locoId = useTelemetryStore((s) => s.locoId);
  useWebSocket();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      let path = `/api/v1/alerts/${locoId}?limit=${PAGE_SIZE}&offset=${offset}`;
      if (severityFilter) path += `&severity=${severityFilter}`;
      const data = await apiFetch<{ total: number; data: AlertItem[] }>(path);
      setAlerts(data.data);
      setTotal(data.total);
    } catch (err) {
      toast.error(t("failed_load_alerts"));
    } finally {
      setLoading(false);
    }
  }, [token, locoId, offset, severityFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Refresh on new WS alerts
  const wsAlerts = useTelemetryStore((s) => s.recentAlerts);
  useEffect(() => {
    if (wsAlerts.length > 0) fetchAlerts();
  }, [wsAlerts.length, fetchAlerts]);

  const handleAcknowledge = async (id: number) => {
    try {
      await apiFetch(`/api/v1/alerts/${id}/acknowledge`, { method: "PATCH" });
      toast.success(t("alert_acknowledged"));
      fetchAlerts();
    } catch {
      toast.error(t("failed_acknowledge"));
    }
  };

  const handleAnnotate = async (id: number) => {
    if (!annotationText.trim()) return;
    try {
      await apiFetch(`/api/v1/alerts/${id}/annotate`, {
        method: "PATCH",
        body: JSON.stringify({ text: annotationText }),
      });
      toast.success(t("annotation_saved"));
      setAnnotationText("");
      fetchAlerts();
    } catch {
      toast.error(t("failed_annotation"));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (isLoading || !token) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-100/60 dark:bg-zinc-950">
      <Header />
      <main className="flex-1 p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t("alerts_title")}</h1>
          <div className="flex items-center gap-2">
            {["critical", "warning", null].map((sev) => (
              <Button
                key={sev ?? "all"}
                variant={severityFilter === sev ? "default" : "outline"}
                size="sm"
                className="h-7 text-sm"
                onClick={() => {
                  setSeverityFilter(sev);
                  setOffset(0);
                }}
              >
                {sev === "critical" ? t("severity_critical") : sev === "warning" ? t("severity_warning") : t("filter_all")}
              </Button>
            ))}
            <span className="text-base text-zinc-500 font-mono ml-2">
              {total} {t("total")}
            </span>
          </div>
        </div>

        <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-[170px_1fr_130px_100px_100px_100px] gap-2 px-4 py-2 border-b border-stone-200/80 dark:border-zinc-800 text-base font-mono uppercase tracking-wider text-zinc-500">
              <span>{t("col_time")}</span>
              <span>{t("col_parameter")}</span>
              <span>{t("col_severity")}</span>
              <span className="text-right">{t("col_value")}</span>
              <span className="text-right">{t("col_threshold")}</span>
              <span className="text-right">{t("col_status")}</span>
            </div>

            {/* Rows */}
            {loading && alerts.length === 0 ? (
              <div className="py-12 text-center text-base text-zinc-500">{t("loading")}</div>
            ) : alerts.length === 0 ? (
              <div className="py-12 text-center text-base text-zinc-500 font-mono">{t("no_alerts_found")}</div>
            ) : (
              <div>
                {alerts.map((alert) => (
                  <div key={alert.id}>
                    {/* Row */}
                    <div
                      className={`grid grid-cols-[170px_1fr_130px_100px_100px_100px] gap-2 px-4 py-2.5 border-b border-stone-200/60 dark:border-zinc-800/50 cursor-pointer hover:bg-stone-100/60 dark:hover:bg-zinc-800/30 transition-colors text-base ${
                        expandedId === alert.id ? "bg-stone-100/60 dark:bg-zinc-800/20" : ""
                      }`}
                      onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                    >
                      <span className="text-base font-mono text-zinc-500 tabular-nums">
                        {formatTime(alert.ts)}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300 truncate">
                        {PARAM_KEY_MAP[alert.parameter] ? t(PARAM_KEY_MAP[alert.parameter]) : alert.parameter.replace(/_/g, " ")}
                      </span>
                      <SeverityBadge severity={alert.severity} />
                      <span className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300 text-base">
                        {alert.value.toFixed(1)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-zinc-500 text-base">
                        {alert.threshold.toFixed(1)}
                      </span>
                      <div className="text-right">
                        {alert.acknowledged ? (
                          <Badge variant="outline" className="text-base text-teal-500 border-teal-500/30">
                            ACK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-base text-zinc-500">
                            NEW
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expandedId === alert.id && (
                      <div className="px-4 py-3 bg-stone-100/60 dark:bg-zinc-800/10 border-b border-stone-200/80 dark:border-zinc-800 space-y-3 animate-fade-in-up">
                        <p className="text-base text-zinc-400">
                          {(() => {
                            const paramName = PARAM_KEY_MAP[alert.parameter] ? t(PARAM_KEY_MAP[alert.parameter]) : alert.parameter.replace(/_/g, " ");
                            const sevKey = alert.severity === "critical" ? "severity_critical" : alert.severity === "warning" ? "severity_warning" : "severity_info";
                            const direction = alert.value > alert.threshold ? "alert_exceeded" : "alert_below";
                            return t(direction, { param: paramName, severity: t(sevKey), value: alert.value.toFixed(2), threshold: alert.threshold.toFixed(2) });
                          })()}
                        </p>

                        <div className="flex items-center gap-2">
                          {!alert.acknowledged && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-base gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcknowledge(alert.id);
                              }}
                            >
                              <Check className="w-3 h-3" /> {t("acknowledge")}
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <Input
                            placeholder={alert.annotation || t("add_annotation")}
                            value={annotationText}
                            onChange={(e) => setAnnotationText(e.target.value)}
                            className="h-8 text-base flex-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-base"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnnotate(alert.id);
                            }}
                          >
                            {t("save")}
                          </Button>
                        </div>

                        {alert.annotation && (
                          <p className="text-base text-zinc-500 italic">
                            {t("annotation_label")} {alert.annotation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-base text-zinc-500 font-mono">
                  {t("page_of", { page: currentPage, total: totalPages })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
