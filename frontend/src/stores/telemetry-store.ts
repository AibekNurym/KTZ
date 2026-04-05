import { create } from "zustand";

export interface TopFactor {
  parameter: string;
  subsystem: string;
  value: number | null;
  safe_range: [number, number];
  contribution: number;
  norm: number;
  action: string;
}

export interface Alert {
  parameter: string;
  severity: string;
  value: number;
  threshold: number;
  message: string;
  ts?: string;
}

export interface HealthIndex {
  score: number;
  status: string;
  top_factors: TopFactor[];
  subsystem_scores: Record<string, number>;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

interface TelemetryState {
  locoId: string;
  parameters: Record<string, number>;
  healthIndex: HealthIndex;
  recentAlerts: Alert[];
  connectionStatus: ConnectionStatus;
  lastUpdate: string | null;
  hiHistory: { ts: string; score: number }[];

  setLocoId: (id: string) => void;
  updateFromWs: (data: {
    ts: string;
    parameters: Record<string, number>;
    health_index: HealthIndex;
    new_alerts: Alert[];
  }) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  reset: () => void;
}

const INITIAL_HI: HealthIndex = {
  score: 0,
  status: "Unknown",
  top_factors: [],
  subsystem_scores: {},
};

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  locoId: "KZ8A-001",
  parameters: {},
  healthIndex: INITIAL_HI,
  recentAlerts: [],
  connectionStatus: "disconnected",
  lastUpdate: null,
  hiHistory: [],

  setLocoId: (id: string) => {
    set({
      locoId: id,
      parameters: {},
      healthIndex: INITIAL_HI,
      recentAlerts: [],
      lastUpdate: null,
      hiHistory: [],
    });
  },

  updateFromWs: (data) => {
    const state = get();
    const newAlerts = [
      ...data.new_alerts.map((a) => ({ ...a, ts: data.ts })),
      ...state.recentAlerts,
    ].slice(0, 50);

    const newHiHistory = [
      ...state.hiHistory,
      { ts: data.ts, score: data.health_index.score },
    ].slice(-300); // Keep last 5 min at 1Hz

    set({
      parameters: data.parameters,
      healthIndex: data.health_index,
      recentAlerts: newAlerts,
      lastUpdate: data.ts,
      connectionStatus: "connected",
      hiHistory: newHiHistory,
    });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  reset: () =>
    set({
      parameters: {},
      healthIndex: INITIAL_HI,
      recentAlerts: [],
      lastUpdate: null,
      hiHistory: [],
    }),
}));
