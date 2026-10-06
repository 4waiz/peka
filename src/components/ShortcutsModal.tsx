import { X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const KEYS: [string, string][] = [
  ['Space', 'Run / stop AI simulation'],
  ['→', 'Next simulation step'],
  ['R', 'Reset camera view'],
  ['L', 'Fly to leak location'],
  ['U', 'Underground view'],
  ['1 / 2 / 3', '3D twin / map / asset view'],
  ['X', 'Toggle x-ray mode'],
  ['H', 'Toggle risk heat map'],
  ['T', 'Toggle day / night mode'],
  ['F', 'Toggle fullscreen'],
  ['Esc', 'Close panels / stop camera'],
];

export function ShortcutsModal() {
  const open = useAppStore((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={() => useAppStore.setState({ shortcutsOpen: false })}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="panel-title">Keyboard Shortcuts</span>
          <button className="icon-btn" onClick={() => useAppStore.setState({ shortcutsOpen: false })} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="kbd-grid">
          {KEYS.map(([k, v]) => (
            <div key={k} className="kbd-row">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <p className="kbd-note">Mouse: drag to orbit · right-drag or Shift+drag to pan · scroll to zoom · click sectors or pipes to inspect.</p>
      </div>
    </div>
  );
}
