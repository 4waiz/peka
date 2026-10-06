import { create } from 'zustand';
import type { AssetRef } from '../simulation/assets';
import { seedHistory, targetReadings, type Readings, type SensorKey } from '../simulation/sensorEngine';
import type { SectorId, UtilityId } from '../simulation/infrastructureData';
import type { DemoInputs, HoverInfo, ViewMode } from '../three/TwinEngine';

export type Stage = 'monitoring' | 'detect' | 'predict' | 'prioritize' | 'plan' | 'repair' | 'resolved';
export type NavKey = 'live' | 'twin' | 'analytics' | 'repair' | 'reports';
export type RepairStatus = 'idle' | 'dispatched' | 'onsite' | 'repairing' | 'resolved';
export type Overlay = null | 'correlation' | 'failure' | 'prioritize' | 'final';
export type LogLevel = 'info' | 'warn' | 'critical' | 'ok';

export interface LogEvent {
  id: number;
  t: number;
  level: LogLevel;
  text: string;
}

export interface DemoGates {
  alert: boolean;
  plan: 0 | 1 | 2;
  stage: Stage;
  riskReady: boolean;
  leakScale: number;
  predicted: boolean;
}

export interface DemoState {
  running: boolean;
  completed: boolean;
  step: number;
  total: number;
  stepProgress: number;
  title: string;
  narration: string;
  sub: string;
  overlay: Overlay;
  flags: DemoInputs;
  gates: DemoGates;
  corrValue: number;
  scoreProgress: number;
  highlightPanel: 'repair' | 'sensors' | null;
  focusSensors: SensorKey[];
}

export interface RepairState {
  status: RepairStatus;
  progress: number;
  repairProgress: number;
}

/** Real seconds the crew needs on screen; the ETA read-out runs in accelerated sim time. */
export const CREW_TRAVEL_SECONDS = 28;
export const CREW_ETA_SIM_SECONDS = 1 * 3600 + 42 * 60 + 18;
export const REPAIR_SECONDS = 16;

const DEFAULT_FLAGS: DemoInputs = { cutaway: false, correlation: false, localize: false, impact: false, emphasizeWater: false, blast: false };
const DEFAULT_GATES: DemoGates = { alert: false, plan: 0, stage: 'monitoring', riskReady: false, leakScale: 1, predicted: false };

export type Theme = 'night' | 'day';

function initialTheme(): Theme {
  try {
    return localStorage.getItem('peka-theme') === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

export interface AppState {
  entered: boolean;
  theme: Theme;
  nav: NavKey;
  view: ViewMode;
  layers: Record<UtilityId, boolean>;
  highlight: UtilityId | null;
  xray: boolean;
  heat: boolean;
  blast: boolean;
  routeVisible: boolean;
  hoveredSector: SectorId | null;
  selectedSector: SectorId | null;
  hover: HoverInfo | null;
  selectedAsset: AssetRef | null;
  explainOpen: boolean;
  shortcutsOpen: boolean;
  mapNetwork: UtilityId | 'all';
  camera: { x: number; z: number; az: number; dist: number };
  flashPanel: { key: string; n: number } | null;

  anomaly: number;
  forecastHours: number;
  readings: Readings;
  history: Record<SensorKey, number[]>;
  confidence: number;
  risk: number;
  leakSeverity: number;
  detected: boolean;
  stage: Stage;
  planStage: 0 | 1 | 2;
  liveTime: number;

  repair: RepairState;
  demo: DemoState;
  events: LogEvent[];

  pushEvent: (level: LogLevel, text: string) => void;
  toggleTheme: () => void;
  toggleLayer: (u: UtilityId) => void;
  setHighlight: (u: UtilityId | null) => void;
  dispatchCrew: () => void;
  flash: (key: string) => void;
  resetScenario: (anomaly?: number) => void;
}

let eventId = 1;

export const useAppStore = create<AppState>((set, get) => ({
  entered: false,
  theme: initialTheme(),
  nav: 'live',
  view: '3d',
  layers: { water: true, electricity: true, telecom: true, cooling: true, sewage: true },
  highlight: null,
  xray: false,
  heat: false,
  blast: false,
  routeVisible: false,
  hoveredSector: null,
  selectedSector: null,
  hover: null,
  selectedAsset: null,
  explainOpen: false,
  shortcutsOpen: false,
  mapNetwork: 'water',
  camera: { x: 0, z: 0, az: 0, dist: 200 },
  flashPanel: null,

  anomaly: 0,
  forecastHours: 0,
  readings: targetReadings(0, 0, 0),
  history: seedHistory(),
  confidence: 0,
  risk: 7,
  leakSeverity: 0,
  detected: false,
  stage: 'monitoring',
  planStage: 0,
  liveTime: 0,

  repair: { status: 'idle', progress: 0, repairProgress: 0 },
  demo: {
    running: false,
    completed: false,
    step: 0,
    total: 10,
    stepProgress: 0,
    title: '',
    narration: '',
    sub: '',
    overlay: null,
    flags: DEFAULT_FLAGS,
    gates: DEFAULT_GATES,
    corrValue: 0,
    scoreProgress: 0,
    highlightPanel: null,
    focusSensors: [],
  },
  events: [],

  pushEvent: (level, text) =>
    set((s) => ({ events: [{ id: eventId++, t: Date.now(), level, text }, ...s.events].slice(0, 40) })),

  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'day' ? 'night' : 'day';
      try {
        localStorage.setItem('peka-theme', theme);
      } catch {
        // storage unavailable (private mode) — theme still applies for this session
      }
      return { theme };
    }),

  toggleLayer: (u) => set((s) => ({ layers: { ...s.layers, [u]: !s.layers[u] } })),

  setHighlight: (u) => set((s) => ({ highlight: s.highlight === u ? null : u })),

  dispatchCrew: () => {
    const s = get();
    if (s.repair.status !== 'idle') return;
    set({ repair: { status: 'dispatched', progress: 0, repairProgress: 0 }, routeVisible: true });
    s.pushEvent('info', 'Crew W-3 dispatched to Sector B-12 — ETA 01:42:18');
  },

  flash: (key) => set((s) => ({ flashPanel: { key, n: (s.flashPanel?.n ?? 0) + 1 } })),

  resetScenario: (anomaly = 0) =>
    set({
      anomaly,
      forecastHours: 0,
      liveTime: anomaly > 0 ? 60 : 0,
      repair: { status: 'idle', progress: 0, repairProgress: 0 },
      routeVisible: false,
      selectedAsset: null,
      explainOpen: false,
    }),
}));

export const DEFAULT_DEMO_FLAGS = DEFAULT_FLAGS;
export const DEFAULT_DEMO_GATES = DEFAULT_GATES;

// ---- effective (demo-gated) selectors ------------------------------------------
export const selDetected = (s: AppState) => (s.demo.running ? s.demo.gates.alert : s.detected) && s.repair.status !== 'resolved';
export const selPlanStage = (s: AppState) => (s.demo.running ? s.demo.gates.plan : s.planStage);
export const selStage = (s: AppState): Stage => (s.demo.running ? s.demo.gates.stage : s.stage);
export const selRiskReady = (s: AppState) => (s.demo.running ? s.demo.gates.riskReady : true);
export const selPredicted = (s: AppState) => (s.demo.running ? s.demo.gates.predicted : s.confidence >= 60 && s.repair.status !== 'resolved');
