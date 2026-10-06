import { useEffect, useRef } from 'react';
import { Banknote, CheckCircle2, ChevronRight, CircleHelp, Construction, HardHat, Hospital, Leaf, MapPin, Route, School, TrendingUp, Truck, Users, Wrench } from 'lucide-react';
import { CREW_ETA_SIM_SECONDS, selDetected, selPlanStage, useAppStore } from '../store/useAppStore';
import { setNav } from '../store/actions';

function fmtEta(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const ROWS = [
  { icon: Users, label: 'Population affected', value: '~12,400 people', tone: '' },
  { icon: Hospital, label: 'Nearby hospital', value: '320 m', tone: '' },
  { icon: School, label: 'Nearby school', value: '480 m', tone: '' },
  { icon: Construction, label: 'Road closure impact', value: 'Medium', tone: 'warn' },
  { icon: HardHat, label: 'Crew availability', value: 'Available', tone: 'ok' },
  { icon: Banknote, label: 'Estimated cost', value: '$120K – $250K', tone: '' },
  { icon: TrendingUp, label: 'Predicted damage', value: 'Medium–High', tone: 'warn' },
];

function DispatchCTA() {
  const repair = useAppStore((s) => s.repair);
  const dispatch = useAppStore((s) => s.dispatchCrew);
  if (repair.status === 'idle') {
    return (
      <button className="cta" onClick={dispatch}>
        <Wrench size={22} strokeWidth={1.8} />
        <span className="cta-text">
          Dispatch crew to Sector B-12
          <br />
          within 6 hours.
        </span>
        <ChevronRight size={18} />
      </button>
    );
  }
  if (repair.status === 'dispatched') {
    const eta = CREW_ETA_SIM_SECONDS * (1 - repair.progress);
    return (
      <div className="cta is-dispatched">
        <Truck size={22} strokeWidth={1.8} />
        <div className="cta-text">
          <div className="cta-status">Crew Dispatched</div>
          <div className="cta-eta">
            Crew ETA: <b>{fmtEta(eta)}</b> <span className="sim-speed">SIM ×220</span>
          </div>
          <div className="cta-progress">
            <div style={{ width: `${repair.progress * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }
  if (repair.status === 'onsite' || repair.status === 'repairing') {
    const p = repair.status === 'onsite' ? 0 : repair.repairProgress;
    return (
      <div className="cta is-repairing">
        <Wrench size={22} strokeWidth={1.8} />
        <div className="cta-text">
          <div className="cta-status">{repair.status === 'onsite' ? 'Crew On Site' : 'Repair In Progress'}</div>
          <div className="cta-eta">{repair.status === 'onsite' ? 'Isolating valves WV-776 / WV-781' : `Replacing 6 m main segment · ${Math.round(p * 100)}%`}</div>
          <div className="cta-progress">
            <div style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="cta is-resolved">
      <CheckCircle2 size={22} strokeWidth={1.8} />
      <div className="cta-text">
        <div className="cta-status">Resolved</div>
        <div className="cta-eta">Pressure restored · failure prevented ~40 h early</div>
      </div>
    </div>
  );
}

export function RepairPanel() {
  const planStage = useAppStore(selPlanStage);
  const detected = useAppStore(selDetected);
  const confidence = useAppStore((s) => s.confidence);
  const anomaly = useAppStore((s) => s.anomaly);
  const repair = useAppStore((s) => s.repair.status);
  const highlight = useAppStore((s) => s.demo.highlightPanel === 'repair');
  const flash = useAppStore((s) => (s.flashPanel?.key === 'repair' ? s.flashPanel.n : 0));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash || !ref.current) return;
    ref.current.classList.remove('flash');
    void ref.current.offsetWidth;
    ref.current.classList.add('flash');
  }, [flash]);

  const resolved = repair === 'resolved';
  const showRows = planStage >= 1 || repair !== 'idle';
  const showPlan = planStage >= 2 || repair !== 'idle';

  return (
    <div ref={ref} className={`panel repair-panel ${highlight ? 'is-highlight' : ''}`}>
      <div className="panel-head">
        <span className="panel-title">Repair Plan #1</span>
        {showPlan ? (
          <span className={`badge ${resolved ? 'badge-ok' : 'badge-rec'}`}>
            <Leaf size={12} /> {resolved ? 'Completed' : 'Recommended'}
          </span>
        ) : (
          <span className="badge badge-muted">{anomaly > 0.03 ? 'Assessing' : 'Standby'}</span>
        )}
      </div>

      <div className="repair-loc">
        <MapPin size={20} className="loc-pin" />
        <div>
          <div className="loc-name">Sector B-12</div>
          <div className="loc-district">Riverside District</div>
        </div>
        {showPlan && !resolved && <span className="loc-sla">SLA 6 h</span>}
      </div>

      {showPlan ? (
        <DispatchCTA />
      ) : (
        <div className="cta is-pending">
          <div className="pending-head">
            <span>{detected || anomaly > 0.03 ? 'AI assessment in progress' : 'No active incidents'}</span>
            <span className="pending-val">{anomaly > 0.03 ? `${confidence}%` : '342/342'}</span>
          </div>
          <div className="cta-progress">
            <div style={{ width: `${anomaly > 0.03 ? Math.max(6, confidence) : 100}%` }} />
          </div>
          <div className="pending-sub">
            {anomaly > 0.03 ? (showRows ? 'Impact analysed · optimising repair plan…' : 'Correlating telemetry to localise the fault…') : 'All monitored assets operating within normal limits.'}
          </div>
        </div>
      )}

      <ul className={`impact-rows ${showRows ? '' : 'is-empty'}`}>
        {ROWS.map((r, i) => {
          const Icon = r.icon;
          let value = r.value;
          let tone = r.tone;
          if (r.label === 'Crew availability' && repair !== 'idle') {
            value = resolved ? 'Released' : 'Assigned · W-3';
            tone = resolved ? 'ok' : 'info';
          }
          return (
            <li key={r.label} style={{ transitionDelay: `${i * 60}ms` }}>
              <Icon size={15} strokeWidth={1.8} className="row-icon" />
              <span className="row-label">{r.label}</span>
              <span className={`row-value ${tone}`}>{showRows ? value : '—'}</span>
            </li>
          );
        })}
      </ul>

      <div className="repair-links">
        <button className="link-btn" onClick={() => useAppStore.setState({ explainOpen: true })} disabled={!detected && repair === 'idle'}>
          <CircleHelp size={13} /> Why was this flagged?
        </button>
        <button className="link-btn" onClick={() => setNav('repair')}>
          <Route size={13} /> View plan details <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
