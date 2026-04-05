"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, MapPin, Navigation } from "lucide-react";
import { useLocale } from "@/lib/i18n";

// Dynamic import for Leaflet (no SSR)
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const GeoJSON = dynamic(
  () => import("react-leaflet").then((m) => m.GeoJSON),
  { ssr: false },
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false },
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false },
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false },
);

interface GeoData {
  type: string;
  features: Array<{
    type: string;
    properties: { name: string; type?: string };
    geometry: { type: string; coordinates: number[] | number[][] };
  }>;
}

function getHiColor(score: number): string {
  if (score >= 70) return "#14b8a6";
  if (score >= 40) return "#eab308";
  return "#ef4444";
}

function interpolatePosition(
  coords: number[][],
  progress: number,
): [number, number] {
  const idx = Math.min(
    Math.floor(progress * (coords.length - 1)),
    coords.length - 2,
  );
  const t = progress * (coords.length - 1) - idx;
  const lon = coords[idx][0] + t * (coords[idx + 1][0] - coords[idx][0]);
  const lat = coords[idx][1] + t * (coords[idx + 1][1] - coords[idx][1]);
  return [lat, lon];
}

export default function MapPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const { healthIndex, parameters, locoId } = useTelemetryStore();
  const { resolvedTheme } = useTheme();
  useWebSocket();

  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trainIcon, setTrainIcon] = useState<any>(null);
  const [positionProgress, setPositionProgress] = useState(0);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);

  // Load GeoJSON
  useEffect(() => {
    fetch("/routes/astana-karaganda.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, []);

  // Import leaflet CSS and create icon
  useEffect(() => {
    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      const icon = L.divIcon({
        className: "train-marker",
        html: '<div style="background:#14b8a6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(34,197,94,0.5);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      setTrainIcon(icon);
      setLeafletReady(true);
    });
  }, []);

  // Simulate position based on speed accumulation
  useEffect(() => {
    const speed = parameters.speed_kmh || 0;
    // Move along route proportional to speed
    setPositionProgress((prev) => {
      const delta = (speed / 120) * 0.002; // Scale factor
      const next = prev + delta;
      return next > 1 ? 0 : next; // Loop back
    });
  }, [parameters.speed_kmh]);

  const routeCoords = useMemo(() => {
    if (!geoData) return [];
    const line = geoData.features.find(
      (f) => f.geometry.type === "LineString",
    );
    return (line?.geometry.coordinates as number[][]) || [];
  }, [geoData]);

  const stations = useMemo(() => {
    if (!geoData) return [];
    return geoData.features.filter(
      (f) => f.properties.type === "station",
    );
  }, [geoData]);

  const trainPos = useMemo(() => {
    if (routeCoords.length < 2) return [50.5, 72.0] as [number, number];
    return interpolatePosition(routeCoords, positionProgress);
  }, [routeCoords, positionProgress]);

  const hiColor = getHiColor(healthIndex.score);

  if (isLoading || !token) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-100/60 dark:bg-zinc-950">
      <Header />
      <main className="flex-1 relative">
        {/* Map */}
        <div className="absolute inset-0" style={{ top: "56px" }}>
          {leafletReady && (
            <MapContainer
              center={[50.5, 72.2]}
              zoom={7}
              style={{ height: "100%", width: "100%" }}
              zoomControl={false}
            >
              <TileLayer
                url={resolvedTheme === "dark"
                  ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                }
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />

              {/* Route line */}
              {geoData && (
                <GeoJSON
                  data={geoData as GeoJSON.GeoJsonObject}
                  style={(feature) => {
                    if (feature?.geometry.type === "LineString") {
                      return {
                        color: hiColor,
                        weight: 4,
                        opacity: 0.8,
                      };
                    }
                    return { opacity: 0 };
                  }}
                  pointToLayer={() => null as unknown as L.Layer}
                />
              )}

              {/* Station markers */}
              {stations.map((s) => (
                <CircleMarker
                  key={s.properties.name}
                  center={[
                    (s.geometry.coordinates as number[])[1],
                    (s.geometry.coordinates as number[])[0],
                  ]}
                  radius={5}
                  fillColor="#71717a"
                  fillOpacity={0.8}
                  color="#a1a1aa"
                  weight={1}
                >
                  <Popup>
                    <span className="text-sm font-medium">
                      {s.properties.name}
                    </span>
                  </Popup>
                </CircleMarker>
              ))}

              {/* Train marker */}
              {trainIcon && (
                <Marker position={trainPos} icon={trainIcon}>
                  <Popup>
                    <div className="text-sm">
                      <strong>{locoId}</strong>
                      <br />
                      HI: {healthIndex.score} ({healthIndex.status})
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}
        </div>

        {/* Floating overlay panel */}
        <div className="absolute top-20 left-4 z-[1000]">
          <Card className="bg-stone-50/90 border-stone-200/80 text-zinc-900 dark:bg-zinc-900/90 backdrop-blur-md dark:border-zinc-700/50 dark:text-zinc-100 w-72 shadow-xl">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-mono text-zinc-500 uppercase tracking-wider">
                  {locoId}
                </span>
                <Badge
                  className="text-base"
                  style={{
                    backgroundColor: `${hiColor}20`,
                    color: hiColor,
                    borderColor: `${hiColor}40`,
                  }}
                >
                  {healthIndex.status}
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                <Gauge className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-2xl font-bold font-mono tabular-nums" style={{ color: hiColor }}>
                    {healthIndex.score.toFixed(1)}
                  </div>
                  <div className="text-base text-zinc-500">{t("health_index")}</div>
                </div>
              </div>

              <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />

              <div className="grid grid-cols-2 gap-2 text-base">
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-zinc-500" />
                  <span className="font-mono tabular-nums">
                    {(parameters.speed_kmh || 0).toFixed(1)} km/h
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-zinc-500" />
                  <span className="font-mono tabular-nums text-zinc-400">
                    {trainPos[0].toFixed(2)}°N
                  </span>
                </div>
              </div>

              {/* Nearest station */}
              <div className="text-base text-zinc-500">
                {t("route_label")}
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
