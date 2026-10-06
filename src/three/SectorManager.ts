import * as THREE from 'three';
import { damp } from './utils/random';
import { SECTORS, type RiskLevel, type SectorId } from '../simulation/infrastructureData';

export const RISK_COLORS: Record<RiskLevel, string> = {
  high: '#ff4a3d',
  medium: '#ffc34a',
  low: '#2f9bff',
};

interface SectorVisual {
  id: SectorId;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  hover: number;
  selected: number;
  alert: number;
  targetAlert: number;
  color: THREE.Color;
  targetColor: THREE.Color;
}

/**
 * Sector overlays on the ground plane: dashed outline + soft inner glow that
 * brightens on hover / selection, tinted by risk, pulsing for active alerts.
 * The overlay meshes double as raycast pickers.
 */
export class SectorManager {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private visuals = new Map<SectorId, SectorVisual>();
  private hoverId: SectorId | null = null;
  private selectedId: SectorId | null = null;
  private map = 0;
  private targetMap = 0;

  constructor() {
    for (const s of SECTORS) {
      const w = s.rect.x1 - s.rect.x0;
      const d = s.rect.z1 - s.rect.z0;
      const color = new THREE.Color(RISK_COLORS[s.baseRisk]);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
        uniforms: {
          uColor: { value: color.clone() },
          uSize: { value: new THREE.Vector2(w, d) },
          uHover: { value: 0 },
          uSelected: { value: 0 },
          uAlert: { value: 0 },
          uMap: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec2 uSize; uniform float uHover; uniform float uSelected;
          uniform float uAlert; uniform float uMap; uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv * uSize;
            float ed = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
            float line = 1.0 - smoothstep(0.2, 0.75, ed);
            float glow = exp(-ed * 0.28);
            float dash = step(0.45, fract((p.x + p.y) / 3.2));
            float pulse = 0.55 + 0.45 * sin(uTime * 3.2);
            float emph = max(uHover, uSelected);
            float border = line * (0.22 * mix(dash, 1.0, emph) + uHover * 0.75 + uSelected * 1.0 + uAlert * 0.8 * pulse + uMap * 0.6);
            vec2 g = abs(fract(p / 7.0 - 0.5) - 0.5) * 7.0;
            float grid = (1.0 - smoothstep(0.0, 0.07, min(g.x, g.y))) * (0.04 * uMap + 0.05 * uHover);
            float fill = uMap * 0.085 + uHover * 0.03 + uSelected * 0.025 + uAlert * 0.045 * pulse;
            float a = border + glow * (uHover * 0.2 + uSelected * 0.25 + uAlert * 0.3 * pulse) + fill + grid;
            vec3 col = mix(uColor, vec3(0.35, 0.85, 1.0), uHover * 0.55) * (1.0 + line * 0.6);
            gl_FragColor = vec4(col, a * 0.9);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
      mesh.position.set((s.rect.x0 + s.rect.x1) / 2, 0.42, (s.rect.z0 + s.rect.z1) / 2);
      mesh.renderOrder = 3;
      mesh.userData.sector = s.id;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.visuals.set(s.id, { id: s.id, mesh, mat, hover: 0, selected: 0, alert: 0, targetAlert: 0, color, targetColor: color.clone() });
    }
  }

  sectorOf(obj: THREE.Object3D): SectorId | null {
    return (obj.userData.sector as SectorId) ?? null;
  }

  setHover(id: SectorId | null) {
    this.hoverId = id;
  }

  setSelected(id: SectorId | null) {
    this.selectedId = id;
  }

  setRisk(id: SectorId, level: RiskLevel) {
    this.visuals.get(id)?.targetColor.set(RISK_COLORS[level]);
  }

  setAlert(id: SectorId, v: number) {
    const s = this.visuals.get(id);
    if (s) s.targetAlert = v;
  }

  setMapMode(v: number) {
    this.targetMap = v;
  }

  update(dt: number, t: number) {
    this.map = damp(this.map, this.targetMap, 4, dt);
    for (const s of this.visuals.values()) {
      s.hover = damp(s.hover, this.hoverId === s.id ? 1 : 0, 10, dt);
      s.selected = damp(s.selected, this.selectedId === s.id ? 1 : 0, 6, dt);
      s.alert = damp(s.alert, s.targetAlert, 3, dt);
      s.color.lerp(s.targetColor, 1 - Math.exp(-3 * dt));
      const u = s.mat.uniforms;
      u.uHover.value = s.hover;
      u.uSelected.value = s.selected;
      u.uAlert.value = s.alert;
      u.uMap.value = this.map;
      u.uTime.value = t;
      (u.uColor.value as THREE.Color).copy(s.color);
    }
  }

  dispose() {
    for (const s of this.visuals.values()) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
  }
}
