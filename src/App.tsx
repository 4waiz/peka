import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { IncidentCard } from './components/IncidentCard';
import { ActionCard } from './components/ActionCard';
import { RelatedAssets } from './components/RelatedAssets';
import { CityStatusChip } from './components/CityStatusChip';
import { WorkflowStepper } from './components/WorkflowStepper';
import { UndergroundPanel } from './components/UndergroundPanel';
import { CameraControls, LayerToggles, ViewTabs } from './components/TwinToolbar';
import { DemoOverlays, NarrationBar } from './components/DemoOverlays';
import { HoverTooltip } from './components/HoverTooltip';
import { AssetInspector } from './components/AssetInspector';
import { ExplainabilityPanel } from './components/ExplainabilityPanel';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Drawers } from './components/Drawers';
import { LoadingScreen } from './components/LoadingScreen';
import { CoachHint } from './components/CoachHint';
import { DigitalTwin } from './three/DigitalTwin';
import { whenEngine } from './three/engineRef';
import { useAppStore } from './store/useAppStore';
import { useSimulationLoop } from './simulation/useSimulationLoop';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

/** Design canvas: laid out for 1920 px wide and at least 1000 px tall, then
 *  scaled to fit any screen so nothing is clipped or "zoomed in" at 100 %. */
const DESIGN_W = 1920;
const DESIGN_MIN_H = 1000;

function computeFit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(2, Math.max(0.5, Math.min(vw / DESIGN_W, vh / DESIGN_MIN_H)));
  return { scale, width: vw / scale, height: vh / scale };
}

function useFitScale() {
  const [fit, setFit] = useState(computeFit);
  useEffect(() => {
    const onResize = () => setFit(computeFit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    whenEngine((e) => e.setUiScale(fit.scale));
  }, [fit.scale]);
  return fit;
}

export default function App() {
  useSimulationLoop();
  useKeyboardShortcuts();
  const nav = useAppStore((s) => s.nav);
  const theme = useAppStore((s) => s.theme);
  const running = useAppStore((s) => s.demo.running);
  const stageRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale();

  return (
    <div className={`app nav-${nav} ${running ? 'is-demo' : ''}`} data-theme={theme} style={{ zoom: fit.scale, width: fit.width, height: fit.height }}>
      <Header />
      <CoachHint />
      <main className="body">
        <div className="left">
          <section className="card city-card stage" ref={stageRef}>
            <DigitalTwin />
            <div className="city-ui">
              <div className="cu-top-left">
                <CityStatusChip />
                <AssetInspector />
              </div>
              <div className="cu-top-right">
                <WorkflowStepper />
                <ExplainabilityPanel />
              </div>
              <CameraControls />
              <div className="cu-bottom">
                <NarrationBar />
              </div>
              <DemoOverlays />
            </div>
            <HoverTooltip stageRef={stageRef} />
          </section>

          <div className="strip">
            <ViewTabs />
            <LayerToggles />
          </div>

          <UndergroundPanel />
        </div>

        <aside className="right">
          <IncidentCard />
          <ActionCard />
          <RelatedAssets />
        </aside>

        <Drawers />
      </main>
      <ShortcutsModal />
      <LoadingScreen />
    </div>
  );
}
