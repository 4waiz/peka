import { getEngine } from '../three/engineRef';
import {
  DEFAULT_DEMO_FLAGS,
  DEFAULT_DEMO_GATES,
  useAppStore,
  type AppState,
  type DemoGates,
  type DemoState,
  type Overlay,
} from '../store/useAppStore';
import type { DemoInputs } from '../three/TwinEngine';
import type { SensorKey } from './sensorEngine';
import { easeInOutCubic, easeInOutSine } from '../three/utils/random';

export interface DemoStep {
  id: string;
  title: string;
  duration: number;
  enter?: () => void;
  update?: (t: number, elapsed: number) => void;
}

const st = () => useAppStore.getState();
const setDemo = (d: Partial<DemoState>) => useAppStore.setState((s) => ({ demo: { ...s.demo, ...d } }));
const setFlags = (f: Partial<DemoInputs>) => useAppStore.setState((s) => ({ demo: { ...s.demo, flags: { ...s.demo.flags, ...f } } }));
const setGates = (g: Partial<DemoGates>) => useAppStore.setState((s) => ({ demo: { ...s.demo, gates: { ...s.demo.gates, ...g } } }));
const say = (narration: string, sub = '') => setDemo({ narration, sub });
const overlay = (o: Overlay) => setDemo({ overlay: o });
const focus = (keys: SensorKey[]) => setDemo({ focusSensors: keys });

