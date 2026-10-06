import { useEffect, useRef, useState } from 'react';
import { selRiskReady, useAppStore } from '../store/useAppStore';
import { showAffectedArea } from '../store/actions';
import { riskLevel } from '../simulation/riskEngine';

/** Smoothly animates a displayed number toward its target. */
function useAnimatedNumber(target: number, speed = 2.6) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cur.current += (target - cur.current) * (1 - Math.exp(-speed * dt));
      if (Math.abs(target - cur.current) < 0.3) cur.current = target;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return v;
}

export function RiskGauge() {
  const risk = useAppStore((s) => s.risk);
  const ready = useAppStore(selRiskReady);
  const blast = useAppStore((s) => s.blast);
  const flash = useAppStore((s) => (s.flashPanel?.key === 'risk' ? s.flashPanel.n : 0));
  const shown = useAnimatedNumber(ready ? risk : 0, ready ? 2.2 : 6);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!flash || !ref.current) return;
    ref.current.classList.remove('flash');
    void ref.current.offsetWidth;
    ref.current.classList.add('flash');
  }, [flash]);

  const level = riskLevel(risk);
  const R = 46;
  const C = 2 * Math.PI * R;
  const frac = Math.min(1, shown / 100);
  const label = !ready ? 'Assessing…' : level === 'high' ? 'High Risk' : level === 'medium' ? 'Medium Risk' : 'Low Risk';

  return (
    <button ref={ref} className={`panel risk-gauge level-${ready ? level : 'pending'} ${blast ? 'is-active' : ''}`} onClick={showAffectedArea} title="Show predicted affected area in the twin">
      <div className="panel-head">
        <span className="panel-title">Risk Score</span>
      </div>
      <div className="gauge">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} className="gauge-track" />
          {!ready && <circle cx="60" cy="60" r={R} className="gauge-spin" strokeDasharray="6 10" />}
          <circle
            cx="60"
            cy="60"
            r={R}
            className="gauge-value"
            style={{ stroke: level === 'low' ? 'var(--ok)' : level === 'medium' ? 'var(--warn)' : 'var(--crit)' }}
            strokeDasharray={`${C * frac} ${C}`}
            transform="rotate(-90 60 60)"
          />
          {/* tick marks every 10 points */}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            return <line key={i} x1={60 + Math.cos(a) * 54} y1={60 + Math.sin(a) * 54} x2={60 + Math.cos(a) * 57} y2={60 + Math.sin(a) * 57} className="gauge-tick" />;
          })}
        </svg>
        <div className="gauge-center">
          <div className="gauge-num">{ready ? Math.round(shown) : '--'}</div>
          <div className="gauge-den">/100</div>
        </div>
      </div>
      <div className="gauge-label">{label}</div>
    </button>
  );
}
