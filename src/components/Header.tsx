import { useEffect, useRef, useState } from 'react';
import { Boxes, ChartColumn, FileText, Keyboard, Maximize, MonitorDot, Moon, Play, RotateCcw, SkipForward, Square, Sun, Wrench } from 'lucide-react';
import { useAppStore, type NavKey } from '../store/useAppStore';
import { resetLiveMonitoring, setNav, skipDemoStep, startDemo, stopDemo } from '../store/actions';
import { DEMO_STEPS } from '../simulation/demoSequence';

const NAV: { key: NavKey; label: string; icon: typeof Boxes }[] = [
  { key: 'live', label: 'Live Monitor', icon: MonitorDot },
  { key: 'twin', label: 'Digital Twin', icon: Boxes },
  { key: 'analytics', label: 'Analytics', icon: ChartColumn },
  { key: 'repair', label: 'Repair Plan', icon: Wrench },
  { key: 'reports', label: 'Reports', icon: FileText },
];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="live-pill" title="Telemetry stream status">
      <span className="live-dot" />
      <span className="live-label">LIVE</span>
      <span className="live-time">{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
    </div>
  );
}

function SimButton() {
  const running = useAppStore((s) => s.demo.running);
  const completed = useAppStore((s) => s.demo.completed);
  const step = useAppStore((s) => s.demo.step);
  const sp = useAppStore((s) => s.demo.stepProgress);
  if (running) {
    const total = DEMO_STEPS.length;
    const pct = ((step + sp) / total) * 100;
    return (
      <div className="sim-running" role="group" aria-label="AI simulation running">
        <div className="sim-running-text">
          <span className="sim-step">
            STEP {String(step + 1).padStart(2, '0')}/{total}
          </span>
          <span className="sim-title">{DEMO_STEPS[step]?.title}</span>
        </div>
        <div className="sim-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className="icon-btn" onClick={skipDemoStep} title="Next step">
          <SkipForward size={14} />
        </button>
        <button className="icon-btn danger" onClick={stopDemo} title="Stop simulation (Space)">
          <Square size={12} fill="currentColor" />
        </button>
      </div>
    );
  }
  return (
    <button className="sim-btn" onClick={startDemo} title="Run the scripted AI incident simulation (Space)">
      {completed ? <RotateCcw size={14} /> : <Play size={13} fill="currentColor" />}
      <span>{completed ? 'Replay Simulation' : 'Run AI Simulation'}</span>
    </button>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const toggle = useAppStore((s) => s.toggleTheme);
  const day = theme === 'day';
  return (
    <button className="theme-toggle" onClick={toggle} title={day ? 'Switch to night mode (T)' : 'Switch to day mode (T)'} aria-label="Toggle day and night mode">
      <span className={`tt-opt ${!day ? 'is-on' : ''}`}>
        <Moon size={13} strokeWidth={1.8} />
      </span>
      <span className={`tt-opt ${day ? 'is-on' : ''}`}>
        <Sun size={13} strokeWidth={1.8} />
      </span>
    </button>
  );
}

function OperatorMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
    setOpen(false);
  };
  return (
    <div className="operator" ref={ref}>
      <button className={`avatar ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Operator menu">
        JD
      </button>
      {open && (
        <div className="menu">
          <div className="menu-head">
            <div className="avatar small">JD</div>
            <div>
              <div className="menu-name">J. Doe</div>
              <div className="menu-role">Shift Supervisor · Municipal Operations</div>
            </div>
          </div>
          <button className="menu-item" onClick={fullscreen}>
            <Maximize size={14} /> Toggle fullscreen <kbd>F</kbd>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              useAppStore.setState({ shortcutsOpen: true });
              setOpen(false);
            }}
          >
            <Keyboard size={14} /> Keyboard shortcuts <kbd>?</kbd>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              resetLiveMonitoring();
              setOpen(false);
            }}
          >
            <RotateCcw size={14} /> Reset to live monitoring
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const nav = useAppStore((s) => s.nav);
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 32 32">
            <path d="M5 27V14l6-3.5V27M13 27V6l7 3.5V27M22 27V15l5 2.5V27" />
            <path d="M3 27h26" />
            <circle cx="16.5" cy="22" r="1.4" className="dot" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">
            P<i>.</i>E<i>.</i>K<i>.</i>A<i>.</i>
          </div>
          <div className="brand-sub">Predictive Emulator for Kinetic Assessments</div>
        </div>
        <div className="brand-sep" />
        <div className="brand-tag">
          The City That Heals Itself.
          <span>AI Infrastructure Guardian</span>
        </div>
      </div>

      <div className="header-right">
        <LiveClock />
        <SimButton />
        <nav className="nav" aria-label="Primary">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${nav === key ? 'is-active' : ''}`} onClick={() => setNav(key)}>
              <Icon size={15} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <ThemeToggle />
        <OperatorMenu />
      </div>
    </header>
  );
}
