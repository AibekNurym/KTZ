"use client";

import { useTelemetryStore, type Alert } from "@/stores/telemetry-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, XCircle, Info } from "lucide-react";
import { useLocale, PARAM_KEY_MAP } from "@/lib/i18n";

function formatTime(ts?: string): string {
  if (!ts) return "--:--";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "--:--";
  }
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
}

function useAlertMessage(alert: Alert): string {
  const { t } = useLocale();
  const key = PARAM_KEY_MAP[alert.parameter];
  const paramName = key ? t(key) : alert.parameter.replace(/_/g, " ");
  const sevKey = alert.severity === "critical" ? "severity_critical" : alert.severity === "warning" ? "severity_warning" : "severity_info";
  const sevText = t(sevKey);
  const direction = alert.value > alert.threshold ? "alert_exceeded" : "alert_below";
  return t(direction, {
    param: paramName,
    severity: sevText,
    value: alert.value.toFixed(2),
    threshold: alert.threshold.toFixed(2),
  });
}

export function AlertsFeed() {
  const { t } = useLocale();
  const alerts = useTelemetryStore((s) => s.recentAlerts);

  if (alerts.length === 0) {
    return (
      <p className="text-base text-zinc-400 py-3 text-center">{t("no_active_alerts")}</p>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1.5 pr-2">
        {alerts.slice(0, 15).map((alert, i) => (
          <AlertRow key={`${alert.parameter}-${alert.ts}-${i}`} alert={alert} index={i} />
        ))}
      </div>
    </ScrollArea>
  );
}

function AlertRow({ alert, index }: { alert: Alert; index: number }) {
  const { t } = useLocale();
  const key = PARAM_KEY_MAP[alert.parameter];
  const paramName = key ? t(key) : alert.parameter.replace(/_/g, " ");
  const message = useAlertMessage(alert);

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-lg text-base animate-fade-in-up ${
        alert.severity === "critical"
          ? "bg-red-50/60 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10"
          : alert.severity === "warning"
            ? "bg-amber-50/60 dark:bg-yellow-500/5 border border-amber-200/80 dark:border-yellow-500/10"
            : "bg-stone-100/60 dark:bg-zinc-800/50 border border-stone-200/80 dark:border-zinc-700/30"
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <SeverityIcon severity={alert.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {paramName}
          </span>
          <span className="text-base tabular-nums text-zinc-400 shrink-0">
            {formatTime(alert.ts)}
          </span>
        </div>
        <p className="text-zinc-500 dark:text-zinc-500 mt-0.5 line-clamp-2">{message}</p>
      </div>
    </div>
  );
}
