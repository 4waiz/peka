import { ArrowDown, ArrowUp, CheckCircle2, CircleHelp, Clock3, Minus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { formatReading, isAnomalous, readingValue, type SensorKey } from '../simulation/sensorEngine';

const SIGNALS: { key: SensorKey; label: string; note?: string }[] = [
  { key: 'pressure', label: 'Pressure', note: 'vs. normal' },
  { key: 'moisture', label: 'Ground moisture' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'temperature', label: 'Temperature' },
];

/** First card of the story column: what is happening right now. */
export function IncidentCard() {
  const detected = useAppStore(selDetected);
  const readings = useAppStore((s) => s.readings);
  const confidence = useAppStore((s) => s.confidence);
  const anomaly = useAppStore((s) => s.anomaly);
  const repair = useAppStore((s) => s.repair.status);
  const forecast = useAppStore((s) => s.forecastHours);
  const focus = useAppStore((s) => s.demo.focusSensors);

  const resolved = repair === 'resolved';
  const state = resolved ? 'resolved' : detected ? 'alert' : anomaly > 0.04 ? 'watch' : 'healthy';

  const head = {
    healthy: { icon: <ShieldCheck />, title: 'All systems healthy', sub: 'Riverside City · 342 assets online' },
    watch: { icon: <TriangleAlert />, title: 'Unusual readings', sub: 'Riverside District – Sector B-12' },
    alert: { icon: <span className="ic-bang">!</span>, title: 'Possible Water Leak', sub: 'Riverside District – Sector B-12' },
    resolved: { icon: <CheckCircle2 />, title: 'Leak repaired', sub: 'Fixed about 40 hours before failure' },
  }[state];

  return (
    <section className={`card incident is-${state}`}>
      <div className="ic-head">
        <div className="ic-icon">{head.icon}</div>
        <div className="ic-titles">
          <h2>{head.title}</h2>
          <p>{head.sub}</p>
        </div>
        {(state === 'alert' || state === 'watch') && (
          <div className="ic-conf">
            <b>{state === 'alert' ? Math.max(confidence, 60) : Math.max(confidence, 12)}%</b>
            <span>Confidence</span>
          </div>
        )}
      </div>

      <div className="ic-signals">
        {SIGNALS.map((s) => {
          const v = readingValue(readings, s.key);
          const bad = isAnomalous(s.key, v) && !resolved;
          const Arrow = Math.abs(v) < 0.5 ? Minus : v > 0 ? ArrowUp : ArrowDown;
          return (
            <div key={s.key} className={`sig ${bad ? 'is-bad' : ''} ${focus.includes(s.key) ? 'is-focus' : ''}`}>
              <div className="sig-val">
                <Arrow size={14} strokeWidth={2.2} />
                {formatReading(s.key, readings).replace(/^[+−]/, '')}
              </div>
              <div className="sig-label">{s.label}</div>
              {s.note && <div className="sig-note">{s.note}</div>}
            </div>
          );
        })}
      </div>

      {state === 'alert' && (
        <div className="ic-fail">
          <Clock3 size={22} strokeWidth={1.8} />
          <div>
            <span>{forecast > 0.5 ? `Simulating +${Math.round(forecast)} h · estimated failure` : 'Estimated failure time'}</span>
            <b>36 – 52 hours</b>
          </div>
          <button className="ic-why" onClick={() => useAppStore.setState({ explainOpen: true })} title="Why was this flagged?">
            <CircleHelp size={15} /> Why?
          </button>
        </div>
      )}
      {state === 'watch' && (
        <div className="ic-watch">
          <div className="ic-watch-top">
            <span>AI is correlating the signals…</span>
            <b>{Math.max(confidence, 12)}%</b>
          </div>
          <div className="bar">
            <div style={{ width: `${Math.max(confidence, 12)}%` }} />
          </div>
        </div>
      )}
      {state === 'healthy' && <div className="ic-ok">AI is watching water, power, data, cooling and sewage in real time.</div>}
      {state === 'resolved' && <div className="ic-ok">Pressure is back to normal — the city healed itself before anyone noticed.</div>}
    </section>
  );
}
