import { Check } from 'lucide-react';
import { selStage, useAppStore, type Stage } from '../store/useAppStore';

const ORDER: Stage[] = ['monitoring', 'detect', 'predict', 'prioritize', 'plan', 'repair', 'resolved'];
const STEPS: { key: Stage; label: string }[] = [
  { key: 'detect', label: 'Detect' },
  { key: 'predict', label: 'Predict' },
  { key: 'prioritize', label: 'Prioritize' },
  { key: 'plan', label: 'Plan' },
  { key: 'repair', label: 'Repair' },
];

/** Compact Detect → Predict → Prioritize → Plan → Repair progress over the twin. */
export function WorkflowStepper() {
  const stage = useAppStore(selStage);
  const si = ORDER.indexOf(stage);
  return (
    <ol className="stepper" aria-label="AI pipeline progress">
      {STEPS.map((s, i) => {
        const ci = ORDER.indexOf(s.key);
        const state = si > ci || stage === 'resolved' ? 'done' : si === ci ? 'active' : 'todo';
        return (
          <li key={s.key} className={`st-${state}`}>
            <span className="st-dot">{state === 'done' ? <Check size={10} strokeWidth={3.2} /> : i + 1}</span>
            <span className="st-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
