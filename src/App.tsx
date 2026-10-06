import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { StatusSidebar } from './components/StatusSidebar';
import { RepairPanel } from './components/RepairPanel';
import { RiskMap } from './components/RiskMap';
import { Workflow } from './components/Workflow';
import { PredictionTimeline } from './components/PredictionTimeline';
import { RiskGauge } from './components/RiskGauge';
import { ServiceImpact } from './components/ServiceImpact';
import { CameraControls, ForecastScrubber, LayerToggles, ViewTabs } from './components/TwinToolbar';
import { AlertCard, AlertLeader } from './components/AlertCard';
import { DemoOverlays, NarrationBar } from './components/DemoOverlays';
import { HoverTooltip } from './components/HoverTooltip';
import { AssetInspector } from './components/AssetInspector';
import { ExplainabilityPanel } from './components/ExplainabilityPanel';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Drawers } from './components/Drawers';
import { LoadingScreen } from './components/LoadingScreen';
import { DigitalTwin } from './three/DigitalTwin';
import { getEngine, whenEngine } from './three/engineRef';
import { useAppStore } from './store/useAppStore';
import { useSimulationLoop } from './simulation/useSimulationLoop';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

/** Design canvas: the command centre is laid out for 1920 px wide and at
 *  least 1000 px tall, then scaled to fit any screen (like a control-room
 *  display) so nothing is clipped or "zoomed in" on laptops at 100 %. */
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

/** Tell the engine how much of the canvas is covered by side panels so the
 *  twin stays visually centred in the open viewport. */
function useViewInsets(stage: React.RefObject<HTMLElement | null>, left: React.RefObject<HTMLElement | null>, right: React.RefObject<HTMLElement | null>) {
  const nav = useAppStore((s) => s.nav);
  useEffect(() => {
    const measure = () => {
      const st = stage.current?.getBoundingClientRect();
      const l = left.current?.getBoundingClientRect();
      const r = right.current?.getBoundingClientRect();
      if (!st || !l || !r) return;
      // an open drawer covers more of the right side than the sidebar
      const drawer = stage.current?.querySelector('.drawer')?.getBoundingClientRect();
      const rightEdge = drawer ? Math.min(drawer.left, r.left) : r.left;
      // screen px → layout px (UI is CSS-zoomed to fit)
      const k = st.width / Math.max(1, stage.current!.clientWidth);
      const li = Math.max(0, Math.min(st.width / 2, l.right - st.left)) / k;
      const ri = Math.max(0, Math.min(st.width * 0.6, st.right - rightEdge)) / k;
      getEngine()?.setViewInsets(li, ri);
    };
    whenEngine(measure);
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    // follow the sidebar slide transition
    const id = window.setInterval(measure, 120);
    const stop = window.setTimeout(() => window.clearInterval(id), 900);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [nav, stage, left, right]);
}

export default function App() {
  useSimulationLoop();
  useKeyboardShortcuts();
  const nav = useAppStore((s) => s.nav);
  const theme = useAppStore((s) => s.theme);
  const running = useAppStore((s) => s.demo.running);
  const stageRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLElement>(null);
  useViewInsets(stageRef, leftRef, rightRef);
  const fit = useFitScale();

  return (
    <div className={`app nav-${nav} ${running ? 'is-demo' : ''}`} data-theme={theme} style={{ zoom: fit.scale, width: fit.width, height: fit.height }}>
      <Header />
      <main className="main">
        <section className="stage" ref={stageRef}>
          <DigitalTwin />
          <div className="stage-fade" aria-hidden />
          <AlertLeader stageRef={stageRef} />

          <aside className="sidebar sidebar-left" ref={leftRef}>
            <StatusSidebar />
          </aside>
          <aside className="sidebar sidebar-right" ref={rightRef}>
            <RepairPanel />
            <RiskMap />
          </aside>

          <div className="viewport-ui">
            <div className="vp-top-left">
              <ViewTabs />
              <AssetInspector />
            </div>
            <div className="vp-top-right">
              <AlertCard />
              <ExplainabilityPanel />
            </div>
            <CameraControls />
            <div className="vp-bottom">
              <NarrationBar />
              <div className="vp-bottom-row">
                <LayerToggles />
                <ForecastScrubber />
              </div>
            </div>
            <DemoOverlays />
          </div>

          <HoverTooltip stageRef={stageRef} />
          <Drawers />
        </section>

        <section className="bottom-row">
          <Workflow />
          <PredictionTimeline />
          <RiskGauge />
          <ServiceImpact />
        </section>
      </main>
      <ShortcutsModal />
      <LoadingScreen />
    </div>
  );
}
