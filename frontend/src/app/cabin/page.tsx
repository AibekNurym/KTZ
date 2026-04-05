"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore, type TopFactor } from "@/stores/telemetry-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { ConnectionStatus } from "@/components/connection-status";
import {
  Train, LogOut, AlertTriangle, Gauge, Thermometer, Wind,
  Zap, Droplets, Activity, Battery, Fuel, RotateCw, X, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, PARAM_KEY_MAP } from "@/lib/i18n";

/* ═══ Leaflet dynamic imports (no SSR) ═══ */
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const GeoJSONLayer = dynamic(() => import("react-leaflet").then((m) => m.GeoJSON), { ssr: false });
const LeafMarker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const LeafPopup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

/* ═══════════════════════════════════════════════════════════════
   Parameter definitions per locomotive type (main 8 cards)
   ═══════════════════════════════════════════════════════════════ */

interface ParamDef {
  key: string;
  icon: React.ElementType;
  unit: string;
  accent: string;
}

const KZ8A_PARAMS: ParamDef[] = [
  { key: "speed_kmh",                icon: Gauge,       unit: "km/h", accent: "text-teal-400" },
  { key: "traction_motor_temp_c",    icon: Thermometer, unit: "°C",   accent: "text-orange-400" },
  { key: "brake_main_pressure_bar",  icon: Wind,        unit: "bar",  accent: "text-blue-400" },
  { key: "dc_bus_voltage_v",         icon: Zap,         unit: "V",    accent: "text-violet-400" },
  { key: "coolant_temp_c",           icon: Droplets,    unit: "°C",   accent: "text-cyan-400" },
  { key: "traction_motor_current_a", icon: Activity,    unit: "A",    accent: "text-rose-400" },
  { key: "catenary_voltage_kv",      icon: Zap,         unit: "kV",   accent: "text-amber-400" },
  { key: "battery_voltage_v",        icon: Battery,     unit: "V",    accent: "text-emerald-400" },
];

const TE33A_PARAMS: ParamDef[] = [
  { key: "speed_kmh",                icon: Gauge,       unit: "km/h", accent: "text-teal-400" },
  { key: "traction_motor_temp_c",    icon: Thermometer, unit: "°C",   accent: "text-orange-400" },
  { key: "brake_main_pressure_bar",  icon: Wind,        unit: "bar",  accent: "text-blue-400" },
  { key: "engine_rpm",               icon: RotateCw,    unit: "rpm",  accent: "text-violet-400" },
  { key: "coolant_temp_c",           icon: Droplets,    unit: "°C",   accent: "text-cyan-400" },
  { key: "oil_temp_c",               icon: Thermometer, unit: "°C",   accent: "text-rose-400" },
  { key: "oil_pressure_kpa",         icon: Gauge,       unit: "kPa",  accent: "text-amber-400" },
  { key: "fuel_level_pct",           icon: Fuel,        unit: "%",    accent: "text-emerald-400" },
];

/* ═══ Card detail tabs — each card has related sensors with safe ranges ═══ */

interface ParamRange { key: string; unit: string; safe_low: number; safe_high: number }
interface CardTab { cardKey: string; related: ParamRange[] }

