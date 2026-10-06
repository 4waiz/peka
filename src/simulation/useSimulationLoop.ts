import { useEffect } from 'react';
import { CREW_TRAVEL_SECONDS, REPAIR_SECONDS, useAppStore, type Stage } from '../store/useAppStore';
import { SENSOR_KEYS, readingValue, targetReadings, type Readings } from './sensorEngine';
import { computeConfidence, computeRisk, leakSeverity } from './riskEngine';
import { TOTAL_ASSETS } from './infrastructureData';

const TICK_MS = 200;

/** Live-monitoring schedule: calm for ~2 s, then the leak signature develops. */
export function liveAnomaly(t: number) {
  if (t < 2) return 0;
  const x = Math.min(1, (t - 2) / 38);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function stageFor(conf: number, anomaly: number): Stage {
  if (anomaly < 0.03) return 'monitoring';
  if (conf < 60) return 'detect';
  if (anomaly < 0.8) return 'predict';
  if (anomaly < 0.95) return 'prioritize';
  return 'plan';
}

type NoiseKey = 'pressure' | 'moisture' | 'consumption' | 'temperature' | 'integrity';
const NOISE_AMP: Record<NoiseKey, number> = { pressure: 0.07, moisture: 0.45, consumption: 0.25, temperature: 0.12, integrity: 0.04 };

/**
 * Drives the sensor engine: computes target readings from the scenario state,
 * adds slowly re-sampled bounded noise (values tick e.g. -2.7 → -2.8 → -2.7
 * every few seconds), updates sparkline history, risk, confidence, leak
 * severity, workflow stage, repair progress and the AI event log.
 */
export function useSimulationLoop() {
  useEffect(() => {
    let last = performance.now();
    let histAcc = 0;
    let noiseAcc = 99;
    const noise: Record<NoiseKey, number> = { pressure: 0, moisture: 0, consumption: 0, temperature: 0, integrity: 0 };
    const noiseTarget: Record<NoiseKey, number> = { ...noise };
    const fired = new Set<string>();
    let onsiteTimer = 0;

    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const s = useAppStore.getState();
      if (!s.entered) return;
      const demo = s.demo.running;
      const push = s.pushEvent;

      // scenario reset (healthy again) → re-arm event thresholds
      if (s.anomaly === 0 && s.repair.status === 'idle') fired.clear();

      // ---- repair progression ------------------------------------------------
      let repair = s.repair;
      if (repair.status === 'dispatched') {
        const progress = Math.min(1, repair.progress + dt / CREW_TRAVEL_SECONDS);
        repair = { ...repair, progress };
        if (progress >= 1) {
          repair = { ...repair, status: 'onsite' };
          onsiteTimer = 0;
          push('ok', 'Crew W-3 on site — isolating valves WV-776 / WV-781');
        }
      } else if (repair.status === 'onsite') {
        onsiteTimer += dt;
        if (onsiteTimer > 2.5) {
          repair = { ...repair, status: 'repairing' };
          push('info', 'Valves closed · excavation and segment replacement started');
        }
      } else if (repair.status === 'repairing') {
        const rp = Math.min(1, repair.repairProgress + dt / REPAIR_SECONDS);
        repair = { ...repair, repairProgress: rp };
        if (rp >= 1) {
          repair = { ...repair, status: 'resolved' };
          push('ok', 'Repair complete — Sector B-12 pressure restored, network healthy');
        }
      }
      const repairFactor = repair.status === 'repairing' ? repair.repairProgress * 0.9 : repair.status === 'resolved' ? 1 : 0;

      // ---- live anomaly schedule ------------------------------------------------
      let anomaly = s.anomaly;
      let liveTime = s.liveTime;
      if (!demo && repair.status === 'idle') {
        liveTime += dt;
        anomaly = Math.max(anomaly, liveAnomaly(liveTime));
      }

      // ---- readings with slow bounded noise -----------------------------------
      noiseAcc += dt;
      const ramping = Math.abs(anomaly - s.anomaly) > 0.0005 || demo;
      if (noiseAcc > (ramping ? 0.8 : 2.6)) {
        noiseAcc = 0;
        for (const k of Object.keys(noise) as NoiseKey[]) noiseTarget[k] = (Math.random() * 2 - 1) * NOISE_AMP[k];
      }
      for (const k of Object.keys(noise) as NoiseKey[]) noise[k] += (noiseTarget[k] - noise[k]) * Math.min(1, dt * 6);
      const tgt = targetReadings(anomaly, s.forecastHours, repairFactor);
      const readings: Readings = {
        pressure: tgt.pressure + noise.pressure,
        moisture: Math.max(0, tgt.moisture + noise.moisture),
        consumption: tgt.consumption + noise.consumption,
        temperature: tgt.temperature + noise.temperature,
        integrity: Math.min(100, tgt.integrity + noise.integrity),
        assetsOnline: tgt.assetsOnline,
        assetsTotal: TOTAL_ASSETS,
      };

      histAcc += dt;
      let history = s.history;
      if (histAcc > (demo ? 0.3 : 1.5)) {
        histAcc = 0;
        // history always records *actual* telemetry, never the forecast view
        const now = s.forecastHours > 0 ? targetReadings(anomaly, 0, repairFactor) : tgt;
        const actual: Readings = {
          ...now,
          pressure: now.pressure + noise.pressure,
          moisture: Math.max(0, now.moisture + noise.moisture),
          consumption: now.consumption + noise.consumption,
          temperature: now.temperature + noise.temperature,
          integrity: Math.min(100, now.integrity + noise.integrity),
        };
        history = { ...history };
        for (const k of SENSOR_KEYS) history[k] = [...history[k].slice(1), readingValue(actual, k)];
      }

      const effA = anomaly * (1 - repairFactor);
      const confidence = computeConfidence(effA);
      const risk = computeRisk(readings, effA, s.forecastHours);
      const sev = leakSeverity(anomaly, s.forecastHours, repairFactor) * (demo ? s.demo.gates.leakScale : 1);
      const detected = confidence >= 60;
      let stage = stageFor(confidence, effA);
      if (repair.status === 'dispatched' || repair.status === 'onsite' || repair.status === 'repairing') stage = 'repair';
      if (repair.status === 'resolved') stage = 'resolved';
      const planStage: 0 | 1 | 2 = effA >= 0.97 ? 2 : effA >= 0.8 ? 1 : 0;

      // ---- AI event log (live mode) --------------------------------------------
      if (!demo && repair.status === 'idle') {
        const once = (key: string, cond: boolean, level: 'info' | 'warn' | 'critical' | 'ok', text: string) => {
          if (cond && !fired.has(key)) {
            fired.add(key);
            push(level, text);
          }
        };
        once('dev', anomaly > 0.05, 'warn', `Pressure deviation ${readings.pressure.toFixed(1)}% at PS-B12-04`);
        once('grad', confidence >= 38, 'warn', 'Anomalous pressure gradient detected — Sector B-12');
        once('moist', readings.moisture > 6, 'warn', `Soil moisture rising at MP-B12-11 (+${Math.round(readings.moisture)}%)`);
        once('corr', detected, 'critical', 'Telemetry correlation indicates probable pipe failure — WTR-B12-047');
        once('window', effA >= 0.8, 'critical', 'Failure window narrowed to 36–52 hours');
        once('prox', effA >= 0.9, 'warn', 'Critical service proximity increases repair priority');
        once('plan', planStage === 2, 'info', 'Repair Plan #1 generated — dispatch within 6 h recommended');
      }

      useAppStore.setState({
        anomaly,
        liveTime,
        readings,
        history,
        confidence,
        risk,
        leakSeverity: sev,
        detected,
        stage,
        planStage,
        repair,
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
}
