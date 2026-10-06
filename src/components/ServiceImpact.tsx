import { Droplet, Snowflake, Waves, Wifi, Zap } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { highlightUtility } from '../store/actions';
import { UTILITIES, type UtilityId } from '../simulation/infrastructureData';

const ROWS: { u: UtilityId; icon: typeof Zap; impact: 'high' | 'medium' | 'low' }[] = [
  { u: 'water', icon: Droplet, impact: 'high' },
  { u: 'sewage', icon: Waves, impact: 'medium' },
  { u: 'electricity', icon: Zap, impact: 'low' },
  { u: 'telecom', icon: Wifi, impact: 'low' },
  { u: 'cooling', icon: Snowflake, impact: 'low' },
];

const LABEL = { high: 'High Impact', medium: 'Medium', low: 'Low' };

export function ServiceImpact() {
  const detected = useAppStore(selDetected);
  const anomaly = useAppStore((s) => s.anomaly);
  const highlight = useAppStore((s) => s.highlight);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  return (
    <div className="panel service-impact">
      <div className="panel-head">
        <span className="panel-title">Affected Service Zones</span>
      </div>
      <ul className="si-rows">
        {ROWS.map(({ u, icon: Icon, impact }) => {
          const spec = UTILITIES[u];
          let level: string = impact;
          let text = LABEL[impact];
          if (resolved) {
            level = 'ok';
            text = u === 'water' ? 'Restored' : 'Normal';
          } else if (!detected) {
            if (u === 'water' && anomaly > 0.12) {
              level = 'medium';
              text = 'Elevated';
            } else {
              level = 'ok';
              text = 'Normal';
            }
          }
          return (
            <li key={u}>
              <button className={`si-row ${highlight === u ? 'is-active' : ''}`} onClick={() => highlightUtility(u)} style={{ ['--c' as string]: spec.color }}>
                <Icon size={16} strokeWidth={1.9} className="si-icon" />
                <span className="si-name">{spec.full}</span>
                <span className={`pill pill-${level}`}>{text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
