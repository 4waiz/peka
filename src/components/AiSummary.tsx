import { ArrowRight, Sparkles } from 'lucide-react';
import { selStage, useAppStore, type Stage } from '../store/useAppStore';
import { setNav } from '../store/actions';

const COPY: Record<Stage, { tag: string; tone: 'ok' | 'warn' | 'crit' | 'info'; title: string; body: string }> = {
  monitoring: {
    tag: 'All clear',
    tone: 'ok',
    title: 'The city is healthy',
    body: 'Watching 342 underground assets — water, power, data, cooling and sewage — in real time.',
  },
  detect: {
    tag: 'Detecting',
    tone: 'warn',
    title: 'Something looks unusual',
    body: 'Water pressure is dropping while the soil gets wetter near Sector B-12. Checking if the signals are related.',
  },
  predict: {
    tag: 'Leak found',
    tone: 'crit',
    title: 'A water main is leaking',
    body: 'A Ø900 mm main under Riverside District is cracked. Left alone, it could burst in 36–52 hours.',
  },
  prioritize: {
    tag: 'High priority',
    tone: 'crit',
    title: '12,400 people and a hospital nearby',
    body: 'A burst would cut water to the district and a hospital 320 m away, so this repair goes first.',
  },
  plan: {
    tag: 'Plan ready',
    tone: 'info',
    title: 'Send a crew within 6 hours',
    body: 'Isolate the main and replace a 6 m section — the lowest cost and least disruption.',
  },
  repair: {
    tag: 'Repairing',
    tone: 'info',
    title: 'Crew W-3 is on it',
    body: 'Valves close to isolate the main, then the damaged section is replaced. Residents keep their water.',
  },
  resolved: {
    tag: 'Fixed early',
    tone: 'ok',
    title: 'Prevented ~40 h before failure',
    body: 'Pressure is back to normal. The city healed itself before anyone noticed a problem.',
  },
};

/** One plain-language sentence about what the AI sees right now. */
export function AiSummary() {
  const stage = useAppStore(selStage);
  const c = COPY[stage];
  return (
    <div className={`panel ai-summary tone-${c.tone}`}>
      <div className="panel-head">
        <span className="panel-title">
          <Sparkles size={13} strokeWidth={1.8} /> AI Summary
        </span>
        <span className="ais-tag">{c.tag}</span>
      </div>
      <div className="ais-body" key={stage}>
        <div className="ais-title">{c.title}</div>
        <p className="ais-text">{c.body}</p>
      </div>
      <button className="link-btn ais-link" onClick={() => setNav('reports')}>
        Event log &amp; report <ArrowRight size={13} />
      </button>
    </div>
  );
}
