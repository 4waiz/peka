import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { cameraPreset, focusLeak, selectAsset, setView, skipDemoStep, startDemo, stopDemo, toggleXray } from '../store/actions';
import { getEngine } from '../three/engineRef';

/** Presenter-friendly keyboard shortcuts. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useAppStore.getState();
      if (!s.entered) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (s.demo.running) stopDemo();
          else startDemo();
          break;
        case 'ArrowRight':
          if (s.demo.running) skipDemoStep();
          break;
        case 'r':
        case 'R':
          cameraPreset('overview');
          break;
        case 'l':
        case 'L':
          focusLeak();
          break;
        case 'u':
        case 'U':
          cameraPreset('underground');
          break;
        case '1':
          setView('3d');
          break;
        case '2':
          setView('map');
          break;
        case '3':
          setView('asset');
          break;
        case 'x':
        case 'X':
          toggleXray();
          break;
        case 'h':
        case 'H':
          useAppStore.setState({ heat: !s.heat });
          break;
        case 't':
        case 'T':
          s.toggleTheme();
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.();
          break;
        case '?':
          useAppStore.setState({ shortcutsOpen: !s.shortcutsOpen });
          break;
        case 'Escape':
          getEngine()?.cancelCamera();
          if (s.shortcutsOpen) useAppStore.setState({ shortcutsOpen: false });
          else if (s.explainOpen) useAppStore.setState({ explainOpen: false });
          else if (s.selectedAsset) selectAsset(null);
          else if (s.nav !== 'live' && s.nav !== 'twin') useAppStore.setState({ nav: 'live' });
          else if (s.demo.overlay === 'final') useAppStore.setState({ demo: { ...s.demo, overlay: null, completed: false } });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
