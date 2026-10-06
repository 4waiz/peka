import { useAppStore, type NavKey } from './useAppStore';
import { getEngine } from '../three/engineRef';
import type { PresetName, ViewMode } from '../three/TwinEngine';
import type { AssetRef } from '../simulation/assets';
import { LEAK, type SectorId, type UtilityId } from '../simulation/infrastructureData';
import { demoRunner } from '../simulation/demoSequence';

const st = () => useAppStore.getState();

/** Select a sector from anywhere (3D, minimap, chips) and fly the camera to it. */
export function selectSector(id: SectorId | null) {
  useAppStore.setState({ selectedSector: id });
  if (id) getEngine()?.focusSector(id);
}

export function selectAsset(ref: AssetRef | null) {
  useAppStore.setState({ selectedAsset: ref });
}

export function focusAsset(assetId: string) {
  const engine = getEngine();
  if (!engine) return;
  const seg = engine.utilities.getByAsset(assetId);
  if (seg) {
    useAppStore.setState({
      selectedAsset: { assetId: seg.assetId, utility: seg.utility, kind: seg.kind, sector: seg.sector, depth: seg.a.y, length: seg.length },
    });
  }
  engine.focusAsset(assetId);
}

export function followAsset(assetId: string) {
  getEngine()?.followAsset(assetId);
}

export function focusLeak() {
  if (st().view === 'map') useAppStore.setState({ view: '3d' });
  getEngine()?.flyToPreset('leak', 2.6);
}

export function cameraPreset(name: PresetName) {
  if (name !== 'map' && st().view === 'map') useAppStore.setState({ view: '3d' });
  getEngine()?.flyToPreset(name, name === 'underground' || name === 'leak' ? 2.8 : 2.4);
}

export function setView(view: ViewMode) {
  useAppStore.setState({ view });
}

export function toggleXray() {
  useAppStore.setState((s) => ({ xray: !s.xray }));
}

export function highlightUtility(u: UtilityId | null) {
  st().setHighlight(u);
}

export function setNav(nav: NavKey) {
  const s = st();
  const next = s.nav === nav && nav !== 'live' ? 'live' : nav;
  useAppStore.setState({ nav: next, routeVisible: next === 'repair' ? true : s.repair.status !== 'idle' });
}

export function showAffectedArea() {
  useAppStore.setState((s) => ({ blast: !s.blast }));
  if (!st().blast) return;
  if (st().view === 'map') return;
  getEngine()?.flyTo({ target: [LEAK.x + 18, 0, 30], radius: 160, polar: 50, azimuth: 18, fov: 36 }, 2.4);
}

export function startDemo() {
  demoRunner.start();
}

export function stopDemo() {
  demoRunner.stop(true);
}

export function skipDemoStep() {
  demoRunner.skip();
}

export function closeFinal() {
  useAppStore.setState((s) => ({ demo: { ...s.demo, overlay: null, completed: false } }));
}

/** Return the twin to the calm initial state and restart live monitoring. */
export function resetLiveMonitoring() {
  demoRunner.stop(false);
  const e = getEngine();
  e?.resetCrew();
  e?.flyToPreset('overview', 2.2);
  useAppStore.setState((s) => ({
    anomaly: 0,
    forecastHours: 0,
    liveTime: 0,
    repair: { status: 'idle', progress: 0, repairProgress: 0 },
    routeVisible: false,
    selectedAsset: null,
    selectedSector: null,
    highlight: null,
    xray: false,
    blast: false,
    view: '3d',
    demo: { ...s.demo, running: false, completed: false, overlay: null, highlightPanel: null, focusSensors: [] },
  }));
  st().pushEvent('ok', 'Twin reset — live monitoring restarted');
}
