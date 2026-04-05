"use client";

import { useLocale } from "@/lib/i18n";

interface SubsystemCardProps {
  name: string;
  score: number;
  parameters: Record<string, number>;
  units?: Record<string, string>;
}

function getScoreColor(score: number) {
  if (score >= 0.7) return { bar: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" };
  if (score >= 0.4) return { bar: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400" };
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

const PARAM_I18N: Record<string, string> = {
  speed_kmh: "param_speed",
  traction_motor_temp_c: "param_motor_temp",
  traction_motor_current_a: "param_motor_current",
  dc_bus_voltage_v: "param_dc_bus",
  catenary_voltage_kv: "param_catenary_v",
  onboard_voltage_v: "param_onboard_v",
  battery_voltage_v: "param_battery_v",
  pantograph_current_a: "param_pantograph",
  brake_main_pressure_bar: "param_brake_main",
  brake_reservoir_pressure_bar: "param_brake_res",
  brake_cylinder_pressure_bar: "param_brake_cyl",
  regen_braking_power_kw: "param_regen_power",
  coolant_temp_c: "param_coolant",
  oil_temp_c: "param_oil_temp",
  oil_pressure_kpa: "param_oil_press",
  engine_rpm: "param_rpm",
  exhaust_temp_c: "param_exhaust",
  fuel_level_pct: "param_fuel_level",
  fuel_consumption_g_kwh: "param_fuel_rate",
  wheel_slip_pct: "param_wheel_slip",
  ambient_temp_c: "param_ambient",
  oil_pressure_idle_kpa: "param_oil_idle",
};

const SUB_I18N: Record<string, string> = {
  Traction: "sub_traction",
  Electrical: "sub_electrical",
  Braking: "sub_braking",
  Cooling: "sub_cooling",
  Speed: "sub_speed",
  Diesel: "sub_diesel",
  Auxiliary: "sub_auxiliary",
};

function formatValue(key: string, val: number): string {
  if (key.includes("pct")) return `${val.toFixed(1)}%`;
  if (key.includes("temp")) return `${val.toFixed(1)}°`;
  if (key.includes("pressure") || key.includes("bar")) return `${val.toFixed(1)}`;
  if (key.includes("kpa")) return `${val.toFixed(0)}`;
  if (key.includes("voltage_v") || key.includes("bus_voltage")) return `${val.toFixed(0)}`;
  if (key.includes("voltage_kv")) return `${val.toFixed(1)}`;
  if (key.includes("current")) return `${val.toFixed(0)}`;
  if (key.includes("kmh")) return `${val.toFixed(0)}`;
  if (key.includes("rpm")) return `${val.toFixed(0)}`;
  if (key.includes("kw")) return `${val.toFixed(0)}`;
  if (key.includes("g_kwh")) return `${val.toFixed(1)}`;
  return val.toFixed(1);
}

function formatUnit(key: string): string {
  if (key.includes("pct")) return "";
  if (key.includes("temp")) return "°C";
  if (key.includes("pressure") || key.includes("bar")) return "bar";
  if (key.includes("kpa")) return "kPa";
  if (key.includes("voltage_v") || key.includes("bus_voltage")) return "V";
  if (key.includes("voltage_kv")) return "kV";
  if (key.includes("current")) return "A";
  if (key.includes("kmh")) return "km/h";
  if (key.includes("rpm")) return "rpm";
  if (key.includes("kw")) return "kW";
  if (key.includes("g_kwh")) return "g/kWh";
  return "";
}

export function SubsystemCard({ name, score, parameters }: SubsystemCardProps) {
  const { t } = useLocale();
  const colors = getScoreColor(score);
  const pct = Math.round(score * 100);
  const entries = Object.entries(parameters).slice(0, 4);

  return (
    <div className="bg-stone-50 dark:bg-zinc-900/60 rounded-2xl border border-stone-200/80 dark:border-zinc-800 p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">
          {t(SUB_I18N[name]) || name}
        </h3>
        <span className={`text-lg font-bold tabular-nums ${colors.text}`}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-stone-200/60 dark:bg-zinc-800 mb-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.bar} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Parameters */}
      <div className="space-y-1 flex-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between text-base leading-tight">
            <span className="text-zinc-400 dark:text-zinc-500 truncate mr-2">
              {(PARAM_I18N[key] ? t(PARAM_I18N[key]) : key)}
            </span>
            <span className="tabular-nums text-zinc-700 dark:text-zinc-300 font-medium shrink-0">
              {formatValue(key, val)}
              <span className="text-zinc-400 dark:text-zinc-600 ml-0.5 text-base">{formatUnit(key)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
