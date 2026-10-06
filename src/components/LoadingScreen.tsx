import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { whenEngine } from '../three/engineRef';

const STEPS = ['Loading City Geometry', 'Connecting Sensor Network', 'Loading Utility Infrastructure', 'Initializing Prediction Engine'];

export function LoadingScreen() {
  const entered = useAppStore((s) => s.entered);
  const [done, setDone] = useState(0);
  const [built, setBuilt] = useState(false);
  const [compiled, setCompiled] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(
    () =>
      whenEngine((e) => {
        setBuilt(true);
        e.ready.then(() => setCompiled(true));
      }),
    [],
  );

  // step 1 waits for the scene graph, the last step for GPU programs
  useEffect(() => {
    if (done >= STEPS.length) return;
    if (done === 0 && !built) return;
    if (done === STEPS.length - 1 && !compiled) return;
    const id = setTimeout(() => setDone((d) => d + 1), done === 0 ? 300 : 380);
    return () => clearTimeout(id);
  }, [done, built, compiled]);

  const ready = done >= STEPS.length;

  const enter = () => {
    if (!ready || useAppStore.getState().entered) return;
    useAppStore.setState({ entered: true });
    const push = useAppStore.getState().pushEvent;
    push('ok', 'Digital twin synchronised — 342 assets online');
    push('info', 'All systems operational · live telemetry streaming');
  };

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!entered) return;
    const id = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(id);
  }, [entered]);

  if (gone) return null;

  return (
    <div className={`loading ${entered ? 'is-leaving' : ''}`}>
      <div className="loading-grid" />
      <div className="loading-card">
        <div className="loading-mark">
          <svg viewBox="0 0 32 32">
            <path d="M5 27V14l6-3.5V27M13 27V6l7 3.5V27M22 27V15l5 2.5V27" />
            <path d="M3 27h26" />
          </svg>
        </div>
        <div className="loading-name">
          P<i>.</i>E<i>.</i>K<i>.</i>A<i>.</i>
        </div>
        <div className="loading-full">Predictive Emulator for Kinetic Assessments</div>
        <div className="loading-tag">AI Infrastructure Guardian · The City That Heals Itself.</div>

        <div className="loading-status">{ready ? 'Digital twin ready' : 'Initializing Digital Twin…'}</div>
        <div className="loading-bar">
          <div style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </div>
        <ul className="loading-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < done ? 'is-done' : i === done ? 'is-active' : ''}>
              <span className="ls-icon">{i < done ? <Check size={12} strokeWidth={3} /> : <i />}</span>
              {s}
            </li>
          ))}
        </ul>
        <div className={`loading-assets ${ready ? 'is-visible' : ''}`}>
          <b>342</b> ASSETS CONNECTED
        </div>
        <button className={`enter-btn ${ready ? 'is-visible' : ''}`} onClick={enter} disabled={!ready}>
          Enter Digital Twin <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
