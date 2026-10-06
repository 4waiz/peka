/**
 * Local telemetry simulation. Readings are derived from a single anomaly
 * progress value (0 = healthy, 1 = fully developed leak signature), the
 * forecast horizon (hours ahead the twin is simulating) and repair progress.
 * Each signal follows its own onset curve so the anomaly unfolds in a
 * physically plausible order: pressure & moisture first, then demand and
 * temperature. Small bounded noise keeps the feed "live" without wild jumps.
 *
 * This is a prototype simulation for demonstration — not a validated model.
 */
import { TOTAL_ASSETS } from './infrastructureData';

export type SensorKey = 'pressure' | 'moisture' | 'consumption' | 'temperature' | 'integrity' | 'assets';

export interface Readings {
  pressure: number;
  moisture: number;
  consumption: number;
  temperature: number;
  integrity: number;
  assetsOnline: number;
  assetsTotal: number;
}

export const SENSOR_KEYS: SensorKey[] = ['pressure', 'moisture', 'consumption', 'temperature', 'integrity', 'assets'];

const sstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pressure forecast scenarios (k chosen so the -12% threshold is hit at 36 / 43 / 52 h). */
export const FORECAST_K = { pessimistic: 0.043, mean: 0.033, optimistic: 0.0248 };
export const FAILURE_THRESHOLD = -12;
export const FAILURE_WINDOW: [number, number] = [36, 52];

export function forecastPressure(hours: number, base: number, k = FORECAST_K.mean, scale = 1) {
  return base - scale * k * Math.pow(Math.max(0, hours), 1.5);
}

export function targetReadings(p: number, hours: number, repair: number): Readings {
  const a = p * (1 - repair);
  const ep = sstep(0.0, 0.62, a);
  const em = sstep(0.04, 0.7, a);
  const ec = sstep(0.28, 0.95, a);
  const et = sstep(0.4, 1.0, a);
  const h = Math.max(0, hours) * a;
  const pressureNow = -2.7 * ep;
  return {
    pressure: hours > 0 ? forecastPressure(hours, pressureNow, FORECAST_K.mean, a) : pressureNow,
    moisture: 18 * em + h * 0.32,
    consumption: 9 * ec + h * 0.1,
    temperature: 4 * et + h * 0.04,
    integrity: 99.6 - 0.9 * sstep(0.1, 1, a) - h * 0.015,
    assetsOnline: hours >= FAILURE_WINDOW[1] && a > 0.9 ? TOTAL_ASSETS - 1 : TOTAL_ASSETS,
    assetsTotal: TOTAL_ASSETS,
  };
}

const NOISE: Record<Exclude<SensorKey, 'assets'>, number> = {
  pressure: 0.06,
  moisture: 0.35,
  consumption: 0.18,
  temperature: 0.09,
  integrity: 0.03,
};

/** Add bounded, mean-reverting noise on top of the target values. */
export function jitter(target: Readings, prev: Readings | null, strength = 1): Readings {
  const n = (k: keyof typeof NOISE) => (Math.random() * 2 - 1) * NOISE[k] * strength;
  const mix = (k: keyof typeof NOISE) => {
    const t = target[k] + n(k);
    if (!prev) return t;
    // pull toward target, never more than ~2 noise steps away
    const v = prev[k] + (t - prev[k]) * 0.65;
    return Math.abs(v - target[k]) > NOISE[k] * 2 ? target[k] + Math.sign(v - target[k]) * NOISE[k] * 2 : v;
  };
  return {
    pressure: mix('pressure'),
    moisture: mix('moisture'),
    consumption: mix('consumption'),
    temperature: mix('temperature'),
    integrity: Math.min(100, mix('integrity')),
    assetsOnline: target.assetsOnline,
    assetsTotal: target.assetsTotal,
  };
}

export function readingValue(r: Readings, k: SensorKey) {
  switch (k) {
    case 'pressure':
      return r.pressure;
    case 'moisture':
      return r.moisture;
    case 'consumption':
      return r.consumption;
    case 'temperature':
      return r.temperature;
    case 'integrity':
      return r.integrity;
    case 'assets':
      return r.assetsOnline;
  }
}

export function isAnomalous(k: SensorKey, v: number) {
  switch (k) {
    case 'pressure':
      return v < -1.0;
    case 'moisture':
      return v > 5;
    case 'consumption':
      return v > 3;
    case 'temperature':
      return v > 1.5;
    case 'integrity':
      return v < 97.5;
    case 'assets':
      return v < TOTAL_ASSETS;
  }
}

export function formatReading(k: SensorKey, r: Readings) {
  const v = readingValue(r, k);
  const signed = (x: number, d: number) => {
    const rounded = Number(x.toFixed(d));
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${sign}${Math.abs(rounded).toFixed(d)}%`;
  };
  switch (k) {
    case 'pressure':
      return signed(v, 1);
    case 'moisture':
    case 'consumption':
    case 'temperature':
      return signed(v, 0);
    case 'integrity':
      return `${v.toFixed(1)}%`;
    case 'assets':
      return `${r.assetsOnline} / ${r.assetsTotal}`;
  }
}

/** Initial healthy history for sparklines. */
export function seedHistory(n = 32): Record<SensorKey, number[]> {
  const base = targetReadings(0, 0, 0);
  const out = {} as Record<SensorKey, number[]>;
  for (const k of SENSOR_KEYS) {
    out[k] = Array.from({ length: n }, () => readingValue(jitter(base, null, 0.8), k));
  }
  return out;
}
