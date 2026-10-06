import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Lighting } from './Lighting';
import { generateCity } from './CityGenerator';
import { Buildings } from './BuildingGenerator';
import { RoadNetwork } from './RoadNetwork';
import { RoadTiles } from './RoadTiles';
import { UndergroundView } from './UndergroundView';
import { Waterway } from './Waterway';
import { GroundCutaway } from './GroundCutaway';
import { UtilityNetwork, type PipeSegment } from './UtilityNetwork';
import { LeakSimulation } from './LeakSimulation';
import { SectorManager } from './SectorManager';
import { RiskOverlay } from './RiskOverlay';
import { ImpactOverlay } from './ImpactOverlay';
import { VehicleSystem } from './VehicleSystem';
import { CameraController, type CamPose } from './CameraController';
import { LabelManager } from './LabelManager';
import { damp } from './utils/random';
import {
  BENCH_Y,
  DEEP_Y,
  FACE_Z,
  FACILITIES,
  LEAK,
  LOWER_FACE_Z,
  SECTORS,
  SENSOR_NODES,
  UTILITIES,
  UTILITY_ORDER,
  sectorCenter,
  type RiskLevel,
  type SectorId,
  type UtilityId,
} from '../simulation/infrastructureData';
import type { AssetRef } from '../simulation/assets';

export type ViewMode = '3d' | 'map' | 'asset';
export type PresetName = 'overview' | 'city' | 'underground' | 'leak' | 'map' | 'asset' | 'impact' | 'intro' | 'b12' | 'final';

export interface HoverInfo {
  kind: 'sector' | 'asset';
  id: string;
  sector?: SectorId;
  asset?: AssetRef;
}

export interface EngineCallbacks {
  onHover?: (h: HoverInfo | null) => void;
  onSelectSector?: (id: SectorId) => void;
  onSelectAsset?: (a: AssetRef | null) => void;
  onCamera?: (c: { x: number; z: number; az: number; dist: number }) => void;
  onUserCamera?: () => void;
}

export interface VisualInputs {
  view: ViewMode;
  xray: boolean;
  heat: boolean;
  blast: boolean;
  layers: Record<UtilityId, boolean>;
  highlight: UtilityId | null;
  hoveredSector: SectorId | null;
  selectedSector: SectorId | null;
  routeVisible: boolean;
}

export interface SimInputs {
  leakSeverity: number;
  detected: boolean;
  resolved: boolean;
  forecastHours: number;
  b12Risk: RiskLevel;
  confidence: number;
}

export interface DemoInputs {
  cutaway: boolean;
  correlation: boolean;
  localize: boolean;
  impact: boolean;
  emphasizeWater: boolean;
  blast: boolean;
}

export const PRESETS: Record<PresetName, CamPose> = {
  overview: { target: [-12, 2, 4], radius: 205, polar: 57, azimuth: 12, fov: 36 },
  intro: { target: [-4, 2, -6], radius: 265, polar: 52, azimuth: -16, fov: 36 },
  city: { target: [0, 6, -20], radius: 245, polar: 47, azimuth: 20, fov: 36 },
  underground: { target: [-22, -13, 72.5], radius: 60, polar: 81, azimuth: 17, fov: 40 },
  leak: { target: [LEAK.x + 0.5, -9.8, 70.8], radius: 26, polar: 77, azimuth: 15, fov: 40 },
  map: { target: [3, 0, -4], radius: 330, polar: 0.4, azimuth: 0, fov: 30 },
  asset: { target: [-8, -8, 6], radius: 185, polar: 54, azimuth: -26, fov: 36 },
  impact: { target: [-4, 2, 20], radius: 172, polar: 50, azimuth: 24, fov: 36 },
  b12: { target: [-20, 0, 34], radius: 118, polar: 54, azimuth: 12, fov: 36 },
  final: { target: [-12, 2, 4], radius: 215, polar: 56, azimuth: 6, fov: 36 },
};

const UTIL_ICON: Record<UtilityId, string> = {
  electricity: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  telecom: '<svg viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0" fill="none" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.6"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 2.5s7 7.6 7 12.2A7 7 0 0 1 5 14.7C5 10.1 12 2.5 12 2.5z"/></svg>',
  cooling: '<svg viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
  sewage: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/><path d="M7 10.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0M7 14.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0" fill="none" stroke-width="1.8"/></svg>',
};

function refOf(seg: PipeSegment): AssetRef {
  return { assetId: seg.assetId, utility: seg.utility, kind: seg.kind, sector: seg.sector, depth: seg.a.y, length: seg.length };
}

/**
 * The digital twin runtime. Owns the renderer, scene graph and all
 * subsystems; React talks to it through the small imperative API below.
 */
