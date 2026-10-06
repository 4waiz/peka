import { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { startDemo } from '../store/actions';

/** One-time nudge pointing first-time viewers at the guided simulation. */
export function CoachHint() {
  const entered = useAppStore((s) => s.entered);
  const running = useAppStore((s) => s.demo.running);
  const completed = useAppStore((s) => s.demo.completed);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('peka-coach') === '1';
    } catch {
      return false;
    }
  });
  const [show, setShow] = useState(false);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem('peka-coach', '1');
    } catch {
      // storage unavailable — hint simply stays dismissed for this session
    }
  }, []);

  useEffect(() => {
    if (!entered || dismissed) return;
    const id = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(id);
  }, [entered, dismissed]);

  useEffect(() => {
    if (running || completed) dismiss();
  }, [running, completed, dismiss]);

  if (!show || dismissed) return null;
  return (
    <div className="coach" role="status">
      <div className="coach-text">
        <b>New here?</b> Watch a 45-second guided story of how P.E.K.A. finds a leak before it fails.
      </div>
      <div className="coach-actions">
        <button className="coach-go" onClick={startDemo}>
          <Play size={12} fill="currentColor" /> Run it
        </button>
        <button className="coach-skip" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
