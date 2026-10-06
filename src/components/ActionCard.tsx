import { ArrowRight, Banknote, Check, CheckCircle2, Construction, Hospital, Sparkles, Truck, Users, Wrench } from 'lucide-react';
import { CREW_ETA_SIM_SECONDS, selDetected, selPlanStage, useAppStore } from '../store/useAppStore';
import { setNav } from '../store/actions';

function fmtEta(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const STATS = [
  { icon: Users, label: 'People affected', value: '~12,400', tone: 'warn' },
  { icon: Hospital, label: 'Critical facilities', value: 'Hospital 320 m', tone: 'warn' },
  { icon: Construction, label: 'Road closures', value: 'Medium', tone: 'warn' },
  { icon: Banknote, label: 'Estimated cost', value: '$120–250K', tone: '' },
];

const WHY = [
  'Prevents a major main burst (93% confidence)',
  'Minimal disruption to traffic and residents',
  'Closest repair crew available (18 min)',
  'Lower cost than an emergency repair',
];

function Dispatch() {
  const repair = useAppStore((s) => s.repair);
  const dispatch = useAppStore((s) => s.dispatchCrew);
  if (repair.status === 'idle') {
    return (
      <button className="act-cta" onClick={dispatch}>
        <Truck size={17} strokeWidth={1.8} />
        <span>Dispatch crew to B-12</span>
        <em>within 6 h</em>
        <ArrowRight size={16} />
      </button>
    );
  }
  if (repair.status === 'dispatched') {
    return (
      <div className="act-status is-go">
        <Truck size={18} strokeWidth={1.8} />
        <div>
          <b>Crew dispatched</b>
          <span>
            ETA <i>{fmtEta(CREW_ETA_SIM_SECONDS * (1 - repair.progress))}</i> <small>sim ×220</small>
          </span>
          <div className="bar">
            <div style={{ width: `${repair.progress * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }
  if (repair.status === 'onsite' || repair.status === 'repairing') {
    const p = repair.status === 'onsite' ? 0 : repair.repairProgress;
    return (
      <div className="act-status is-work">
        <Wrench size={18} strokeWidth={1.8} />
        <div>
          <b>{repair.status === 'onsite' ? 'Crew on site' : `Repairing · ${Math.round(p * 100)}%`}</b>
          <span>{repair.status === 'onsite' ? 'Closing valves WV-776 / WV-781' : 'Replacing a 6 m section of the main'}</span>
          <div className="bar">
            <div style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="act-status is-done">
      <CheckCircle2 size={18} strokeWidth={1.8} />
      <div>
        <b>Repaired</b>
        <span>Pressure restored · failure prevented</span>
      </div>
    </div>
  );
}

/** Second card: what the AI recommends doing about it. */
export function ActionCard() {
  const planStage = useAppStore(selPlanStage);
  const detected = useAppStore(selDetected);
  const anomaly = useAppStore((s) => s.anomaly);
  const repair = useAppStore((s) => s.repair.status);
  const highlight = useAppStore((s) => s.demo.highlightPanel === 'repair');

  const hasImpact = planStage >= 1 || repair !== 'idle';
  const hasPlan = planStage >= 2 || repair !== 'idle';

  return (
    <section className={`card action ${highlight ? 'is-highlight' : ''}`}>
      <div className="card-head">
        <h3>
          <Sparkles size={15} strokeWidth={1.8} /> AI Recommended Action
        </h3>
        <button className="link-btn" onClick={() => setNav('repair')}>
          View alternatives <ArrowRight size={13} />
        </button>
      </div>

      {!hasImpact ? (
        <div className="act-empty">
          {detected || anomaly > 0.04 ? (
            <>
              <div className="skel w70" />
              <div className="skel w90" />
              <div className="skel w50" />
              <p>Assessing impact and repair options…</p>
            </>
          ) : (
            <>
              <CheckCircle2 size={22} strokeWidth={1.6} />
              <b>No action needed</b>
              <p>A plan appears here the moment P.E.K.A. finds a risk.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="plan-box">
            <div className="pb-head">
              <b>Repair Plan #1</b>
              <span className="pill pill-ok">Recommended</span>
              <span className="pb-tag">Lowest total impact</span>
            </div>
            <div className="pb-stats">
              {STATS.map(({ icon: Icon, label, value, tone }) => (
                <div key={label} className="pb-stat">
                  <Icon size={18} strokeWidth={1.6} />
                  <span>{label}</span>
                  <b className={tone}>{value}</b>
                </div>
              ))}
            </div>
            {hasPlan ? <Dispatch /> : <div className="act-optimising">Optimising the repair plan…</div>}
          </div>
          <div className="why">
            <h4>Why this plan?</h4>
            <ul>
              {WHY.map((w) => (
                <li key={w}>
                  <span className="why-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
