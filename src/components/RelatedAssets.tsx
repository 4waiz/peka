import { ArrowRight, CircleDot, Droplet, Gauge } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { focusAsset, setView } from '../store/actions';
import { getEngine } from '../three/engineRef';
import { UTILITIES, VALVES } from '../simulation/infrastructureData';

const W = UTILITIES.water;

/** Third card: the physical assets involved, one click to fly to each. */
export function RelatedAssets() {
  const pressure = useAppStore((s) => s.readings.pressure);
  const repair = useAppStore((s) => s.repair.status);
  const valveClosed = repair === 'onsite' || repair === 'repairing';
  const rows = [
    {
      id: 'main',
      icon: Droplet,
      name: 'Water Main – WTR-B12-047',
      detail: 'Depth 3.2 m · Ø900 mm',
      go: () => focusAsset('WTR-B12-047'),
    },
    {
      id: 'fs',
      icon: Gauge,
      name: 'Flow Sensor – FS-3381',
      detail: Math.abs(pressure) < 0.3 ? 'Last reading normal' : `Last reading ${Math.abs(pressure).toFixed(1)}% below normal`,
      go: () => getEngine()?.focusPoint(-11, W.depth, W.conduits[0].z + 1.6, 16),
    },
    {
      id: 'wv',
      icon: CircleDot,
      name: 'Valve – WV-776',
      detail: `Status: ${valveClosed ? 'Closed (isolating)' : 'Open'}`,
      go: () => getEngine()?.focusPoint(VALVES[0].x, W.depth + 1, W.conduits[0].z + 1.6, 16),
    },
  ];
  return (
    <section className="card related">
      <div className="card-head">
        <h3>Related Assets</h3>
        <button className="link-btn" onClick={() => setView('asset')}>
          View all
        </button>
      </div>
      <ul>
        {rows.map(({ id, icon: Icon, name, detail, go }) => (
          <li key={id}>
            <span className="ra-icon">
              <Icon size={16} strokeWidth={1.8} />
            </span>
            <div className="ra-text">
              <b>{name}</b>
              <span>{detail}</span>
            </div>
            <button className="ra-view" onClick={go}>
              View <ArrowRight size={13} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
