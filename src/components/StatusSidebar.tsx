import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Droplets, Gauge, Network, ShieldCheck, Thermometer, Waves } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SensorCard } from './SensorCard';
import { AiSummary } from './AiSummary';
import { formatReading, isAnomalous, readingValue, type SensorKey } from '../simulation/sensorEngine';
import { getEngine } from '../three/engineRef';
import { highlightUtility } from '../store/actions';
import type { UtilityId } from '../simulation/infrastructureData';

const CARDS: { key: SensorKey; title: string; icon: typeof Droplets; minSpan: number; utility: UtilityId | null; severity?: 'crit' | 'warn' }[] = [
  { key: 'pressure', title: 'Pressure (Water)', icon: Droplets, minSpan: 1.2, utility: 'water' },
  { key: 'moisture', title: 'Ground Moisture', icon: Waves, minSpan: 4, utility: 'water' },
  { key: 'consumption', title: 'Consumption Anomaly', icon: Activity, minSpan: 3, utility: 'water', severity: 'warn' },
  { key: 'temperature', title: 'Temperature Anomaly', icon: Thermometer, minSpan: 1.5, utility: 'cooling', severity: 'warn' },
  { key: 'integrity', title: 'Network Integrity', icon: ShieldCheck, minSpan: 1, utility: 'telecom' },
  { key: 'assets', title: 'Assets Online', icon: Network, minSpan: 2, utility: null },
];

export function StatusSidebar() {
  const readings = useAppStore((s) => s.readings);
  const history = useAppStore((s) => s.history);
  const focus = useAppStore((s) => s.demo.focusSensors);
  const highlight = useAppStore((s) => s.highlight);
  const forecast = useAppStore((s) => s.forecastHours);
  const anomaly = useAppStore((s) => s.anomaly);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const flash = useAppStore((s) => (s.flashPanel?.key === 'sensors' ? s.flashPanel.n : 0));
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState<SensorKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash || !ref.current) return;
    ref.current.classList.remove('flash');
    void ref.current.offsetWidth;
    ref.current.classList.add('flash');
  }, [flash]);

  const anomalyCount = CARDS.filter((c) => isAnomalous(c.key, readingValue(readings, c.key))).length;

  const onCard = (key: SensorKey, utility: UtilityId | null) => {
    const next = activeKey === key ? null : key;
    setActiveKey(next);
    if (key === 'assets') {
      useAppStore.setState((s) => ({ layers: { water: true, electricity: true, telecom: true, cooling: true, sewage: true }, view: next ? 'asset' : s.view === 'asset' ? '3d' : s.view }));
      return;
    }
    if (key === 'moisture') useAppStore.setState({ heat: !!next });
    highlightUtility(next ? utility : null);
    if (next && (key === 'pressure' || key === 'moisture')) getEngine()?.flyToPreset('underground', 2.6);
  };

  return (
    <div className={`sidebar-inner ${collapsed ? 'is-collapsed' : ''}`} ref={ref}>
      <div className="panel status-panel">
        <button className="panel-head as-button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
          <span className="panel-title">City Infrastructure Status</span>
          <ChevronDown size={15} className="chev" />
        </button>
        <div className="status-line">
          <span className="status-dot ok" />
          <span className="status-ok">All Systems Online</span>
          {forecast > 0.5 ? (
            <span className="status-tag forecast">+{Math.round(forecast)}h forecast</span>
          ) : anomalyCount > 0 && !resolved ? (
            <span className="status-tag warn">
              <Gauge size={11} /> {anomalyCount} unusual
            </span>
          ) : (
            <span className="status-tag ok">{anomaly > 0 && !resolved ? 'Analyzing' : 'Nominal'}</span>
          )}
        </div>
        <div className="sensor-list">
          {CARDS.map((c) => {
            const v = readingValue(readings, c.key);
            const anomalous = isAnomalous(c.key, v);
            return (
              <SensorCard
                key={c.key}
                icon={c.icon}
                title={c.title}
                value={formatReading(c.key, readings)}
                history={history[c.key]}
                anomalous={anomalous}
                severity={c.severity}
                minSpan={c.minSpan}
                focused={focus.includes(c.key)}
                active={activeKey === c.key && (c.utility === null || highlight === c.utility || c.key === 'moisture')}
                onClick={() => onCard(c.key, c.utility)}
              />
            );
          })}
        </div>
      </div>
      <AiSummary />
    </div>
  );
}
