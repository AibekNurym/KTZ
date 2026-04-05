"use client";

import { useTelemetryStore, type TopFactor } from "@/stores/telemetry-store";
import { useLocale } from "@/lib/i18n";
import { PARAM_KEY_MAP } from "@/lib/i18n";

function useParamName(param: string): string {
  const { t } = useLocale();
  const key = PARAM_KEY_MAP[param];
  return key ? t(key) : param.replace(/_/g, " ");
}

function useActionText(factor: TopFactor): string {
  const { t } = useLocale();
  const paramName = useParamName(factor.parameter);

  if (factor.value === null) return t("action_check_sensor");
  if (factor.norm === 0)
    return t("action_critical", { param: paramName, value: factor.value.toFixed(1) });
  if (factor.norm < 0.5)
    return t("action_warning", { param: paramName, value: factor.value.toFixed(1) });
  if (factor.norm < 1.0)
    return t("action_monitor", { param: paramName });
  return t("action_normal");
}

export function TopFactors() {
  const { t } = useLocale();
  const topFactors = useTelemetryStore((s) => s.healthIndex.top_factors);

  if (!topFactors || topFactors.length === 0) {
    return (
      <p className="text-base text-zinc-400 py-3 text-center">{t("all_nominal")}</p>
    );
  }

  const maxContribution = Math.max(...topFactors.map((f) => f.contribution), 0.01);

  return (
    <div className="space-y-2.5">
      {topFactors.map((factor, i) => (
        <FactorRow key={factor.parameter} factor={factor} index={i} maxContribution={maxContribution} />
      ))}
    </div>
  );
}

function FactorRow({ factor, index, maxContribution }: { factor: TopFactor; index: number; maxContribution: number }) {
  const barWidth = Math.max(8, (factor.contribution / maxContribution) * 100);
  const severity = factor.norm < 0.3 ? "critical" : factor.norm < 0.7 ? "warning" : "info";
  const barColor = severity === "critical" ? "bg-red-500" : severity === "warning" ? "bg-yellow-500" : "bg-teal-500";
  const paramName = useParamName(factor.parameter);
  const actionText = useActionText(factor);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-base text-zinc-700 dark:text-zinc-300 truncate mr-2">
          {paramName}
        </span>
        <span className="text-base tabular-nums text-zinc-400 shrink-0">
          {factor.value !== null ? factor.value.toFixed(1) : "—"}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-stone-200/60 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-base text-zinc-500 dark:text-zinc-500 mt-0.5 truncate">{actionText}</p>
    </div>
  );
}