const KZ8A_TABS: CardTab[] = [
  { cardKey: "speed_kmh", related: [
    { key: "speed_kmh", unit: "km/h", safe_low: 0, safe_high: 115 },
    { key: "wheel_slip_pct", unit: "%", safe_low: 0, safe_high: 2 },
    { key: "ambient_temp_c", unit: "°C", safe_low: -40, safe_high: 40 },
  ]},
  { cardKey: "traction_motor_temp_c", related: [
    { key: "traction_motor_temp_c", unit: "°C", safe_low: 20, safe_high: 120 },
    { key: "traction_motor_current_a", unit: "A", safe_low: 0, safe_high: 1080 },
    { key: "wheel_slip_pct", unit: "%", safe_low: 0, safe_high: 2 },
  ]},
  { cardKey: "brake_main_pressure_bar", related: [
    { key: "brake_main_pressure_bar", unit: "bar", safe_low: 4.5, safe_high: 6.2 },
    { key: "brake_reservoir_pressure_bar", unit: "bar", safe_low: 8.0, safe_high: 9.5 },
    { key: "brake_cylinder_pressure_bar", unit: "bar", safe_low: 0, safe_high: 4.0 },
    { key: "regen_braking_power_kw", unit: "kW", safe_low: 0, safe_high: 7600 },
  ]},
  { cardKey: "dc_bus_voltage_v", related: [
    { key: "dc_bus_voltage_v", unit: "V", safe_low: 1620, safe_high: 1980 },
    { key: "catenary_voltage_kv", unit: "kV", safe_low: 22.5, safe_high: 27.5 },
    { key: "pantograph_current_a", unit: "A", safe_low: 0, safe_high: 500 },
  ]},
  { cardKey: "coolant_temp_c", related: [
    { key: "coolant_temp_c", unit: "°C", safe_low: 60, safe_high: 85 },
    { key: "oil_temp_c", unit: "°C", safe_low: 60, safe_high: 95 },
    { key: "ambient_temp_c", unit: "°C", safe_low: -40, safe_high: 40 },
  ]},
  { cardKey: "traction_motor_current_a", related: [
    { key: "traction_motor_current_a", unit: "A", safe_low: 0, safe_high: 1080 },
    { key: "traction_motor_temp_c", unit: "°C", safe_low: 20, safe_high: 120 },
    { key: "dc_bus_voltage_v", unit: "V", safe_low: 1620, safe_high: 1980 },
  ]},
  { cardKey: "catenary_voltage_kv", related: [
    { key: "catenary_voltage_kv", unit: "kV", safe_low: 22.5, safe_high: 27.5 },
    { key: "onboard_voltage_v", unit: "V", safe_low: 380, safe_high: 420 },
    { key: "battery_voltage_v", unit: "V", safe_low: 100, safe_high: 130 },
    { key: "pantograph_current_a", unit: "A", safe_low: 0, safe_high: 500 },
  ]},
  { cardKey: "battery_voltage_v", related: [
    { key: "battery_voltage_v", unit: "V", safe_low: 100, safe_high: 130 },
    { key: "onboard_voltage_v", unit: "V", safe_low: 380, safe_high: 420 },
    { key: "catenary_voltage_kv", unit: "kV", safe_low: 22.5, safe_high: 27.5 },
  ]},
];

const TE33A_TABS: CardTab[] = [
  { cardKey: "speed_kmh", related: [
    { key: "speed_kmh", unit: "km/h", safe_low: 0, safe_high: 115 },
    { key: "wheel_slip_pct", unit: "%", safe_low: 0, safe_high: 2 },
    { key: "ambient_temp_c", unit: "°C", safe_low: -40, safe_high: 45 },
  ]},
  { cardKey: "traction_motor_temp_c", related: [
    { key: "traction_motor_temp_c", unit: "°C", safe_low: 20, safe_high: 120 },
    { key: "traction_motor_current_a", unit: "A", safe_low: 0, safe_high: 900 },
    { key: "wheel_slip_pct", unit: "%", safe_low: 0, safe_high: 2 },
  ]},
  { cardKey: "brake_main_pressure_bar", related: [
    { key: "brake_main_pressure_bar", unit: "bar", safe_low: 4.5, safe_high: 6.2 },
    { key: "brake_reservoir_pressure_bar", unit: "bar", safe_low: 8.0, safe_high: 9.5 },
    { key: "brake_cylinder_pressure_bar", unit: "bar", safe_low: 0, safe_high: 4.0 },
    { key: "regen_braking_power_kw", unit: "kW", safe_low: 0, safe_high: 3000 },
  ]},
  { cardKey: "engine_rpm", related: [
    { key: "engine_rpm", unit: "rpm", safe_low: 450, safe_high: 1050 },
    { key: "exhaust_temp_c", unit: "°C", safe_low: 200, safe_high: 500 },
    { key: "fuel_consumption_g_kwh", unit: "g/kWh", safe_low: 160, safe_high: 220 },
  ]},
  { cardKey: "coolant_temp_c", related: [
    { key: "coolant_temp_c", unit: "°C", safe_low: 82, safe_high: 95 },
    { key: "oil_temp_c", unit: "°C", safe_low: 90, safe_high: 105 },
    { key: "ambient_temp_c", unit: "°C", safe_low: -40, safe_high: 45 },
  ]},
  { cardKey: "oil_temp_c", related: [
    { key: "oil_temp_c", unit: "°C", safe_low: 90, safe_high: 105 },
    { key: "oil_pressure_kpa", unit: "kPa", safe_low: 310, safe_high: 380 },
    { key: "oil_pressure_idle_kpa", unit: "kPa", safe_low: 100, safe_high: 210 },
  ]},
  { cardKey: "oil_pressure_kpa", related: [
    { key: "oil_pressure_kpa", unit: "kPa", safe_low: 310, safe_high: 380 },
    { key: "oil_pressure_idle_kpa", unit: "kPa", safe_low: 100, safe_high: 210 },
    { key: "oil_temp_c", unit: "°C", safe_low: 90, safe_high: 105 },
    { key: "engine_rpm", unit: "rpm", safe_low: 450, safe_high: 1050 },
  ]},
  { cardKey: "fuel_level_pct", related: [
    { key: "fuel_level_pct", unit: "%", safe_low: 20, safe_high: 100 },
    { key: "fuel_consumption_g_kwh", unit: "g/kWh", safe_low: 160, safe_high: 220 },
    { key: "engine_rpm", unit: "rpm", safe_low: 450, safe_high: 1050 },
    { key: "exhaust_temp_c", unit: "°C", safe_low: 200, safe_high: 500 },
  ]},
];

