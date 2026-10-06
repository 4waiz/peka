import { ArrowRight, Check, ChartLine, ClipboardCheck, ListOrdered, ScanSearch } from 'lucide-react';
import { selStage, useAppStore, type Stage } from '../store/useAppStore';

const ORDER: Stage[] = ['monitoring', 'detect', 'predict', 'prioritize', 'plan', 'repair', 'resolved'];

const CARDS = [
  {
    key: 'detect' as Stage,
    title: 'Detect',
    tone: 'blue',
    icon: ScanSearch,
    text: 'Spots unusual patterns in live sensor data.',
    flash: 'sensors',
  },
  {
    key: 'predict' as Stage,
    title: 'Predict',
    tone: 'purple',
    icon: ChartLine,
    text: 'Finds where it will fail, and when.',
    flash: 'timeline',
  },
  {
    key: 'prioritize' as Stage,
    title: 'Prioritize',
    tone: 'orange',
    icon: ListOrdered,
    text: 'Ranks repairs by impact, risk and cost.',
    flash: 'risk',
  },
  {
    key: 'plan' as Stage,
    title: 'Plan',
    tone: 'green',
    icon: ClipboardCheck,
    text: 'Builds the repair plan and sends a crew.',
    flash: 'repair',
  },
];

export function Workflow() {
  const stage = useAppStore(selStage);
  const flash = useAppStore((s) => s.flash);
  const si = ORDER.indexOf(stage);
  return (
    <div className="panel workflow">
      <div className="panel-head">
        <span className="panel-title">
          Predict <ArrowRight size={13} className="inline-arrow" /> Prevent <ArrowRight size={13} className="inline-arrow" /> Repair
        </span>
        <span className="panel-meta">{stage === 'monitoring' ? 'Monitoring' : stage === 'resolved' ? 'Incident closed' : stage === 'repair' ? 'Crew deployed' : 'AI pipeline active'}</span>
      </div>
      <div className="wf-cards">
        {CARDS.map((c, i) => {
          const ci = ORDER.indexOf(c.key);
          const state = si > ci || stage === 'repair' || stage === 'resolved' ? 'done' : si === ci ? 'active' : 'pending';
          const Icon = c.icon;
          return (
            <div key={c.key} className="wf-cell">
              <button className={`wf-card tone-${c.tone} is-${state}`} onClick={() => flash(c.flash)}>
                <div className="wf-top">
                  <span className="wf-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="wf-icon">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="wf-title">{c.title}</span>
                  <span className="wf-state">{state === 'done' ? <Check size={13} strokeWidth={2.4} /> : state === 'active' ? <i className="wf-live" /> : null}</span>
                </div>
                <p className="wf-text">{c.text}</p>
                <div className="wf-bar">
                  <div />
                </div>
              </button>
              {i < CARDS.length - 1 && <ArrowRight size={16} className={`wf-arrow ${si > ci ? 'is-lit' : ''}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
