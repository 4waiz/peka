import type { LucideIcon } from 'lucide-react';
import { Sparkline } from './Sparkline';

interface Props {
  icon: LucideIcon;
  title: string;
  value: string;
  sub?: string;
  history: number[];
  anomalous: boolean;
  /** 'crit' (default) or 'warn' colouring when anomalous */
  severity?: 'crit' | 'warn';
  minSpan: number;
  focused?: boolean;
  active?: boolean;
  onClick?: () => void;
}


export function SensorCard({ icon: Icon, title, value, sub, history, anomalous, severity = 'crit', minSpan, focused, active, onClick }: Props) {
  const key = anomalous ? severity : 'ok';
  return (
    <button
      className={`sensor-card ${anomalous ? 'is-anomalous' : 'is-normal'} ${focused ? 'is-focused' : ''} ${active ? 'is-active' : ''}`}
      onClick={onClick}
      style={{ ['--tone' as string]: `var(--${key})` }}
    >
      <div className="sensor-icon">
        <Icon strokeWidth={1.6} />
      </div>
      <div className="sensor-body">
        <div className="sensor-title">{title}</div>
        <div className="sensor-value">{value}</div>
        {sub && <div className="sensor-sub">{sub}</div>}
      </div>
      <Sparkline data={history} color={`var(--${key})`} minSpan={minSpan} width={70} height={30} />
    </button>
  );
}
