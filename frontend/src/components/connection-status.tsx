"use client";

import { useTelemetryStore } from "@/stores/telemetry-store";
import { useLocale } from "@/lib/i18n";
import { Wifi, WifiOff } from "lucide-react";

export function ConnectionStatus() {
  const status = useTelemetryStore((s) => s.connectionStatus);
  const { t } = useLocale();

  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
        </span>
        <Wifi className="w-3 h-3 text-teal-500" />
        <span className="text-teal-500 font-mono">{t("live")}</span>
      </div>
    );
  }

  if (status === "reconnecting" || status === "connecting") {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        <span className="text-yellow-500 font-mono animate-pulse">{t("reconnecting")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-pulse-glow rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <WifiOff className="w-3 h-3 text-red-500" />
      <span className="text-red-500 font-mono">{t("no_connection")}</span>
    </div>
  );
}