const SUB_I18N: Record<string, string> = {
  Traction: "sub_traction", Electrical: "sub_electrical", Braking: "sub_braking",
  Cooling: "sub_cooling", Speed: "sub_speed", Diesel: "sub_diesel", Auxiliary: "sub_auxiliary",
};

/* ═══ Helpers ═══ */

function paramStatus(key: string, factors: TopFactor[]): "ok" | "warn" | "crit" {
  const f = factors.find((x) => x.parameter === key);
  if (!f || f.norm >= 0.7) return "ok";
  return f.norm >= 0.4 ? "warn" : "crit";
}

function cardTabStatus(tab: CardTab, factors: TopFactor[]): "ok" | "warn" | "crit" {
  let worst: "ok" | "warn" | "crit" = "ok";
  for (const p of tab.related) {
    const s = paramStatus(p.key, factors);
    if (s === "crit") return "crit";
    if (s === "warn") worst = "warn";
  }
  return worst;
}

const CARD_STYLE = {
  ok:   { bg: "bg-teal-500/[0.04]", borderL: "border-l-teal-500/50", border: "border-zinc-800",       glow: "" },
  warn: { bg: "bg-amber-500/[0.08]", borderL: "border-l-amber-500",  border: "border-amber-500/20",   glow: "shadow-[inset_0_0_30px_rgba(234,179,8,0.06)]" },
  crit: { bg: "bg-red-500/[0.09]",   borderL: "border-l-red-500",    border: "border-red-500/25",      glow: "shadow-[inset_0_0_30px_rgba(239,68,68,0.08)]" },
};

const STATUS_DOT  = { ok: "bg-teal-500", warn: "bg-amber-500", crit: "bg-red-500" };
const STATUS_TEXT = { ok: "text-teal-400", warn: "text-amber-300", crit: "text-red-300" };

function fmtVal(k: string, v: number | undefined): string {
  if (v === undefined) return "\u2014";
  if (k.includes("kmh") || k.includes("temp") || k.includes("bar") || k.includes("kv") || k.includes("pct"))
    return v.toFixed(1);
  return v.toFixed(0);
}

function fmtRange(low: number, high: number): string {
  const f = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));
  return `${f(low)} \u2013 ${f(high)}`;
}

function subBarColor(s: number) { return s >= 0.7 ? "bg-teal-500" : s >= 0.4 ? "bg-amber-500" : "bg-red-500"; }
function subTextColor(s: number) { return s >= 0.7 ? "text-teal-400" : s >= 0.4 ? "text-amber-400" : "text-red-400"; }
function gaugeColor(score: number) { return score >= 70 ? "#14b8a6" : score >= 40 ? "#eab308" : "#ef4444"; }

const SPEED_LIMIT = 115; // km/h — section speed limit (safe_high from config)