export class TwinEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cam: CameraController;
  readonly anchors = {
    leak: { x: 0, y: 0, visible: false },
    leakPipe: { x: 0, y: 0, visible: false },
  };

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private timer = new THREE.Timer();
  private raf = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private insetL = 0;
  private insetR = 0;
  private targetInsetL = 0;
  private targetInsetR = 0;
  private resizeObs: ResizeObserver;

  private lighting: Lighting;
  private buildings: Buildings;
  private roads: RoadNetwork;
  private tiles: RoadTiles;
  private water: Waterway;
  private ground: GroundCutaway;
  readonly utilities: UtilityNetwork;
  private leak: LeakSimulation;
  private sectors: SectorManager;
  private risk: RiskOverlay;
  private impact: ImpactOverlay;
  private vehicles: VehicleSystem;
  private labels: LabelManager;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private pointerDirty = false;
  private pointerInside = false;
  private downAt = { x: 0, y: 0, t: 0 };
  private hover: HoverInfo | null = null;
  private lastCamEmit = 0;

  private selectionMesh: THREE.Mesh;
  private selectionMat: THREE.ShaderMaterial;
  private selectedAsset: string | null = null;
  private focusReveal = false;

  private vis: VisualInputs = {
    view: '3d',
    xray: false,
    heat: false,
    blast: false,
    layers: { water: true, electricity: true, telecom: true, cooling: true, sewage: true },
    highlight: null,
    hoveredSector: null,
    selectedSector: null,
    routeVisible: false,
  };
  private sim: SimInputs = { leakSeverity: 0, detected: false, resolved: false, forecastHours: 0, b12Risk: 'low', confidence: 0 };
  private demo: DemoInputs = { cutaway: false, correlation: false, localize: false, impact: false, emphasizeWater: false, blast: false };
  private cur = { surface: 1, buildings: 1, boost: 1, xray: 0, alert: 0, impactB: 0 };

  private maxPR: number;
  private pr: number;
  private frameAcc = 0;
  private frameCount = 0;
  private lastAdapt = 0;

  constructor(
    private container: HTMLElement,
    labelLayer: HTMLElement,
    private cb: EngineCallbacks = {},
  ) {
    this.maxPR = Math.min(window.devicePixelRatio || 1, 2);
    this.pr = this.maxPR;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#050b13');
    this.renderer.domElement.className = 'twin-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#050b13');
    this.scene.fog = new THREE.FogExp2('#0a1724', 0.0021);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.8, 4000);
    this.cam = new CameraController(this.camera, this.renderer.domElement);
    this.cam.onUserInteract = () => this.cb.onUserCamera?.();
    this.setPose(PRESETS.overview);

    // ---- world ----------------------------------------------------------------
    this.lighting = new Lighting(this.renderer, this.scene);
    const plan = generateCity();
    this.buildings = new Buildings(plan);
    this.roads = new RoadNetwork(plan);
    this.water = new Waterway();
    this.ground = new GroundCutaway();
    this.tiles = new RoadTiles(this.ground.material);
    this.utilities = new UtilityNetwork();
    this.leak = new LeakSimulation();
    this.sectors = new SectorManager();
    this.risk = new RiskOverlay();
    this.impact = new ImpactOverlay();
    this.vehicles = new VehicleSystem();
    this.scene.add(
      this.ground.group,
      this.tiles.group,
      this.roads.group,
      this.water.group,
      this.buildings.group,
      this.utilities.group,
      this.leak.group,
      this.sectors.group,
      this.risk.group,
      this.impact.group,
      this.vehicles.group,
    );

    this.selectionMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          vY = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float fres = pow(1.0 - abs(dot(vN, vV)), 1.6);
          float scan = smoothstep(0.06, 0.0, abs(fract(vY * 3.0 - uTime * 0.8) - 0.5) - 0.44);
          float a = fres * 0.85 + scan * 0.35;
          gl_FragColor = vec4(vec3(0.35, 1.3, 2.0) * a, a);
        }`,
    });
    this.selectionMat.userData.premult = true;
    this.selectionMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), this.selectionMat);
    this.selectionMesh.visible = false;
    this.selectionMesh.renderOrder = 12;
    this.scene.add(this.selectionMesh);

    // ---- post ---------------------------------------------------------------------
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // restrained, low-glare bloom: only genuinely bright sources (pulses, breach, beacons)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.24, 0.3, 1.15);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ---- labels ------------------------------------------------------------------
    this.labels = new LabelManager(labelLayer);
    this.buildLabels();

    // ---- events -------------------------------------------------------------------
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.applyLayers();
    this.ready = this.precompile();
    this.loop();
  }

  /** Resolves once every GPU program is compiled (parallel, non-blocking where supported). */
  readonly ready: Promise<void>;
  private isReady = false;

  private async precompile() {
    const t0 = performance.now();
    // compile hidden objects too, against the composer's HDR target (same program variants as rendering)
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      this.renderer.setRenderTarget(this.composer.renderTarget1);
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // fall back to lazy compilation on first render
    } finally {
      this.renderer.setRenderTarget(null);
      hidden.forEach((o) => (o.visible = false));
    }
    this.isReady = true;
    if (import.meta.env.DEV) console.info(`[twin] shaders compiled in ${Math.round(performance.now() - t0)} ms`);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  setVisual(v: Partial<VisualInputs>) {
    const prevView = this.vis.view;
    const prevLayers = this.vis.layers;
    this.vis = { ...this.vis, ...v };
    if (v.layers && v.layers !== prevLayers) this.applyLayers();
    if (v.view && v.view !== prevView) this.onViewChange(prevView);
    this.sectors.setHover(this.vis.hoveredSector ?? (this.hover?.kind === 'sector' ? this.hover.sector ?? null : null));
    this.sectors.setSelected(this.vis.selectedSector);
    this.buildings.uniforms.uSelectedSector.value = this.vis.selectedSector ? SECTORS.find((s) => s.id === this.vis.selectedSector)!.index : -5;
    this.vehicles.setRouteVisible(this.vis.routeVisible);
    this.applyEmphasis();
  }

  setSim(s: SimInputs) {
    const prevRisk = this.sim.b12Risk;
    if (s.confidence !== this.sim.confidence) {
      this.labels.setHTML('leakpin', `<span class="tl-pin"><i>!</i><b>Water leak</b><em>${Math.max(60, s.confidence)}%</em></span>`);
    }
    this.sim = s;
    this.leak.setSeverity(s.leakSeverity);
    this.leak.setAlert(s.detected && !s.resolved);
    this.sectors.setRisk('B-12', s.b12Risk);
    if (prevRisk !== s.b12Risk) this.updateSectorLabel('B-12', s.b12Risk);
  }

  setDemo(d: Partial<DemoInputs>) {
    this.demo = { ...this.demo, ...d };
    this.impact.setCorrelation(this.demo.correlation);
    this.impact.setImpact(this.demo.impact);
    this.applyEmphasis();
  }

  flyToPreset(name: PresetName, duration = 2.4) {
    if (name === 'map' || this.vis.view === 'map') this.cam.setMapMode(name === 'map');
    return this.cam.flyTo(PRESETS[name], duration);
  }

  flyTo(pose: CamPose, duration = 2.4) {
    return this.cam.flyTo(pose, duration);
  }

  focusSector(id: SectorId, duration = 2.2) {
    const [x, z] = sectorCenter(id);
    if (this.vis.view === 'map') return this.cam.flyTo({ target: [x, 0, z], radius: 190, polar: 0.4, azimuth: 0, fov: 30 }, duration);
    const zz = id === 'B-12' ? z + 12 : z;
    return this.cam.flyTo({ target: [x, 0, zz], radius: 128, polar: 53, azimuth: 12, fov: 36 }, duration);
  }

  /** Highlight + optionally fly to a pipe segment by asset id. */
  selectAsset(assetId: string | null) {
    this.selectedAsset = assetId;
    const seg = assetId ? this.utilities.getByAsset(assetId) : null;
    if (!seg) {
      this.selectionMesh.visible = false;
      this.focusReveal = false;
      return;
    }
    const dir = seg.b.clone().sub(seg.a);
    const len = dir.length();
    const mid = seg.a.clone().add(seg.b).multiplyScalar(0.5);
    this.selectionMesh.position.copy(mid);
    this.selectionMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.selectionMesh.scale.set(seg.radius * 1.45, len, seg.radius * 1.45);
    this.selectionMesh.visible = true;
  }

  focusAsset(assetId: string) {
    const seg = this.utilities.getByAsset(assetId);
    if (!seg) return Promise.resolve();
    this.selectAsset(assetId);
    const onFace = seg.kind === 'trunk';
    let target = seg.a.clone().add(seg.b).multiplyScalar(0.5);
    if (assetId === LEAK.assetId) target = new THREE.Vector3(...LEAK.center);
    if (onFace) {
      if (Math.abs(target.x) > 200) target.x = Math.sign(target.x) * 120;
      return this.cam.flyTo({ target: [target.x, target.y, target.z + 1.8], radius: 28, polar: 74, azimuth: 16, fov: 40 }, 2.2);
    }
    this.focusReveal = true;
    return this.cam.flyTo({ target: [target.x, target.y, target.z], radius: 38, polar: 50, azimuth: 24, fov: 38 }, 2.2);
  }

  /** Camera rides along the clicked pipe's route. */
  followAsset(assetId: string) {
    const seg = this.utilities.getByAsset(assetId);
    if (!seg) return Promise.resolve();
    this.selectAsset(assetId);
    const pts = this.utilities.routePoints(seg);
    const start = seg.a.clone();
    let end = pts[1].clone();
    if (seg.kind === 'trunk') {
      start.x = Math.max(-140, Math.min(160, start.x));
      end = start.clone().setX(start.x - 70);
    }
    const length = start.distanceTo(end);
    if (length < 2) return Promise.resolve();
    const curve = new THREE.LineCurve3(start, end);
    const alongX = Math.abs(end.x - start.x) > Math.abs(end.z - start.z);
    if (seg.kind !== 'trunk') this.focusReveal = true;
    return this.cam.followCurve(curve, Math.min(12, Math.max(4, length / 9)), {
      radius: seg.kind === 'trunk' ? 17 : 22,
      polar: seg.kind === 'trunk' ? 74 : 58,
      azimuth: alongX ? 22 : 64,
    });
  }

  /** Demo: glide along the water main towards the breach. */
  followWaterToLeak(duration = 5.5) {
    const y = UTILITIES.water.depth;
    const z = UTILITIES.water.conduits[0].z;
    const curve = new THREE.LineCurve3(new THREE.Vector3(LEAK.x + 62, y, z), new THREE.Vector3(LEAK.x + 7, y, z));
    return this.cam.followCurve(curve, duration, { radius: 23, polar: 73, azimuth: 30 }, (t) => 1 - Math.pow(1 - t, 2));
  }

  zoom(factor: number) {
    const tg = this.cam.controls.target.clone();
    const s = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(tg));
    const r = THREE.MathUtils.clamp(s.radius * factor, 10, 480);
    return this.cam.flyTo({ target: tg, radius: r, polar: (s.phi * 180) / Math.PI, azimuth: (s.theta * 180) / Math.PI }, 0.65, { arc: 0 });
  }

  dispatchCrew(seconds: number) {
    this.vehicles.dispatch(seconds);
  }

  resetCrew() {
    this.vehicles.reset();
  }

  setAutoOrbit(on: boolean, speed?: number) {
    this.cam.setAutoOrbit(on, speed);
  }

  private ug: UndergroundView | null = null;

  /** Mount the second live view (underground close-up) into `container`. */
  attachUnderground(container: HTMLElement) {
    this.detachUnderground();
    this.ug = new UndergroundView(container, this.scene, new THREE.Vector3(...LEAK.crack));
    this.ug.compile().catch(() => undefined);
    return this.ug;
  }

  detachUnderground() {
    this.ug?.dispose();
    this.ug = null;
  }

  get underground() {
    return this.ug;
  }

  /** Fly the main camera to an arbitrary point of interest. */
  focusPoint(x: number, y: number, z: number, radius = 30) {
    return this.cam.flyTo({ target: [x, y, z], radius, polar: 74, azimuth: 16, fov: 40 }, 2.2);
  }

  private additiveMats: THREE.Material[] | null = null;

  /**
   * Night: soft blue-hour city, low-glare lighting. Day: sunlit city with a
   * light palette. Additive glow materials switch to normal (or premultiplied)
   * blending in daylight so overlays stay legible on bright surfaces.
   */
  setTheme(theme: 'night' | 'day') {
    const day = theme === 'day';
    this.lighting.setTheme(day);
    this.buildings.setDay(day);
    this.roads.setDay(day);
    this.tiles.setDay(day);
    this.water.setDay(day);
    this.ground.setDay(day);
    this.utilities.setDay(day);
    this.vehicles.setDay(day);
    this.leak.setDay(day);
    const bg = day ? '#d3dde6' : '#050b13';
    (this.scene.background as THREE.Color).set(bg);
    this.renderer.setClearColor(bg);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(day ? '#d3dde6' : '#0a1724');
    fog.density = day ? 0.0017 : 0.0021;
    this.bloom.strength = day ? 0.08 : 0.24;
    this.bloom.radius = 0.3;
    this.bloom.threshold = day ? 1.5 : 1.15;
    this.renderer.toneMappingExposure = day ? 0.92 : 0.95;

    if (!this.additiveMats) {
      const set = new Set<THREE.Material>();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) if (mm.blending === THREE.AdditiveBlending) set.add(mm);
      });
      this.additiveMats = [...set];
    }
    for (const m of this.additiveMats) {
      if (!day) m.blending = THREE.AdditiveBlending;
      else if (m.userData.premult) {
        m.blending = THREE.CustomBlending;
        m.blendSrc = THREE.OneFactor;
        m.blendDst = THREE.OneMinusSrcAlphaFactor;
      } else m.blending = THREE.NormalBlending;
    }
  }

  /** The UI is CSS-zoomed to fit the screen; keep the canvas at native resolution. */
  setUiScale(scale: number) {
    this.maxPR = Math.min((window.devicePixelRatio || 1) * scale, 2);
    this.pr = this.maxPR;
    this.renderer.setPixelRatio(this.pr);
    this.resize();
  }

  setViewInsets(left: number, right: number) {
    this.targetInsetL = left;
    this.targetInsetR = right;
  }

  cancelCamera() {
    this.cam.cancel();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDblClick);
    this.detachUnderground();
    this.cam.dispose();
    this.labels.dispose();
    this.lighting.dispose();
    this.buildings.dispose();
    this.roads.dispose();
    this.tiles.dispose();
    this.water.dispose();
    this.ground.dispose();
    this.utilities.dispose();
    this.leak.dispose();
    this.sectors.dispose();
    this.risk.dispose();
    this.impact.dispose();
    this.vehicles.dispose();
    this.selectionMesh.geometry.dispose();
    this.selectionMat.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  private setPose(p: CamPose) {
    const t = p.target instanceof THREE.Vector3 ? p.target : new THREE.Vector3(...p.target);
    const s = new THREE.Spherical(p.radius, (p.polar * Math.PI) / 180, (p.azimuth * Math.PI) / 180);
    this.camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s));
    this.cam.controls.target.copy(t);
    if (p.fov) this.camera.fov = p.fov;
    this.camera.lookAt(t);
  }

  private onViewChange(prev: ViewMode) {
    const v = this.vis.view;
    this.cam.setMapMode(v === 'map');
    if (v === 'map') this.cam.flyTo(PRESETS.map, 2.0);
    else if (v === 'asset') this.cam.flyTo(PRESETS.asset, 2.2);
    else if (prev !== '3d') this.cam.flyTo(PRESETS.overview, 2.2);
    for (const s of SECTORS) this.labels.toggleClass(`sector-${s.id}`, 'is-map', v === 'map');
  }

  private applyLayers() {
    for (const u of UTILITY_ORDER) {
      this.utilities.setVisible(u, this.vis.layers[u]);
      this.labels.setVisible(`util-${u}`, this.vis.layers[u]);
    }
  }

  private applyEmphasis() {
    this.utilities.setEmphasis(this.demo.emphasizeWater ? 'water' : this.vis.highlight);
  }

  private buildLabels() {
    const L = this.labels;
    for (const u of UTILITY_ORDER) {
      const spec = UTILITIES[u];
      const pos = new THREE.Vector3(-92, spec.depth + 0.15, spec.niche.faceZ + 0.6);
      L.add(`util-${u}`, `<span class="tl-util" style="--c:${spec.color}">${UTIL_ICON[u]}${spec.full}</span>`, pos, { className: 'anchor-left', maxDistance: 330 });
    }
    for (const s of SECTORS) {
      const [x, z] = sectorCenter(s.id);
      const pos = new THREE.Vector3(s.id === 'B-12' ? x + 6 : x, 4, s.id === 'B-12' ? z - 8 : z);
      L.add(`sector-${s.id}`, sectorChip(s.id, s.id === 'A-7' ? 'medium' : 'low'), pos, {
        className: 'anchor-center',
        onClick: () => this.cb.onSelectSector?.(s.id),
      });
    }
    for (const f of FACILITIES) {
      L.add(`fac-${f.id}`, `<span class="tl-fac tl-fac-${f.id}"><b>${f.name}</b><em>${f.distance} from breach</em></span>`, this.impact.anchors[f.id], { className: 'anchor-bottom', visible: false });
    }
    L.add('pop', '<span class="tl-fac tl-fac-pop"><b>~12,400 residents</b><em>Supply interruption zone</em></span>', this.impact.anchors.population, { className: 'anchor-bottom', visible: false });
    for (const n of SENSOR_NODES) {
      L.add(`node-${n.id}`, `<span class="tl-node">${n.id}</span>`, this.impact.anchors[n.id], { className: 'anchor-bottom', visible: false });
    }
    L.add('crew', '<span class="tl-crew">CREW W-3</span>', new THREE.Vector3(), { className: 'anchor-bottom', visible: false });
    L.add('leakpin', '<span class="tl-pin"><i>!</i><b>Water leak</b><em>93%</em></span>', this.leak.beaconTop.clone().add(new THREE.Vector3(0, 1.2, 0)), {
      className: 'anchor-pin',
      visible: false,
    });
    L.add(
      'leaktag',
      `<span class="tl-leak"><b>${LEAK.assetId}</b><em>Ø900 mm · depth 3.2 m · ductile iron</em></span>`,
      new THREE.Vector3(LEAK.x + 7.5, -4.4, FACE_Z + 1.5),
      { className: 'anchor-left', visible: false, maxDistance: 75 },
    );
  }

  private updateSectorLabel(id: SectorId, risk: RiskLevel) {
    this.labels.setHTML(`sector-${id}`, sectorChip(id, risk));
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.applyProjection();
  }

  private applyProjection() {
    const W = this.width;
    const H = this.height;
    const cx = this.insetL + (W - this.insetL - this.insetR) / 2;
    const fullW = 2 * Math.max(cx, W - cx);
    this.camera.aspect = fullW / H;
    if (Math.abs(fullW - W) < 1) this.camera.clearViewOffset();
    else this.camera.setViewOffset(fullW, H, fullW / 2 - cx, 0, W, H);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    if (!this.isReady) return;
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    this.update(dt);
    this.composer.render(dt);
    this.ug?.render(dt, this.time);
    this.adapt(dt);
  };

  private update(dt: number) {
    const t = this.time;
    this.cam.update(dt);

    // smooth view-offset (sidebars collapsing etc.)
    if (Math.abs(this.insetL - this.targetInsetL) > 0.5 || Math.abs(this.insetR - this.targetInsetR) > 0.5) {
      this.insetL = damp(this.insetL, this.targetInsetL, 6, dt);
      this.insetR = damp(this.insetR, this.targetInsetR, 6, dt);
      this.applyProjection();
    }

    // ---- blend visual targets ------------------------------------------------
    const v = this.vis;
    let surface = 1;
    let bld = 1;
    let boost = 1;
    let xray = 0;
    // Revealing the underground breaks the street slabs open (utilities run under
    // the streets), so blocks can stay mostly solid and the city stays readable.
    if (v.view === 'map') {
      surface = 0.6;
      bld = 0.72;
      boost = 1.2;
    }
    if (v.view === 'asset') {
      surface = Math.min(surface, 0.5);
      bld = 0.1;
      boost = 1.5;
      xray = 1;
    }
    if (v.xray) {
      surface = Math.min(surface, 0.6);
      bld = Math.min(bld, 0.22);
      boost = Math.max(boost, 1.3);
      xray = 1;
    }
    if (this.focusReveal) {
      surface = Math.min(surface, 0.6);
      bld = Math.min(bld, 0.3);
      xray = Math.max(xray, 0.6);
    }
    if (this.demo.cutaway) {
      surface = Math.min(surface, 0.6);
      bld = Math.min(bld, 0.32);
      boost = Math.max(boost, 1.25);
      xray = Math.max(xray, 0.7);
    }
    const reveal = v.view === 'asset' || v.xray || this.focusReveal || this.demo.cutaway;
    if (reveal) {
      const focus = this.demo.cutaway ? { x: LEAK.x, z: LEAK.surface[2] } : { x: this.cam.controls.target.x, z: this.cam.controls.target.z };
      this.tiles.setOpen(true, focus);
    } else this.tiles.setOpen(false);
    const c = this.cur;
    c.surface = damp(c.surface, surface, 3, dt);
    c.buildings = damp(c.buildings, bld, 3, dt);
    c.boost = damp(c.boost, boost, 3, dt);
    c.xray = damp(c.xray, xray, 3, dt);
    this.tiles.update(dt, t);
    this.tiles.setOpacity(Math.max(c.surface, 0.85));
    this.roads.setReveal(this.tiles.reveal);
    this.vehicles.reveal = this.tiles.reveal;
    this.roads.setSurfaceOpacity(c.surface);
    this.water.setOpacity(c.surface);
    this.buildings.setOpacity(c.buildings);
    this.roads.setFurnitureOpacity(Math.min(1, c.buildings * 1.1));
    this.buildings.uniforms.uXray.value = c.xray * (1 - c.buildings);
    this.utilities.setBoost(c.boost);

    // risk/alert driven visuals
    const s = this.sim;
    const active = s.detected && !s.resolved;
    const alertTarget = this.demo.localize ? 0.85 : active ? 0.22 : 0;
    c.alert = damp(c.alert, alertTarget, 3, dt);
    this.buildings.uniforms.uAlertSector.value = 1;
    this.buildings.uniforms.uAlertLevel.value = c.alert;
    c.impactB = damp(c.impactB, this.demo.impact ? 1 : 0, 3, dt);
    this.buildings.uniforms.uImpactLevel.value = c.impactB;
    this.sectors.setAlert('B-12', this.demo.localize ? 1 : active ? 0.55 : 0);
    this.sectors.setMapMode(v.view === 'map' ? 1 : 0);
    const heat = s.resolved ? 0 : Math.max(v.heat ? 1 : 0, v.view === 'map' && active ? 1 : 0, this.demo.localize ? 1 : 0, active ? 0.4 : 0, s.leakSeverity > 0.04 ? 0.15 : 0);
    this.risk.setHeat(heat);
    this.risk.setBlast(!s.resolved && (v.blast || this.demo.blast || (active && s.forecastHours >= 36)) ? 1 : 0);
    this.risk.setSpread(Math.min(1, 0.25 + s.forecastHours / 72));
    this.utilities.setLeakSeverity(this.leak.currentSeverity);
    this.ground.setWetness(Math.min(1, this.leak.currentSeverity * 1.15));
    this.ground.setGlow(this.utilities.glowLevels());

    // ---- subsystem updates -------------------------------------------------------
    this.ground.update(t);
    this.roads.update(t);
    this.water.update(t);
    this.buildings.update(t);
    this.utilities.update(dt, t);
    this.leak.update(dt, t, this.renderer.getPixelRatio(), this.height);
    this.sectors.update(dt, t);
    this.risk.update(dt, t);
    this.impact.update(dt, t);
    this.vehicles.update(dt, t);
    this.selectionMat.uniforms.uTime.value = t;

    // ---- hover picking -------------------------------------------------------------
    if (this.pointerDirty && this.pointerInside && !this.cam.busy) {
      this.pointerDirty = false;
      const h = this.pick();
      if (h?.id !== this.hover?.id) {
        this.hover = h;
        this.cb.onHover?.(h);
        this.renderer.domElement.style.cursor = h ? 'pointer' : '';
        this.sectors.setHover(this.vis.hoveredSector ?? (h?.kind === 'sector' ? h.sector ?? null : null));
        const hi = h?.kind === 'sector' ? SECTORS.find((x) => x.id === h.sector)?.index ?? -5 : -5;
        this.buildings.uniforms.uHoverSector.value = this.vis.hoveredSector ? SECTORS.find((x) => x.id === this.vis.hoveredSector)!.index : hi;
      }
    }
    if (this.vis.hoveredSector && !this.hover) {
      this.buildings.uniforms.uHoverSector.value = SECTORS.find((x) => x.id === this.vis.hoveredSector)!.index;
    } else if (!this.vis.hoveredSector && !this.hover) {
      this.buildings.uniforms.uHoverSector.value = -5;
    }

    // ---- labels ----------------------------------------------------------------------
    const L = this.labels;
    const impactOn = this.demo.impact;
    for (const f of FACILITIES) L.setVisible(`fac-${f.id}`, impactOn || (v.view === 'map' && active) || v.blast);
    L.setVisible('pop', impactOn);
    for (const n of SENSOR_NODES) L.setVisible(`node-${n.id}`, this.demo.correlation);
    L.setVisible('crew', this.vehicles.crewActive);
    if (this.vehicles.crewActive) {
      L.setPosition('crew', this.vehicles.crewAnchor);
      L.setHTML('crew', `<span class="tl-crew">CREW W-3 · ${this.vehicles.crewProgress >= 1 ? 'ON SITE' : 'EN ROUTE'}</span>`);
    }
    L.setVisible('leaktag', active && this.vis.layers.water);
    L.setVisible('leakpin', active && v.view !== 'map');
    for (const sct of SECTORS) L.setVisible(`sector-${sct.id}`, c.surface > 0.4 || v.view === 'map');
    L.update(this.camera, this.width, this.height);

    // ---- screen anchors for React overlays ---------------------------------------------
    this.projectAnchor(this.leak.beaconTop, this.anchors.leak);
    this.projectAnchor(this.leak.markerPos, this.anchors.leakPipe);

    if (t - this.lastCamEmit > 0.15) {
      this.lastCamEmit = t;
      const tg = this.cam.controls.target;
      const off = this.camera.position.clone().sub(tg);
      this.cb.onCamera?.({ x: tg.x, z: tg.z, az: Math.atan2(off.x, off.z), dist: off.length() });
    }
  }

  private projectAnchor(p: THREE.Vector3, out: { x: number; y: number; visible: boolean }) {
    const v = p.clone().project(this.camera);
    out.visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
  }

  private adapt(dt: number) {
    this.frameAcc += dt;
    this.frameCount++;
    if (this.time - this.lastAdapt < 2.5 || this.frameCount < 30) return;
    const avg = this.frameAcc / this.frameCount;
    this.frameAcc = 0;
    this.frameCount = 0;
    this.lastAdapt = this.time;
    let next = this.pr;
    const floor = Math.min(0.75, this.maxPR);
    if (avg > 1 / 42 && this.pr > floor) next = Math.max(floor, this.pr - 0.25);
    else if (avg < 1 / 58 && this.pr < this.maxPR) next = Math.min(this.maxPR, this.pr + 0.25);
    if (next !== this.pr) {
      this.pr = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  // ---- picking ---------------------------------------------------------------------------
  private pick(): HoverInfo | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = [];
    if (this.cur.buildings > 0.5) targets.push(this.buildings.mesh);
    for (const m of this.utilities.pickables) if (m.parent?.visible) targets.push(m);
    targets.push(...this.sectors.meshes);
    const hits = this.raycaster.intersectObjects(targets, false);
    const transparentGround = this.cur.surface < 0.6 || this.tiles.reveal > 0.5;
    if (transparentGround) {
      for (const h of hits) {
        if (!this.utilities.pickables.includes(h.object as THREE.InstancedMesh)) continue;
        if (this.soilOccluded(h.point, h.distance)) continue;
        const seg = this.utilities.getSegment(h.object, h.instanceId ?? -1);
        if (seg) return { kind: 'asset', id: seg.assetId, asset: refOf(seg) };
      }
    }
    for (const h of hits) {
      if (h.object === this.buildings.mesh) {
        const si = this.buildings.sectorOfInstance(h.instanceId ?? -1);
        if (si >= 0) return { kind: 'sector', id: SECTORS[si].id, sector: SECTORS[si].id };
        return null;
      }
      if (this.utilities.pickables.includes(h.object as THREE.InstancedMesh)) {
        if (this.soilOccluded(h.point, h.distance)) continue;
        const seg = this.utilities.getSegment(h.object, h.instanceId ?? -1);
        if (seg) return { kind: 'asset', id: seg.assetId, asset: refOf(seg) };
        continue;
      }
      const sid = this.sectors.sectorOf(h.object);
      if (sid) return { kind: 'sector', id: sid, sector: sid };
    }
    return null;
  }

  private soilOccluded(point: THREE.Vector3, dist: number) {
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    if (point.y < 0 && this.cur.surface > 0.6 && this.tiles.reveal < 0.5 && d.y < 0 && o.y > 0) {
      const tg = -o.y / d.y;
      const gz = o.z + d.z * tg;
      if (tg < dist - 0.1 && gz < FACE_Z) return true;
    }
    if (point.z < FACE_Z - 0.05 && d.z < 0 && o.z > FACE_Z) {
      const tf = (FACE_Z - o.z) / d.z;
      const fy = o.y + d.y * tf;
      if (tf < dist && fy < 0 && fy > BENCH_Y && !inNiche(fy, FACE_Z)) return true;
    }
    if (point.y < BENCH_Y && d.y < 0 && o.y > BENCH_Y) {
      const tb = (BENCH_Y - o.y) / d.y;
      const bz = o.z + d.z * tb;
      if (tb < dist && bz > FACE_Z && bz < LOWER_FACE_Z) return true;
    }
    if (point.z < LOWER_FACE_Z - 0.05 && d.z < 0 && o.z > LOWER_FACE_Z) {
      const tf = (LOWER_FACE_Z - o.z) / d.z;
      const fy = o.y + d.y * tf;
      if (tf < dist && fy < BENCH_Y && fy > DEEP_Y && !inNiche(fy, LOWER_FACE_Z)) return true;
    }
    return false;
  }

  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pointerDirty = true;
    this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    if (this.hover) {
      this.hover = null;
      this.cb.onHover?.(null);
      this.sectors.setHover(this.vis.hoveredSector);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (moved > 5 || performance.now() - this.downAt.t > 450) return;
    this.onPointerMove(e);
    const h = this.pick();
    if (!h) {
      if (this.selectedAsset) this.cb.onSelectAsset?.(null);
      return;
    }
    if (h.kind === 'asset' && h.asset) this.cb.onSelectAsset?.(h.asset);
    else if (h.kind === 'sector' && h.sector) this.cb.onSelectSector?.(h.sector);
  };

  private onDblClick = (e: MouseEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const h = this.pick();
    if (h?.kind === 'asset' && h.asset) {
      this.cb.onSelectAsset?.(h.asset);
      this.followAsset(h.asset.assetId);
    }
  };
}

function inNiche(y: number, faceZ: number) {
  return UTILITY_ORDER.some((u) => {
    const n = UTILITIES[u].niche;
    return n.faceZ === faceZ && y >= n.y0 && y <= n.y1;
  });
}

function sectorChip(id: SectorId, risk: RiskLevel) {
  const label = risk === 'high' ? 'HIGH RISK' : risk === 'medium' ? 'MEDIUM' : 'LOW';
  return `<span class="tl-sector risk-${risk}"><i></i><b>${id}</b><em>${label}</em></span>`;
}
