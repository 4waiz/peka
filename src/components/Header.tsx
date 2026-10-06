import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Keyboard, Maximize, Moon, Play, RotateCcw, Search, SkipForward, Square, Sun } from 'lucide-react';
import { useAppStore, type NavKey } from '../store/useAppStore';
import { focusAsset, resetLiveMonitoring, selectSector, setNav, skipDemoStep, startDemo, stopDemo } from '../store/actions';
import { DEMO_STEPS } from '../simulation/demoSequence';
import { FACILITIES, SECTORS, UTILITIES, VALVES } from '../simulation/infrastructureData';
import { getEngine } from '../three/engineRef';

const NAV: { key: NavKey; label: string }[] = [
  { key: 'live', label: 'Live Monitor' },
  { key: 'twin', label: 'Digital Twin' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'repair', label: 'Repair Plan' },
  { key: 'reports', label: 'Reports' },
];

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
            {String(step + 1).padStart(2, '0')}/{total}
          </span>
          <span className="sim-title">{DEMO_STEPS[step]?.title}</span>
        </div>
        <div className="sim-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className="icon-btn" onClick={skipDemoStep} title="Next step (→)">
          <SkipForward size={14} />
        </button>
        <button className="icon-btn danger" onClick={stopDemo} title="Stop (Space)">
          <Square size={11} fill="currentColor" />
        </button>
      </div>
    );
  }
  return (
    <button className="sim-btn" onClick={startDemo} title="45-second guided story of how P.E.K.A. catches a leak (Space)">
      {completed ? <RotateCcw size={14} /> : <Play size={13} fill="currentColor" />}
      <span>{completed ? 'Replay simulation' : 'Run AI simulation'}</span>
    </button>
  );
}

interface Hit {
  id: string;
  label: string;
  sub: string;
  go: () => void;
}

function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo<Hit[]>(() => {
    const W = UTILITIES.water;
    return [
      ...SECTORS.map((s) => ({ id: s.id, label: `Sector ${s.id}`, sub: s.district, go: () => selectSector(s.id) })),
      { id: 'WTR-B12-047', label: 'WTR-B12-047', sub: 'Primary water main · leak', go: () => focusAsset('WTR-B12-047') },
      { id: 'FS-3381', label: 'FS-3381', sub: 'Flow sensor', go: () => getEngine()?.focusPoint(-11, W.depth, W.conduits[0].z + 1.6, 16) },
      ...VALVES.map((v) => ({ id: v.id, label: v.id, sub: 'Isolation valve', go: () => getEngine()?.focusPoint(v.x, W.depth + 1, W.conduits[0].z + 1.6, 16) })),
      ...FACILITIES.map((f) => ({ id: f.id, label: f.name, sub: f.short, go: () => getEngine()?.focusPoint(f.position[0], 4, f.position[2], 70) })),
    ];
  }, []);
  const hits = q.trim() ? items.filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : items.slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (h: Hit) => {
    h.go();
    setQ('');
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="search" ref={ref}>
      <Search size={15} />
      <input
        value={q}
        placeholder="Search sector, asset or facility…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) pick(hits[0]);
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="search-list">
          {hits.map((h) => (
            <li key={h.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
                <b>{h.label}</b>
                <span>{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notifications() {
  const events = useAppStore((s) => s.events);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const unread = events.filter((e) => e.id > seen && (e.level === 'critical' || e.level === 'warn')).length;
  useEffect(() => {
    if (!open) return;
    setSeen(events[0]?.id ?? 0);
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, events]);
  return (
    <div className="notif" ref={ref}>
      <button className={`hdr-icon ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell size={17} strokeWidth={1.7} />
        {unread > 0 && <i className="notif-badge">{unread}</i>}
      </button>
      {open && (
        <div className="menu notif-menu">
          <div className="notif-head">Notifications</div>
          <ul>
            {events.slice(0, 6).map((e) => (
              <li key={e.id} className={`event level-${e.level}`}>
                <span className="event-time">{new Date(e.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
                <span className="event-dot" />
                <span className="event-text">{e.text}</span>
              </li>
            ))}
            {events.length === 0 && <li className="notif-empty">No notifications yet</li>}
          </ul>
          <button
            className="menu-item"
            onClick={() => {
              setNav('reports');
              setOpen(false);
            }}
          >
            Open full event log
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const toggle = useAppStore((s) => s.toggleTheme);
  const day = theme === 'day';
  return (
    <button className="theme-toggle" onClick={toggle} title={day ? 'Night mode (T)' : 'Day mode (T)'} aria-label="Toggle day and night mode">
      <span className={`tt-opt ${day ? 'is-on' : ''}`}>
        <Sun size={14} strokeWidth={1.8} />
      </span>
      <span className={`tt-opt ${!day ? 'is-on' : ''}`}>
        <Moon size={13} strokeWidth={1.8} />
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
          <div className="brand-sub">The City That Heals Itself</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV.map(({ key, label }) => (
          <button key={key} className={`nav-item ${nav === key ? 'is-active' : ''}`} onClick={() => setNav(key)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="header-right">
        <SearchBox />
        <SimButton />
        <Notifications />
        <ThemeToggle />
        <OperatorMenu />
      </div>
    </header>
  );
}
