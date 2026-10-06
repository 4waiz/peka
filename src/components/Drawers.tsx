import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Download, LocateFixed, Printer, Route, Truck, X } from 'lucide-react';
import { selDetected, useAppStore, type NavKey } from '../store/useAppStore';
import { focusLeak, selectSector, setNav } from '../store/actions';
import { SECTORS, UTILITIES, UTILITY_ORDER, type UtilityId } from '../simulation/infrastructureData';
import { Sparkline } from './Sparkline';
import { formatReading, type SensorKey } from '../simulation/sensorEngine';
import { riskLevel } from '../simulation/riskEngine';

function Drawer({ nav, title, sub, children }: { nav: NavKey; title: string; sub: string; children: React.ReactNode }) {
  return (
    <aside className="drawer" aria-label={title}>
      <div className="drawer-head">
        <div>
          <div className="drawer-title">{title}</div>
          <div className="drawer-sub">{sub}</div>
        </div>
        <button className="icon-btn" onClick={() => setNav(nav)} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

const NETWORK_ASSETS: Record<UtilityId, number> = { water: 74, electricity: 92, telecom: 68, cooling: 48, sewage: 60 };
const NETWORK_HEALTH: Record<UtilityId, number> = { water: 98.2, electricity: 97.4, telecom: 99.1, cooling: 96.8, sewage: 95.9 };

function AnalyticsDrawer() {
  const detected = useAppStore(selDetected);
  const risk = useAppStore((s) => s.risk);
  const history = useAppStore((s) => s.history);
  const readings = useAppStore((s) => s.readings);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const b12 = detected && !resolved;
  const series: { key: SensorKey; label: string; color: string; span: number }[] = [
    { key: 'pressure', label: 'Water pressure', color: '#28a9ff', span: 1.2 },
    { key: 'moisture', label: 'Ground moisture', color: '#2ee6a0', span: 4 },
    { key: 'consumption', label: 'Consumption', color: '#ff9a3c', span: 3 },
    { key: 'temperature', label: 'Temperature', color: '#9c67ff', span: 1.5 },
  ];
  return (
    <Drawer nav="analytics" title="Network Analytics" sub="Sector health, utility status and telemetry trends">
      <div className="kpis">
        <div className="kpi">
          <b>342</b>
          <span>Assets monitored</span>
        </div>
        <div className="kpi">
          <b className={b12 ? 'bad' : 'good'}>{b12 ? 1 : 0}</b>
          <span>Active incidents</span>
        </div>
        <div className="kpi">
          <b>41 h</b>
          <span>Mean detection lead</span>
        </div>
        <div className="kpi">
          <b>{b12 ? '96.1' : '97.6'}%</b>
          <span>Network health</span>
        </div>
      </div>

      <div className="d-section">Sector health</div>
      <table className="d-table">
        <thead>
          <tr>
            <th>Sector</th>
            <th>District</th>
            <th>Assets</th>
            <th>Health</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {SECTORS.map((s) => {
            const lvl = s.id === 'B-12' && b12 ? riskLevel(risk) : s.baseRisk;
            const health = s.id === 'B-12' && b12 ? 71.4 : s.health;
            return (
              <tr key={s.id} onClick={() => selectSector(s.id)} className="is-clickable">
                <td>
                  <b>{s.id}</b>
                </td>
                <td>{s.district}</td>
                <td>{s.assets}</td>
                <td>
                  <div className="cell-bar">
                    <div className={health < 80 ? 'bad' : 'good'} style={{ width: `${health}%` }} />
                    <span>{health.toFixed(1)}%</span>
                  </div>
                </td>
                <td>
                  <span className={`pill pill-${lvl === 'low' ? 'ok' : lvl}`}>{lvl}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="d-section">Utility networks</div>
      <div className="net-rows">
        {UTILITY_ORDER.map((u) => {
          const spec = UTILITIES[u];
          const anomalies = u === 'water' && b12 ? 1 : 0;
          const health = u === 'water' && b12 ? 94.8 : NETWORK_HEALTH[u];
          return (
            <div key={u} className="net-row" style={{ ['--c' as string]: spec.color }}>
              <i />
              <span className="nr-name">{spec.full}</span>
              <span className="nr-meta">{NETWORK_ASSETS[u]} assets</span>
              <span className="nr-meta">{health.toFixed(1)}% health</span>
              <span className={`pill ${anomalies ? 'pill-high' : 'pill-ok'}`}>{anomalies ? '1 anomaly' : 'nominal'}</span>
            </div>
          );
        })}
      </div>

      <div className="d-section">Telemetry — Sector B-12</div>
      <div className="trend-grid">
        {series.map((s) => (
          <div key={s.key} className="trend">
            <div className="trend-top">
              <span>{s.label}</span>
              <b>{formatReading(s.key, readings)}</b>
            </div>
            <Sparkline data={history[s.key]} color={s.color} width={228} height={54} minSpan={s.span} />
          </div>
        ))}
      </div>
      <p className="d-note">Detection model: multi-signal anomaly correlation (prototype). Figures are simulated for demonstration.</p>
    </Drawer>
  );
}

const STEPS = [
  { t: '00:00', d: '25 min', title: 'Isolate main', text: 'Close valves WV-776 (downstream) and WV-781 (upstream); reroute supply via the Z-28 loop.' },
  { t: '00:25', d: '40 min', title: 'Traffic management', text: 'Single-lane closure on Waterfront Avenue between X-52 and X-17.' },
  { t: '01:05', d: '3 h', title: 'Excavate & expose', text: 'Vacuum excavation to 3.4 m; shore trench; dewater around WTR-B12-047.' },
  { t: '04:05', d: '4 h', title: 'Replace segment', text: 'Cut out 6 m of Ø900 ductile iron; install new segment with restrained couplings.' },
  { t: '08:05', d: '2 h', title: 'Test & disinfect', text: 'Hydrostatic pressure test at 1.5× working pressure; chlorination and flushing.' },
  { t: '10:05', d: '3 h', title: 'Reinstate', text: 'Backfill, compact and resurface; reopen lane; restore normal valve configuration.' },
];

function RepairPlanDrawer() {
  const repair = useAppStore((s) => s.repair);
  const dispatch = useAppStore((s) => s.dispatchCrew);
  const routeVisible = useAppStore((s) => s.routeVisible);
  return (
    <Drawer nav="repair" title="Repair Plan #1 · WO-2026-1047" sub="Sector B-12 · Riverside District · Priority P1 · SLA 6 h">
      <div className="plans">
        <div className="plan is-rec">
          <div className="plan-top">
            <b>Plan #1 — Segment replacement</b>
            <span className="badge badge-rec">Recommended</span>
          </div>
          <div className="plan-grid">
            <span>Cost</span>
            <b>$120K – $250K</b>
            <span>Duration</span>
            <b>13 h</b>
            <span>Disruption</span>
            <b className="ok">Low</b>
            <span>Residual risk</span>
            <b className="ok">2%</b>
          </div>
        </div>
        <div className="plan">
          <div className="plan-top">
            <b>Plan #2 — Repair clamp + monitor</b>
          </div>
          <div className="plan-grid">
            <span>Cost</span>
            <b>$35K</b>
            <span>Duration</span>
            <b>5 h</b>
            <span>Disruption</span>
            <b className="ok">Minimal</b>
            <span>Residual risk</span>
            <b className="warn">38%</b>
          </div>
        </div>
        <div className="plan">
          <div className="plan-top">
            <b>Plan #3 — Defer to scheduled works</b>
          </div>
          <div className="plan-grid">
            <span>Cost now</span>
            <b>$0</b>
            <span>Failure risk</span>
            <b className="bad">93% in 52 h</b>
            <span>Disruption</span>
            <b className="bad">Severe</b>
            <span>Est. damage</span>
            <b className="bad">$1.4M</b>
          </div>
        </div>
      </div>

      <div className="d-section">Work sequence</div>
      <ol className="steps">
        {STEPS.map((s, i) => {
          const done = repair.status === 'resolved' || (repair.status === 'repairing' && repair.repairProgress > (i + 1) / STEPS.length);
          return (
            <li key={s.title} className={done ? 'is-done' : ''}>
              <span className="step-t">{s.t}</span>
              <div>
                <div className="step-title">
                  {done && <CheckCircle2 size={13} />} {s.title} <em>{s.d}</em>
                </div>
                <div className="step-text">{s.text}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="d-section">Crew &amp; equipment</div>
      <div className="crew-box">
        <div>
          <b>Crew W-3</b> · 6 technicians · supervisor on call
        </div>
        <div>Vacuum excavator · 18 t excavator · shoring kit · 900 mm restrained couplings ×2 · temporary bypass</div>
        <div>Nearest available · 18 min from depot (C-3)</div>
      </div>

      <div className="drawer-actions">
        <button className="primary-btn" onClick={dispatch} disabled={repair.status !== 'idle'}>
          <Truck size={14} /> {repair.status === 'idle' ? 'Dispatch Crew W-3' : repair.status === 'resolved' ? 'Completed' : 'Crew Dispatched'}
        </button>
        <button className={`ghost-btn ${routeVisible ? 'is-active' : ''}`} onClick={() => useAppStore.setState({ routeVisible: !routeVisible })}>
          <Route size={14} /> {routeVisible ? 'Hide' : 'Show'} repair route
        </button>
        <button className="ghost-btn" onClick={focusLeak}>
          <LocateFixed size={14} /> Locate breach
        </button>
      </div>
    </Drawer>
  );
}

function buildReport() {
  const s = useAppStore.getState();
  const r = s.readings;
  const lines = [
    '# Incident Report — INC-B12-2026-1006',
    '',
    `Generated: ${new Date().toLocaleString('en-GB')}`,
    'System: P.E.K.A. — Predictive Emulator for Kinetic Assessments',
    '',
    '## Summary',
    'Possible underground water leak on primary water main WTR-B12-047 (Ø900 mm ductile iron, depth 3.2 m), Sector B-12 — Riverside District.',
    `AI confidence ${Math.max(s.confidence, 93)}%. Estimated failure window 36–52 hours. Risk score ${s.risk}/100.`,
    '',
    '## Telemetry at time of report',
    `- Water pressure: ${formatReading('pressure', r)}`,
    `- Ground moisture: ${formatReading('moisture', r)}`,
    `- Consumption anomaly: ${formatReading('consumption', r)}`,
    `- Temperature anomaly: ${formatReading('temperature', r)}`,
    `- Network integrity: ${formatReading('integrity', r)}`,
    `- Assets online: ${formatReading('assets', r)}`,
    '',
    '## Impact',
    '- Population affected: ~12,400',
    '- Nearby hospital: 320 m · Nearby school: 480 m',
    '- Road closure impact: Medium (Waterfront Avenue)',
    '- Estimated cost: $120K – $250K · Predicted damage: Medium–High',
    '',
    '## Recommendation',
    'Repair Plan #1 — dispatch Crew W-3 to Sector B-12 within 6 hours; isolate WV-776 / WV-781 and replace a 6 m segment.',
    `Current status: ${s.repair.status}.`,
    '',
    '## Event log',
    ...[...s.events].reverse().map((e) => `- ${new Date(e.t).toLocaleTimeString('en-GB', { hour12: false })} [${e.level}] ${e.text}`),
    '',
    '_Prototype simulation — values are generated for demonstration._',
  ];
  return lines.join('\n');
}

function ReportsDrawer() {
  const events = useAppStore((s) => s.events);
  const risk = useAppStore((s) => s.risk);
  const confidence = useAppStore((s) => s.confidence);
  const status = useAppStore((s) => s.repair.status);
  const [copied, setCopied] = useState(false);
  const download = () => {
    const blob = new Blob([buildReport()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'INC-B12-2026-1006.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Drawer nav="reports" title="Incident Report · INC-B12-2026-1006" sub="Auto-generated from twin state and the AI event log">
      <div className="report">
        <div className="report-grid">
          <span>Asset</span>
          <b>WTR-B12-047 · Primary Water Main</b>
          <span>Location</span>
          <b>Sector B-12 · Riverside District</b>
          <span>Classification</span>
          <b>Water distribution pipe leak</b>
          <span>AI confidence</span>
          <b>{Math.max(confidence, 93)}%</b>
          <span>Risk score</span>
          <b className="bad">{risk}/100</b>
          <span>Failure window</span>
          <b>36–52 hours</b>
          <span>Status</span>
          <b className={status === 'resolved' ? 'ok' : 'warn'}>{status === 'idle' ? 'Awaiting dispatch' : status}</b>
        </div>
        <div className="d-section">Event timeline</div>
        <ul className="event-list in-drawer">
          {events.slice(0, 16).map((e) => (
            <li key={e.id} className={`event level-${e.level}`}>
              <span className="event-time">{new Date(e.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
              <span className="event-dot" />
              <span className="event-text">{e.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="drawer-actions">
        <button className="primary-btn" onClick={download}>
          <Download size={14} /> Download report (.md)
        </button>
        <button className="ghost-btn" onClick={copy}>
          <ClipboardCopy size={14} /> {copied ? 'Copied' : 'Copy summary'}
        </button>
        <button className="ghost-btn" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>
    </Drawer>
  );
}

export function Drawers() {
  const nav = useAppStore((s) => s.nav);
  if (nav === 'analytics') return <AnalyticsDrawer />;
  if (nav === 'repair') return <RepairPlanDrawer />;
  if (nav === 'reports') return <ReportsDrawer />;
  return null;
}
