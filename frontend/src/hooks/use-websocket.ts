"use client";

import { useEffect, useRef, useCallback } from "react";
import { getWsUrl } from "@/lib/api";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { useAuthStore } from "@/stores/auth-store";

const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);

  const locoId = useTelemetryStore((s) => s.locoId);
  const updateFromWs = useTelemetryStore((s) => s.updateFromWs);
  const setConnectionStatus = useTelemetryStore((s) => s.setConnectionStatus);
  const token = useAuthStore((s) => s.token);

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");
    const url = getWsUrl(locoId, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = 1000;
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "telemetry_update") {
          updateFromWs(msg.data);
        } else if (msg.type === "snapshot") {
          // Initial snapshot on connect
          if (msg.data?.score !== undefined) {
            updateFromWs({
              ts: msg.data.ts || new Date().toISOString(),
              parameters: msg.data.parameters || {},
              health_index: {
                score: msg.data.score,
                status: msg.data.status,
                top_factors: msg.data.top_factors || [],
                subsystem_scores: msg.data.subsystem_scores || {},
              },
              new_alerts: [],
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("reconnecting");
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, locoId, updateFromWs, setConnectionStatus]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          MAX_RECONNECT_DELAY,
        );
        connect();
      }
    }, reconnectDelay.current);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Send ping every 30s to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Detect stale data — if no telemetry update for 3s, show disconnected
  const lastUpdate = useTelemetryStore((s) => s.lastUpdate);
  useEffect(() => {
    const interval = setInterval(() => {
      const last = useTelemetryStore.getState().lastUpdate;
      if (!last) return;
      const age = Date.now() - new Date(last).getTime();
      const currentStatus = useTelemetryStore.getState().connectionStatus;
      if (age > 3000 && currentStatus === "connected") {
        setConnectionStatus("disconnected");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate, setConnectionStatus]);
}
