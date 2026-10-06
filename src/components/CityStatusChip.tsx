import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';

/** Floating card over the city view: local conditions + overall system health. */
export function CityStatusChip() {
  const theme = useAppStore((s) => s.theme);
  const integrity = useAppStore((s) => s.readings.integrity);
  const detected = useAppStore(selDetected);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const day = theme === 'day';
  const alert = detected && !resolved;
  return (
    <div className="city-chip">
      <div className="cc-weather">
        {day ? <Sun size={26} strokeWidth={1.6} className="sun" /> : <Moon size={24} strokeWidth={1.6} className="moon" />}
        <div>
          <b>{day ? '32°C' : '27°C'}</b>
          <span>Riverside City</span>
          <span>{day ? 'Clear' : 'Clear night'} · {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div className="cc-sep" />
      <div className="cc-sys">
        <span>City systems</span>
        <b className={alert ? 'is-alert' : ''}>
          <i />
          {alert ? '1 active alert' : 'Healthy'}
        </b>
        <em>{integrity.toFixed(1)}%</em>
      </div>
    </div>
  );
}
