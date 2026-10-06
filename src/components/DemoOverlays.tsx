import { Activity, Droplets, RotateCcw, Thermometer, Waves, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { closeFinal, skipDemoStep, startDemo, stopDemo } from '../store/actions';
import { DEMO_STEPS } from '../simulation/demoSequence';
import { PRIORITY_FACTORS } from '../simulation/riskEngine';

export function NarrationBar() {
  const running = useAppStore((s) => s.demo.running);
  const step = useAppStore((s) => s.demo.step);
  const sp = useAppStore((s) => s.demo.stepProgress);
  const narration = useAppStore((s) => s.demo.narration);
  const sub = useAppStore((s) => s.demo.sub);
  if (!running) return null;
  return (
    <div className="narration" key={narration}>
      <div className="nar-top">
        <span className="nar-step">
          {String(step + 1).padStart(2, '0')} / {DEMO_STEPS.length}
        </span>
        <span className="nar-title">{DEMO_STEPS[step]?.title}</span>
        <div className="nar-dots">
          {DEMO_STEPS.map((s, i) => (
            <i key={s.id} className={i < step ? 'done' : i === step ? 'cur' : ''}>
              {i === step && <b style={{ width: `${sp * 100}%` }} />}
            </i>
          ))}
        </div>
        <button className="nar-btn" onClick={skipDemoStep} title="Next step (→)">
          Next
        </button>
        <button className="nar-btn" onClick={stopDemo} title="Stop (Space)">
          Stop
        </button>
      </div>
      <div className="nar-text">{narration}</div>
      {sub && <div className="nar-sub">{sub}</div>}
    </div>
  );
}

const SIGNALS = [
  { icon: Droplets, label: 'Pressure', value: '−2.7%' },
  { icon: Waves, label: 'Moisture', value: '+18%' },
  { icon: Activity, label: 'Demand', value: '+9%' },
  { icon: Thermometer, label: 'Temperature', value: '+4%' },
];

function CorrelationHUD() {
  const v = useAppStore((s) => s.demo.corrValue);
  return (
    <div className="hud hud-corr">
      <div className="hud-signals">
        {SIGNALS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="hud-sig" style={{ animationDelay: `${i * 0.12}s` }}>
              <Icon size={14} />
              <span>{s.label}</span>
              <b>{s.value}</b>
            </div>
          );
        })}
      </div>
      <svg className="hud-merge" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden>
        {[37, 112, 188, 263].map((x, i) => (
          <path key={i} d={`M${x} 0 C ${x} 22, 150 18, 150 40`} />
        ))}
      </svg>
      <div className="hud-label">Anomaly Correlation</div>
      <div className="hud-value">{v}%</div>
      <div className="hud-note">Multi-signal leak signature · Sector B-12</div>
    </div>
  );
}

function FailureHUD() {
  const hours = useAppStore((s) => s.forecastHours);
  return (
    <div className="hud hud-fail">
      <div className="hud-label">Estimated Failure</div>
      <div className="hud-value">36–52 HOURS</div>
      <div className="hud-note">Simulated horizon +{Math.round(hours)} h · pressure −12% threshold</div>
    </div>
  );
}

function PrioritizationHUD() {
  const p = useAppStore((s) => s.demo.scoreProgress);
  const final = Math.round(87 * Math.min(1, Math.max(0, (p - 0.55) / 0.45)));
  return (
    <div className="hud hud-prio">
      <div className="hud-label">AI Prioritization</div>
      <div className="prio-rows">
        {PRIORITY_FACTORS.map((f, i) => {
          const local = Math.min(1, Math.max(0, (p - i * 0.12) / 0.45));
          const val = Math.round(f.value * local);
          return (
            <div key={f.key} className="prio-row">
              <div className="prio-top">
                <span>{f.label}</span>
                <b>{val}</b>
              </div>
              <div className="prio-bar">
                <div style={{ width: `${val}%` }} />
              </div>
              <div className="prio-note">{f.note}</div>
            </div>
          );
        })}
      </div>
      <div className="prio-final">
        <span>Final Risk</span>
        <b>
          {final}
          <small>/100</small>
        </b>
      </div>
    </div>
  );
}

function FinalBanner() {
  return (
    <div className="final-wrap">
      <div className="final">
        <button className="final-close" onClick={closeFinal} aria-label="Close">
          <X size={16} />
        </button>
        <div className="final-kicker">Early Detection</div>
        <div className="final-big">36–52 hours before failure</div>
        <div className="final-tag">
          <span>Predict.</span>
          <span>Prevent.</span>
          <span>Repair.</span>
        </div>
        <div className="final-stats">
          <div>
            <b>342</b>
            <span>assets monitored</span>
          </div>
          <div>
            <b>4</b>
            <span>signals fused</span>
          </div>
          <div>
            <b>93%</b>
            <span>AI confidence</span>
          </div>
          <div>
            <b>6 h</b>
            <span>dispatch SLA</span>
          </div>
        </div>
        <div className="final-actions">
          <button className="sim-btn" onClick={startDemo}>
            <RotateCcw size={14} /> Replay Simulation
          </button>
          <button className="ghost-btn" onClick={closeFinal}>
            Explore the twin
          </button>
        </div>
      </div>
    </div>
  );
}

export function DemoOverlays() {
  const overlay = useAppStore((s) => s.demo.overlay);
  if (overlay === 'correlation') return <CorrelationHUD />;
  if (overlay === 'failure') return <FailureHUD />;
  if (overlay === 'prioritize') return <PrioritizationHUD />;
  if (overlay === 'final') return <FinalBanner />;
  return null;
}