/** Throttled continuous store writes (avoid re-rendering at 60 Hz). */
let lastWrite = 0;
function setContinuous(patch: Partial<AppState>, force = false) {
  const now = performance.now();
  if (!force && now - lastWrite < 45) return;
  lastWrite = now;
  useAppStore.setState(patch);
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'healthy',
    title: 'Healthy city',
    duration: 3.2,
    enter: () => {
      say('Monitoring 342 infrastructure assets…', 'All systems normal · 5 utility networks · 4 sectors');
      const e = getEngine();
      if (e) {
        e.flyToPreset('intro', 3.4).then(() => {
          if (st().demo.running && st().demo.step === 0) e.setAutoOrbit(true, 0.35);
        });
      }
    },
  },
  {
    id: 'anomaly',
    title: 'Sensor anomaly',
    duration: 4.2,
    enter: () => {
      say('Anomalous sensor pattern detected.', 'Water pressure −2.7% · Ground moisture +18% — Sector B-12 telemetry');
      focus(['pressure', 'moisture']);
      setGates({ stage: 'detect' });
      st().pushEvent('warn', 'Anomalous pressure gradient detected — Sector B-12');
    },
    update: (t) => setContinuous({ anomaly: 0.64 * easeInOutSine(t) }),
  },
  {
    id: 'correlation',
    title: 'AI correlation',
    duration: 5.0,
    enter: () => {
      say('Correlating pressure, moisture, demand and temperature telemetry…', 'Fusing 4 sensor streams from PS-B12-04 · MP-B12-11 · FM-B12-02 · TP-B12-07');
      focus(['pressure', 'moisture', 'consumption', 'temperature']);
      setFlags({ correlation: true });
      const e = getEngine();
      e?.setAutoOrbit(false);
      e?.flyToPreset('b12', 3.0);
    },
    update: (t) => {
      setContinuous({ anomaly: 0.64 + 0.36 * easeInOutSine(Math.min(1, t / 0.7)) });
      if (t > 0.45) {
        const v = Math.round(93 * easeInOutCubic(Math.min(1, (t - 0.45) / 0.4)));
        if (st().demo.overlay !== 'correlation') {
          overlay('correlation');
          st().pushEvent('critical', 'Telemetry correlation indicates probable pipe failure');
        }
        if (v !== st().demo.corrValue) setDemo({ corrValue: v });
        if (t > 0.86 && st().demo.narration.startsWith('Correlating')) say('Anomaly correlation: 93%', 'Signature consistent with a pressurised distribution-main leak');
      }
    },
  },
  {
    id: 'localize',
    title: 'Fault localization',
    duration: 3.6,
    enter: () => {
      overlay(null);
      setFlags({ correlation: false, localize: true });
      focus([]);
      say('Probable source localized: Sector B-12', 'Riverside District · primary water main WTR-B12-047');
      useAppStore.setState({ selectedSector: 'B-12' });
      getEngine()?.flyTo({ target: [-24, 0, 46], radius: 96, polar: 58, azimuth: 14, fov: 36 }, 3.2);
    },
  },
  {
    id: 'cutaway',
    title: 'Digital twin cutaway',
    duration: 5.6,
    enter: () => {
      say('Opening the digital twin — revealing underground utilities', 'Water network isolated · other systems dimmed');
      setFlags({ cutaway: true, emphasizeWater: true });
      useAppStore.setState({ selectedSector: null });
      const e = getEngine();
      if (e) {
        e.flyTo({ target: [36, -9.4, 70], radius: 34, polar: 70, azimuth: 26, fov: 40 }, 2.2).then(() => {
          if (st().demo.running && st().demo.step === 4) e.followWaterToLeak(3.6);
        });
      }
    },
  },
  {
    id: 'reveal',
    title: 'Leak reveal',
    duration: 4.8,
    enter: () => {
      say('Possible underground water leak', 'Confidence 93% · longitudinal crack on Ø900 mm ductile-iron main');
      setGates({ alert: true, stage: 'predict' });
      getEngine()?.flyToPreset('leak', 2.4);
      st().pushEvent('critical', 'Leak signature localized on WTR-B12-047 (depth 3.2 m)');
    },
    update: (t) => {
      const g = st().demo.gates;
      const v = 0.32 + 0.95 * easeInOutSine(Math.min(1, t / 0.6));
      if (Math.abs(g.leakScale - v) > 0.01) setGates({ leakScale: v });
    },
  },
  {
    id: 'forecast',
    title: 'Future simulation',
    duration: 5.6,
    enter: () => {
      say('Simulating infrastructure degradation…', 'Projecting pressure loss, soil saturation and pipe stress over 72 h');
      setGates({ predicted: true });
      getEngine()?.flyToPreset('underground', 5.2);
    },
    update: (t) => {
      let h: number;
      if (t < 0.42) h = 36 * easeInOutSine(t / 0.42);
      else if (t < 0.6) h = 36 + 6 * easeInOutSine((t - 0.42) / 0.18);
      else if (t < 0.78) h = 42 + 6 * easeInOutSine((t - 0.6) / 0.18);
      else h = 48;
      setContinuous({ forecastHours: h }, t >= 0.99);
      if (t > 0.5 && st().demo.overlay !== 'failure') {
        overlay('failure');
        say('Failure window narrowed to 36–52 hours', 'Pressure crosses the −12% failure threshold between +36 h and +52 h');
        st().pushEvent('critical', 'Failure window narrowed to 36–52 hours');
      }
    },
  },
  {
    id: 'impact',
    title: 'Impact analysis',
    duration: 5.2,
    enter: () => {
      overlay(null);
      say('12,400 residents potentially affected.', 'Hospital 320 m · School 480 m · Waterfront Avenue closure');
      setFlags({ cutaway: false, emphasizeWater: false, impact: true, blast: true });
      setGates({ plan: 1, stage: 'prioritize' });
      getEngine()?.flyToPreset('impact', 2.8);
      st().pushEvent('warn', 'Critical service proximity increases repair priority');
    },
    update: (t) => {
      const h = 48 * (1 - easeInOutSine(Math.min(1, t / 0.25)));
      if (st().forecastHours > 0) setContinuous({ forecastHours: h < 0.3 ? 0 : h }, h < 0.3);
    },
  },
  {
    id: 'prioritize',
    title: 'AI prioritization',
    duration: 4.8,
    enter: () => {
      overlay('prioritize');
      say('Ranking repairs by public impact, risk and cost', 'Prioritization model · 4 weighted factors');
      setGates({ riskReady: true });
      getEngine()?.setAutoOrbit(true, 0.5);
    },
    update: (t) => {
      const v = Math.min(1, t / 0.75);
      if (Math.abs(st().demo.scoreProgress - v) > 0.02 || v === 1) setDemo({ scoreProgress: v });
    },
  },
  {
    id: 'plan',
    title: 'Repair plan',
    duration: 5.0,
    enter: () => {
      overlay(null);
      setFlags({ impact: false, blast: false, localize: false });
      setGates({ plan: 2, stage: 'plan' });
      setDemo({ highlightPanel: 'repair' });
      say('Repair Plan #1 generated', 'Dispatch crew to Sector B-12 within 6 hours · lowest total impact');
      st().pushEvent('info', 'Repair Plan #1 generated — dispatch within 6 h recommended');
      const e = getEngine();
      e?.setAutoOrbit(false);
      e?.flyToPreset('final', 3.4);
      window.setTimeout(() => {
        if (st().demo.running) st().dispatchCrew();
      }, 1600);
    },
  },
];

