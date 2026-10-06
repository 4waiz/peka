/**
 * Approximate risk scoring for the prototype. Normalised telemetry signals are
 * combined with a critical-asset proximity weight. The weights are
 * illustrative (tuned so the reference scenario lands at 87/100) — they are
 * not a validated engineering model.
 */
import type { Readings } from './sensorEngine';
import type { RiskLevel } from './infrastructureData';

export const RISK_WEIGHTS = {
  pressureDrop: 0.28,
  moisture: 0.27,
  consumption: 0.17,
  temperature: 0.1,
  criticalAsset: 0.18,
};

/** Explainability: contribution of each signal to the leak classification. */
export const CONTRIBUTIONS = [
  { key: 'moisture', label: 'Ground moisture increase', value: 31 },
  { key: 'pressure', label: 'Pressure decrease', value: 27 },
  { key: 'consumption', label: 'Consumption anomaly', value: 21 },
  { key: 'temperature', label: 'Temperature anomaly', value: 12 },
  { key: 'history', label: 'Historical pattern match', value: 9 },
] as const;

/** Prioritisation factors shown during the AI ranking step. */
export const PRIORITY_FACTORS = [
  { key: 'impact', label: 'Public Impact', value: 92, note: '12,400 residents · hospital 320 m' },
  { key: 'probability', label: 'Failure Probability', value: 93, note: 'Telemetry correlation 93%' },
  { key: 'critical', label: 'Critical Infrastructure', value: 88, note: 'Primary main · Ø900 mm' },
  { key: 'feasibility', label: 'Repair Feasibility', value: 81, note: 'Crew W-3 available · 18 min' },
] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function computeRisk(r: Readings, anomaly: number, hours: number) {
  const P = clamp01(-r.pressure / 3);
  const M = clamp01(r.moisture / 20);
  const C = clamp01(r.consumption / 10);
  const T = clamp01(r.temperature / 5);
  const K = 0.8 * clamp01(anomaly * 1.2);
  const w = RISK_WEIGHTS;
  const base = 100 * (w.pressureDrop * P + w.moisture * M + w.consumption * C + w.temperature * T + w.criticalAsset * K);
  return Math.round(Math.min(99, Math.max(7, base + anomaly * Math.max(0, hours) * 0.2)));
}

export function computeConfidence(anomaly: number) {
  if (anomaly < 0.16) return 0;
  const t = clamp01((anomaly - 0.16) / 0.84);
  return Math.round(38 + 55 * (t * t * (3 - 2 * t)));
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function leakSeverity(anomaly: number, hours: number, repair: number) {
  if (anomaly < 0.05) return 0;
  const a = anomaly * (1 - repair);
  const s = 0.08 + 0.42 * ((a - 0.05) / 0.95) + 0.5 * Math.pow(Math.max(0, hours) / 72, 0.8) * a;
  return Math.min(1, Math.max(0, s));
}