/* ═══ Route helpers ═══ */

interface GeoData {
  type: string;
  features: Array<{
    type: string;
    properties: { name: string; type?: string };
    geometry: { type: string; coordinates: number[] | number[][] };
  }>;
}

function interpolatePosition(coords: number[][], progress: number): [number, number] {
  const idx = Math.min(Math.floor(progress * (coords.length - 1)), coords.length - 2);
  const t = progress * (coords.length - 1) - idx;
  const lon = coords[idx][0] + t * (coords[idx + 1][0] - coords[idx][0]);
  const lat = coords[idx][1] + t * (coords[idx + 1][1] - coords[idx][1]);
  return [lat, lon];
}

/* ═══ Sub-components ═══ */

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("en-GB"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums text-zinc-500 text-sm">{now}</span>;
}

function CabinGauge({ score }: { score: number }) {
  const { t } = useLocale();
  const color = gaugeColor(score);
  const r = 90, circ = 2 * Math.PI * r, sweep = (270 / 360) * circ, fill = (score / 100) * sweep;
  const label = score >= 90 ? t("excellent") : score >= 70 ? t("good") : score >= 40 ? t("warning") : t("critical");

  return (
    <div className="relative flex flex-col items-center">
      <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-[135deg]">
        <circle cx="110" cy="110" r={r} fill="none" stroke="currentColor"
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${sweep} ${circ}`} className="text-zinc-800" />
        <circle cx="110" cy="110" r={r} fill="none" stroke={color}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          className="transition-all duration-700"
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }} />
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const a = (pct * 270 * Math.PI) / 180;
          const o = r + 16, i2 = r + 10;
          return (
            <line key={pct}
              x1={110 + o * Math.cos(a)} y1={110 + o * Math.sin(a)}
              x2={110 + i2 * Math.cos(a)} y2={110 + i2 * Math.sin(a)}
              stroke="currentColor" strokeWidth="1.5" className="text-zinc-600" />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums font-mono" style={{ color }}>{score.toFixed(1)}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mt-1">{t("health_index")}</span>
        <span className="mt-1.5 text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
          style={{ color, backgroundColor: `${color}15` }}>{label}</span>
      </div>
    </div>
  );
}

function FuelBatteryIndicator({ isElectric, parameters }: {
  isElectric: boolean;
  parameters: Record<string, number>;
}) {
  if (isElectric) {
    const v = parameters.battery_voltage_v;
    const color = v === undefined ? "text-zinc-500" : v >= 100 ? "text-emerald-400" : v >= 90 ? "text-amber-400" : "text-red-400";
    return (
      <div className="flex items-center gap-2.5 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800">
        <Battery className={`w-4 h-4 ${color}`} />
        <span className={`text-sm font-mono tabular-nums font-medium ${color}`}>
          {v !== undefined ? v.toFixed(0) : "\u2014"} V
        </span>
      </div>
    );
  }
  const v = parameters.fuel_level_pct;
  const color = v === undefined ? "text-zinc-500" : v >= 50 ? "text-emerald-400" : v >= 20 ? "text-amber-400" : "text-red-400";
  const pct = v !== undefined ? Math.round(v) : 0;
  return (
    <div className="flex items-center gap-2.5 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800">
      <Fuel className={`w-4 h-4 ${color}`} />
      <div className="flex items-center gap-2">
        <span className={`text-sm font-mono tabular-nums font-medium ${color}`}>
          {v !== undefined ? `${pct}%` : "\u2014"}
        </span>
        {v !== undefined && (
          <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full ${v >= 50 ? "bg-emerald-500" : v >= 20 ? "bg-amber-500" : "bg-red-500"} transition-all duration-700`}
              style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ParamCard({ def, value, status, onClick, t }: {
  def: ParamDef; value: number | undefined; status: "ok" | "warn" | "crit";
  onClick: () => void; t: (k: string) => string;
}) {
  const Icon = def.icon;
  const label = PARAM_KEY_MAP[def.key] ? t(PARAM_KEY_MAP[def.key]) : def.key.replace(/_/g, " ");
  const s = CARD_STYLE[status];
  const isSpeed = def.key === "speed_kmh";

  return (
    <div onClick={onClick}
      className={`${s.bg} rounded-xl border ${s.border} border-l-[3px] ${s.borderL} ${s.glow}
        p-4 flex items-center gap-4 transition-all duration-500 h-full
        cursor-pointer hover:brightness-125 active:scale-[0.98]`}>
      <Icon className={`w-7 h-7 ${def.accent} shrink-0 opacity-80`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-bold font-mono tabular-nums ${STATUS_TEXT[status]}`}>
            {fmtVal(def.key, value)}
          </span>
          <span className="text-base text-zinc-500">{def.unit}</span>
          {isSpeed && (
            <span className="text-sm text-zinc-600 font-mono ml-1">/ {SPEED_LIMIT}</span>
          )}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wider mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

/* ═══ Route Indicator (header widget) ═══ */

function RouteIndicator({ progress, onClick }: { progress: number; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-teal-500/15 transition-colors"
    >
      <span className="text-xs font-bold text-teal-400">AST</span>
      <div className="relative w-20 h-[2px] bg-zinc-700 rounded-full">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-teal-500 transition-all duration-1000"
          style={{ left: `calc(${Math.min(progress * 100, 100)}% - 5px)` }}
        />
      </div>
      <span className="text-xs font-bold text-emerald-400">KRG</span>
    </div>
  );
}

/* ═══ Map Modal ═══ */

function MapModal({
  geoData,
  trainPos,
  locoId,
  healthScore,
  speed,
  onClose,
}: {
  geoData: GeoData | null;
  trainPos: [number, number];
  locoId: string;
  healthScore: number;
  speed: number;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trainIcon, setTrainIcon] = useState<any>(null);
  const [ready, setReady] = useState(false);

  const stations = useMemo(() => {
    if (!geoData) return [];
    return geoData.features.filter((f) => f.properties.type === "station");
  }, [geoData]);

  useEffect(() => {
    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      const icon = L.divIcon({
        className: "train-marker",
        html: '<div style="background:#14b8a6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(20,184,166,0.5);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      setTrainIcon(icon);
      setReady(true);
    });
  }, []);

  const hiColor = gaugeColor(healthScore);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between h-12 px-5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-teal-500" />
          <span className="font-semibold">{locoId}</span>
          <span className="text-zinc-700">&middot;</span>
          <span className="text-sm text-zinc-500">
            {trainPos[0].toFixed(3)}°N, {trainPos[1].toFixed(3)}°E
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Map */}
      <div className="flex-1">
        {ready && (
          <MapContainer
            center={[50.5, 72.2]}
            zoom={7}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {geoData && (
              <GeoJSONLayer
                data={geoData as unknown as GeoJSON.GeoJsonObject}
                style={(feature) => {
                  if (feature?.geometry.type === "LineString") {
                    return { color: hiColor, weight: 4, opacity: 0.8 };
                  }
                  return { opacity: 0 };
                }}
                pointToLayer={() => null as unknown as L.Layer}
              />
            )}
            {stations.map((s) => (
              <CircleMarker
                key={s.properties.name}
                center={[(s.geometry.coordinates as number[])[1], (s.geometry.coordinates as number[])[0]]}
                radius={5} fillColor="#71717a" fillOpacity={0.8} color="#a1a1aa" weight={1}
              >
                <LeafPopup>
                  <span className="text-sm font-medium">{s.properties.name}</span>
                </LeafPopup>
              </CircleMarker>
            ))}
            {trainIcon && (
              <LeafMarker position={trainPos} icon={trainIcon}>
                <LeafPopup>
                  <div className="text-sm">
                    <strong>{locoId}</strong><br />
                    HI: {healthScore.toFixed(1)}
                  </div>
                </LeafPopup>
              </LeafMarker>
            )}
          </MapContainer>
        )}

        {/* Overlay: train info bottom-left */}
        <div className="absolute bottom-6 left-6 z-[1000] bg-zinc-900/90 backdrop-blur-md border border-zinc-700/50 rounded-xl px-5 py-3 flex items-center gap-4 shadow-xl">
          <Train className="w-6 h-6 text-teal-400" />
          <div>
            <div className="text-sm font-semibold text-zinc-300">{locoId}</div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-teal-400">
                {speed.toFixed(1)}
              </span>
              <span className="text-sm text-zinc-500">km/h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Card Tabs Detail Modal ═══ */

function CardTabsModal({
  tabs,
  initialCardKey,
  paramDefs,
  onClose,
}: {
  tabs: CardTab[];
  initialCardKey: string;
  paramDefs: ParamDef[];
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { parameters, healthIndex } = useTelemetryStore();
  const [activeKey, setActiveKey] = useState(initialCardKey);
  const activeTab = tabs.find((tb) => tb.cardKey === activeKey) || tabs[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-[720px] max-w-[92vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className="text-base font-semibold text-zinc-400">{t("cabin_related")}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar — one tab per card */}
        <div className="flex items-center gap-1 px-5 pb-4 overflow-x-auto shrink-0">
          {tabs.map((tb) => {
            const isActive = tb.cardKey === activeKey;
            const st = cardTabStatus(tb, healthIndex.top_factors);
            const tabLabel = PARAM_KEY_MAP[tb.cardKey] ? t(PARAM_KEY_MAP[tb.cardKey]) : tb.cardKey;
            return (
              <button key={tb.cardKey} onClick={() => setActiveKey(tb.cardKey)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                  ${isActive
                    ? "bg-zinc-800 border border-zinc-600 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`}>
                <div className={`w-2 h-2 rounded-full ${STATUS_DOT[st]}`} />
                {tabLabel}
              </button>
            );
          })}
        </div>

        {/* Parameter rows */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {activeTab.related.map((p) => {
            const st = paramStatus(p.key, healthIndex.top_factors);
            const label = PARAM_KEY_MAP[p.key] ? t(PARAM_KEY_MAP[p.key]) : p.key.replace(/_/g, " ");
            const rowStyle = st === "crit"
              ? "bg-red-500/[0.06] border-red-500/20 border-l-red-500"
              : st === "warn"
                ? "bg-amber-500/[0.06] border-amber-500/20 border-l-amber-500"
                : "bg-zinc-800/40 border-zinc-700/30 border-l-teal-500/40";

            return (
              <div key={p.key}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border border-l-[3px] ${rowStyle}`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[st]}`} />
                <span className="text-sm flex-1 truncate">{label}</span>
                <span className={`text-xl font-bold font-mono tabular-nums ${STATUS_TEXT[st]}`}>
                  {fmtVal(p.key, parameters[p.key])}
                </span>
                <span className="text-sm text-zinc-500 w-10">{p.unit}</span>
                <span className="text-xs font-mono text-zinc-600 w-24 text-right tabular-nums">
                  {fmtRange(p.safe_low, p.safe_high)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══ Page ═══ */

export default function CabinPage() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage, logout } = useAuthStore();
  const { healthIndex, parameters, locoId, connectionStatus } = useTelemetryStore();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [positionProgress, setPositionProgress] = useState(0.3);
  useWebSocket();

  useEffect(() => { loadFromStorage(); }, [loadFromStorage]);
  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);

  // Load GeoJSON route
  useEffect(() => {
    fetch("/routes/astana-karaganda.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, []);

  // Simulate position based on speed
  useEffect(() => {
    const speed = parameters.speed_kmh || 0;
    setPositionProgress((prev) => {
      const delta = (speed / 120) * 0.002;
      const next = prev + delta;
      return next > 1 ? 0 : next;
    });
  }, [parameters.speed_kmh]);

  const routeCoords = useMemo(() => {
    if (!geoData) return [];
    const line = geoData.features.find((f) => f.geometry.type === "LineString");
    return (line?.geometry.coordinates as number[][]) || [];
  }, [geoData]);

  const trainPos = useMemo((): [number, number] => {
    if (routeCoords.length < 2) return [50.5, 72.0];
    return interpolatePosition(routeCoords, positionProgress);
  }, [routeCoords, positionProgress]);

  if (isLoading || !token) return null;

  const isElectric = locoId.startsWith("KZ8A");
  const params = isElectric ? KZ8A_PARAMS : TE33A_PARAMS;
  const cardTabs = isElectric ? KZ8A_TABS : TE33A_TABS;
  const isStale = connectionStatus === "disconnected" || connectionStatus === "reconnecting";
  const subs = healthIndex.subsystem_scores;
  const subKeys = Object.keys(subs);
  const topDegraded = healthIndex.top_factors.find((f) => f.norm < 0.7);

  const handleCardClick = (paramKey: string) => {
    setActiveTab(paramKey);
  };

  return (
    <div className="relative flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <header className="flex items-center justify-between h-12 px-5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Train className="w-5 h-5 text-teal-500" />
          <span className="font-semibold">{locoId}</span>
          <span className="text-zinc-700">&middot;</span>
          <span className="text-sm text-zinc-500">
            {isElectric ? t("loco_electric") : t("loco_diesel")}
          </span>
          <RouteIndicator progress={positionProgress} onClick={() => setMapOpen(true)} />
        </div>
        <div className="flex items-center gap-4">
          <Clock />
          <ConnectionStatus />
          <Button variant="ghost" size="sm"
            onClick={() => setLocale(locale === "ru" ? "kk" : "ru")}
            className="h-8 px-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">
            {locale === "ru" ? "KZ" : "RU"}
          </Button>
          <Button variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-300"
            onClick={() => { logout(); router.push("/login"); }}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <main className={`flex-1 flex gap-5 p-5 min-h-0 transition-opacity duration-500 ${isStale ? "opacity-30" : ""}`}>
        {/* Left panel: Gauge + Fuel/Battery + Subsystem bars */}
        <div className="flex flex-col items-center gap-4 w-[280px] shrink-0">
          <CabinGauge score={healthIndex.score} />
          <FuelBatteryIndicator isElectric={isElectric} parameters={parameters} />

          <div className="w-full space-y-2.5 mt-auto">
            {subKeys.map((name) => {
              const s = subs[name];
              const pct = Math.round(s * 100);
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-[72px] text-right truncate">
                    {t(SUB_I18N[name]) || name}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full rounded-full ${subBarColor(s)} transition-all duration-700`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-xs font-mono tabular-nums w-7 text-right ${subTextColor(s)}`}>{pct}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: Parameter grid */}
        <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-3 min-h-0">
          {params.map((p) => (
            <ParamCard key={p.key} def={p} value={parameters[p.key]}
              status={paramStatus(p.key, healthIndex.top_factors)}
              onClick={() => handleCardClick(p.key)} t={t} />
          ))}
        </div>
      </main>

      {/* ═══ ALERT STRIP ═══ */}
      <footer className="shrink-0 h-11 px-5 border-t border-zinc-800 flex items-center">
        {topDegraded ? (
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-amber-400">
              {t("issues_detected", { count: healthIndex.top_factors.filter((f) => f.norm < 0.7).length })}
            </span>
            <span className="text-zinc-700">&middot;</span>
            <span className="text-sm text-zinc-400 truncate">
              {(() => {
                const name = PARAM_KEY_MAP[topDegraded.parameter]
                  ? t(PARAM_KEY_MAP[topDegraded.parameter])
                  : topDegraded.parameter.replace(/_/g, " ");
                if (topDegraded.value === null) return t("action_check_sensor");
                if (topDegraded.norm === 0)
                  return t("action_critical", { param: name, value: topDegraded.value.toFixed(1) });
                if (topDegraded.norm < 0.5)
                  return t("action_warning", { param: name, value: topDegraded.value.toFixed(1) });
                return t("action_monitor", { param: name });
              })()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span className="text-sm text-zinc-500">{t("all_nominal")}</span>
          </div>
        )}
      </footer>

      {/* ═══ CARD TABS DETAIL MODAL ═══ */}
      {activeTab && (
        <CardTabsModal
          tabs={cardTabs}
          initialCardKey={activeTab}
          paramDefs={params}
          onClose={() => setActiveTab(null)}
        />
      )}

      {/* ═══ MAP MODAL ═══ */}
      {mapOpen && (
        <MapModal
          geoData={geoData}
          trainPos={trainPos}
          locoId={locoId}
          healthScore={healthIndex.score}
          speed={parameters.speed_kmh || 0}
          onClose={() => setMapOpen(false)}
        />
      )}

      {/* ═══ CONNECTION LOST OVERLAY ═══ */}
      {isStale && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-red-600/90 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
            </span>
            <span className="text-lg font-bold">{t("no_connection")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