export const DEMO_TOTAL = DEMO_STEPS.reduce((a, s) => a + s.duration, 0);

class DemoRunner {
  private raf = 0;
  private elapsed = 0;
  private last = 0;
  private stepIndex = -1;

  start() {
    this.stop(false);
    const e = getEngine();
    e?.cancelCamera();
    e?.resetCrew();
    useAppStore.setState((s) => ({
      anomaly: 0,
      forecastHours: 0,
      liveTime: 0,
      repair: { status: 'idle', progress: 0, repairProgress: 0 },
      routeVisible: false,
      selectedAsset: null,
      selectedSector: null,
      explainOpen: false,
      highlight: null,
      xray: false,
      view: '3d',
      nav: s.nav === 'twin' ? 'twin' : 'live',
      demo: {
        ...s.demo,
        running: true,
        completed: false,
        step: 0,
        total: DEMO_STEPS.length,
        stepProgress: 0,
        overlay: null,
        flags: { ...DEFAULT_DEMO_FLAGS },
        gates: { ...DEFAULT_DEMO_GATES, leakScale: 0.32 },
        corrValue: 0,
        scoreProgress: 0,
        highlightPanel: null,
        focusSensors: [],
        title: DEMO_STEPS[0].title,
        narration: '',
        sub: '',
      },
    }));
    st().pushEvent('info', 'AI simulation started — replaying Sector B-12 incident');
    this.elapsed = 0;
    this.stepIndex = -1;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(restore = true) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!restore) return;
    const wasRunning = st().demo.running;
    const e = getEngine();
    e?.setAutoOrbit(false);
    if (wasRunning) {
      e?.cancelCamera();
      e?.flyToPreset('overview', 2.2);
      useAppStore.setState((s) => ({
        anomaly: Math.max(s.anomaly, 1),
        forecastHours: 0,
        liveTime: 60,
        selectedSector: null,
        demo: { ...s.demo, running: false, overlay: null, flags: { ...DEFAULT_DEMO_FLAGS }, focusSensors: [], highlightPanel: null },
      }));
    }
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!st().demo.running) return;
    this.elapsed += dt;
    let acc = 0;
    let idx = DEMO_STEPS.length;
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (this.elapsed < acc + DEMO_STEPS[i].duration) {
        idx = i;
        break;
      }
      acc += DEMO_STEPS[i].duration;
    }
    if (idx >= DEMO_STEPS.length) {
      this.finish();
      return;
    }
    const step = DEMO_STEPS[idx];
    if (idx !== this.stepIndex) {
      // make sure skipped updates land on their final state
      if (this.stepIndex >= 0) DEMO_STEPS[this.stepIndex].update?.(1, DEMO_STEPS[this.stepIndex].duration);
      this.stepIndex = idx;
      setDemo({ step: idx, title: step.title, stepProgress: 0 });
      step.enter?.();
    }
    const local = (this.elapsed - acc) / step.duration;
    step.update?.(local, this.elapsed - acc);
    const sp = Math.round(local * 50) / 50;
    if (sp !== st().demo.stepProgress) setDemo({ stepProgress: sp });
    this.raf = requestAnimationFrame(this.tick);
  };

  private finish() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    DEMO_STEPS[DEMO_STEPS.length - 1].update?.(1, 0);
    useAppStore.setState((s) => ({
      anomaly: 1,
      forecastHours: 0,
      liveTime: 60,
      demo: { ...s.demo, running: false, completed: true, overlay: 'final', stepProgress: 1, flags: { ...DEFAULT_DEMO_FLAGS }, focusSensors: [] },
    }));
    setTimeout(() => {
      useAppStore.setState((s) => ({ demo: { ...s.demo, highlightPanel: null } }));
    }, 4000);
  }

  /** Jump to the next step (presenter control). */
  skip() {
    if (!st().demo.running) return;
    let acc = 0;
    for (let i = 0; i <= this.stepIndex; i++) acc += DEMO_STEPS[i].duration;
    this.elapsed = acc + 0.001;
  }
}

export const demoRunner = new DemoRunner();
