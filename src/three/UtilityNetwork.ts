import * as THREE from 'three';
import { getIconTexture } from './utils/textures';
import { damp } from './utils/random';
import {
  BENCH_Y,
  FACE_Z,
  LEAK,
  MAIN,
  ROUTES,
  UTILITIES,
  UTILITY_ORDER,
  VALVES,
  sectorAt,
  type RouteDef,
  type SectorId,
  type UtilityId,
} from '../simulation/infrastructureData';

export interface PipeSegment {
  id: number;
  utility: UtilityId;
  assetId: string;
  kind: RouteDef['kind'];
  routeIndex: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
  flowStart: number;
  length: number;
  sector: SectorId | null;
  instanceId: number;
}

const MAX_SEG = 24;
const FLANGE_STEP = 9;

interface LayerUniforms {
  uTime: { value: number };
  uSpeed: { value: number };
  uSpacing: { value: number };
  uWidth: { value: number };
  uStrength: { value: number };
  uFlowColor: { value: THREE.Color };
  uEmph: { value: number };
  uBoost: { value: number };
  uLeakPos: { value: THREE.Vector3 };
  uLeakSev: { value: number };
  uIsWater: { value: number };
  uBaseEmis: { value: number };
  uThemeEmis: { value: number };
}

class Layer {
  readonly group = new THREE.Group();
  readonly uniforms: LayerUniforms;
  pipeMat!: THREE.MeshStandardMaterial;
  fitMat!: THREE.MeshStandardMaterial;
  pipes!: THREE.InstancedMesh;
  segments: PipeSegment[] = [];
  emphasis = 1;
  targetEmphasis = 1;
  markerMats: THREE.Material[] = [];

  constructor(readonly utility: UtilityId) {
    const spec = UTILITIES[utility];
    const c = new THREE.Color(spec.color);
    const cable = utility === 'electricity' || utility === 'telecom';
    this.uniforms = {
      uTime: { value: 0 },
      uSpeed: { value: spec.flow.speed },
      uSpacing: { value: spec.flow.spacing },
      uWidth: { value: spec.flow.width },
      uStrength: { value: spec.flow.strength },
      uFlowColor: { value: c.clone() },
      uEmph: { value: 1 },
      uBoost: { value: 1 },
      uLeakPos: { value: new THREE.Vector3(...LEAK.center) },
      uLeakSev: { value: 0 },
      uIsWater: { value: utility === 'water' ? 1 : 0 },
      uBaseEmis: { value: cable ? 0.07 : utility === 'sewage' ? 0.02 : 0.035 },
      uThemeEmis: { value: 1 },
    };
  }
}

/**
 * Five underground utility systems. Each system is one THREE.Group (so layer
 * toggles really hide geometry) containing instanced pipe segments with an
 * animated flow-pulse shader, flanges, junction hubs and surface markers.
 */
export class UtilityNetwork {
  readonly group = new THREE.Group();
  readonly layers = {} as Record<UtilityId, Layer>;
  readonly segments: PipeSegment[] = [];
  readonly pickables: THREE.InstancedMesh[] = [];
  readonly structures = new THREE.Group();
  private segByAsset = new Map<string, PipeSegment>();
  private hubs: Record<UtilityId, { p: THREE.Vector3; r: number }[]> = { water: [], electricity: [], telecom: [], cooling: [], sewage: [] };
  private glassMat: THREE.MeshStandardMaterial;
  private edgeMat: THREE.LineBasicMaterial;
  private ledMat: THREE.MeshBasicMaterial;

  constructor() {
    for (const u of UTILITY_ORDER) {
      const layer = new Layer(u);
      this.layers[u] = layer;
      this.group.add(layer.group);
    }
    this.buildSegments();
    for (const u of UTILITY_ORDER) this.buildLayerMeshes(this.layers[u]);

    // shared structures (glass access chambers)
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fdcff,
      emissive: 0x0b3346,
      transparent: true,
      opacity: 0.05,
      roughness: 0.05,
      metalness: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xa8d8f0, transparent: true, opacity: 0.38 });
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.2) });
    this.buildVaults();
    this.buildFittings();
    this.buildMarkers();
    this.group.add(this.structures);
  }

  // ---------------------------------------------------------------------------
  private buildSegments() {
    const counters = new Map<string, number>();
    let id = 0;
    ROUTES.forEach((route, ri) => {
      const p0 = new THREE.Vector3(...route.points[0]);
      const p1 = new THREE.Vector3(...route.points[1]);
      const len = p0.distanceTo(p1);
      const dir = p1.clone().sub(p0).normalize();
      // split at junctions with other routes of the same utility
      const ts = new Set<number>([0, 1]);
      ROUTES.forEach((other, oi) => {
        if (oi === ri || other.utility !== route.utility) return;
        const hit = intersect(route, other);
        if (hit) {
          const t = hit.clone().sub(p0).dot(dir) / len;
          if (t > 0.002 && t < 0.998) ts.add(Math.round(t * 1e5) / 1e5);
          this.addHub(route.utility, hit, Math.max(route.radius, other.radius) * 1.12);
        }
      });
      if (route.utility === 'water' && route.kind === 'trunk') {
        for (const v of VALVES) ts.add(Math.round(((p0.x - v.x) / (p0.x - p1.x)) * 1e5) / 1e5);
      }
      const sorted = [...ts].sort((a, b) => a - b);
      const pieces: [number, number][] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const segLen = (b - a) * len;
        const n = Math.max(1, Math.ceil(segLen / MAX_SEG));
        for (let k = 0; k < n; k++) pieces.push([a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n]);
      }
      for (const [ta, tb] of pieces) {
        const a = p0.clone().lerp(p1, ta);
        const b = p0.clone().lerp(p1, tb);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const inMain = mid.x >= MAIN.x0 && mid.x <= MAIN.x1 && mid.z >= MAIN.z0 && mid.z <= MAIN.z1 + 8;
        const sector = inMain ? sectorAt(mid.x, Math.min(mid.z, MAIN.z1)) : null;
        const spec = UTILITIES[route.utility];
        const code = sector ? sectorCode(sector) : 'TRK';
        let assetId: string;
        const containsLeak =
          route.utility === 'water' && route.kind === 'trunk' && Math.min(a.x, b.x) <= LEAK.x && Math.max(a.x, b.x) >= LEAK.x;
        if (containsLeak) assetId = LEAK.assetId;
        else {
          const key = `${spec.prefix}-${code}`;
          let n = counters.get(key) ?? 11 + (hashCode(key) % 17);
          if (key === 'WTR-B12' && n === 47) n++;
          counters.set(key, n + 1);
          assetId = `${key}-${String(n).padStart(3, '0')}`;
        }
        const seg: PipeSegment = {
          id: id++,
          utility: route.utility,
          assetId,
          kind: route.kind,
          routeIndex: ri,
          a,
          b,
          radius: route.radius,
          flowStart: ta * len,
          length: (tb - ta) * len,
          sector,
          instanceId: this.layers[route.utility].segments.length,
        };
        this.layers[route.utility].segments.push(seg);
        this.segments.push(seg);
        this.segByAsset.set(assetId, seg);
      }
    });
  }

  private addHub(u: UtilityId, p: THREE.Vector3, r: number) {
    const list = this.hubs[u];
    const hit = list.find((h) => h.p.distanceToSquared(p) < 0.25);
    if (hit) hit.r = Math.max(hit.r, r);
    else list.push({ p: p.clone(), r });
  }

  private buildLayerMeshes(layer: Layer) {
    const spec = UTILITIES[layer.utility];
    const color = new THREE.Color(spec.color);
    const cable = layer.utility === 'electricity' || layer.utility === 'telecom';
    // painted-metal body: identity hue, muted saturation (the vivid colour is kept for flow pulses)
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const body = new THREE.Color().setHSL(hsl.h, hsl.s * 0.6, Math.min(0.4, hsl.l * 0.6));
    layer.pipeMat = new THREE.MeshStandardMaterial({
      color: body,
      roughness: layer.utility === 'sewage' ? 0.62 : cable ? 0.5 : 0.34,
      metalness: cable ? 0.1 : 0.35,
      envMapIntensity: 1.1,
    });
    patchPipeMaterial(layer.pipeMat, layer.uniforms);
    layer.fitMat = new THREE.MeshStandardMaterial({
      color: body.clone().lerp(new THREE.Color(0x8a96a3), 0.45),
      roughness: 0.4,
      metalness: 0.6,
      envMapIntensity: 1.2,
    });

    const segs = layer.segments;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, cable ? 10 : 22, 1, false);
    const mesh = new THREE.InstancedMesh(cyl, layer.pipeMat, segs.length);
    const flowStart = new Float32Array(segs.length);
    const flowLen = new Float32Array(segs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const flanges: THREE.Matrix4[] = [];
    segs.forEach((s, i) => {
      const dir = s.b.clone().sub(s.a);
      const len = dir.length();
      dir.normalize();
      q.setFromUnitVectors(up, dir);
      const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
      m.compose(mid, q, new THREE.Vector3(s.radius, len, s.radius));
      mesh.setMatrixAt(i, m);
      flowStart[i] = s.flowStart;
      flowLen[i] = s.length;
      if (!cable) {
        for (let d = FLANGE_STEP / 2; d < len - 1.2; d += FLANGE_STEP) {
          const p = s.a.clone().addScaledVector(dir, d);
          if (Math.abs(p.x) > 330) continue;
          if (layer.utility === 'water' && p.distanceTo(new THREE.Vector3(...LEAK.center)) < 3) continue;
          flanges.push(new THREE.Matrix4().compose(p, q.clone(), new THREE.Vector3(s.radius * 1.17, 0.24, s.radius * 1.17)));
        }
      }
    });
    cyl.setAttribute('aFlowStart', new THREE.InstancedBufferAttribute(flowStart, 1));
    cyl.setAttribute('aFlowLen', new THREE.InstancedBufferAttribute(flowLen, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.utility = layer.utility;
    layer.pipes = mesh;
    layer.group.add(mesh);
    this.pickables.push(mesh);

    if (flanges.length) {
      const fl = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 22), layer.fitMat, flanges.length);
      flanges.forEach((fm, i) => fl.setMatrixAt(i, fm));
      fl.instanceMatrix.needsUpdate = true;
      fl.computeBoundingSphere();
      layer.group.add(fl);
    }
    const hubs = this.hubs[layer.utility];
    if (hubs.length) {
      const hm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), layer.fitMat, hubs.length);
      hubs.forEach((h, i) => {
        m.compose(h.p, new THREE.Quaternion(), new THREE.Vector3(h.r, h.r, h.r));
        hm.setMatrixAt(i, m);
      });
      hm.instanceMatrix.needsUpdate = true;
      hm.computeBoundingSphere();
      layer.group.add(hm);
    }
  }

  private buildVaults() {
    const xs = [-44, -8, 52, -100];
    for (const x of xs) {
      const top = 0.35;
      const bottom = BENCH_Y + 0.05;
      const z0 = 67.4;
      const z1 = FACE_Z + 2.2;
      const geo = new THREE.BoxGeometry(5.2, top - bottom, z1 - z0);
      const box = new THREE.Mesh(geo, this.glassMat);
      box.position.set(x, (top + bottom) / 2, (z0 + z1) / 2);
      box.renderOrder = 5;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat);
      edges.position.copy(box.position);
      // utility shelves inside the chamber (at each niche ceiling)
      for (const y of [UTILITIES.electricity.niche.y1, UTILITIES.telecom.niche.y1, UTILITIES.water.niche.y1]) {
        const shelf = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5.2, 0.01, z1 - z0)), this.edgeMat);
        shelf.position.set(x, y, (z0 + z1) / 2);
        this.structures.add(shelf);
      }
      const lid = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 2.6), new THREE.MeshStandardMaterial({ color: 0x3d4752, metalness: 0.6, roughness: 0.4 }));
      lid.position.set(x, top + 0.09, 68.6);
      this.structures.add(box, edges, lid);
    }
  }

  private buildFittings() {
    const water = this.layers.water;
    const spec = UTILITIES.water;
    const r = spec.conduits[0].r;
    const z = spec.conduits[0].z;
    const y = spec.depth;
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    for (const v of VALVES) {
      const bodyG = new THREE.CylinderGeometry(r * 1.32, r * 1.32, 2.0, 24);
      const body = new THREE.Mesh(bodyG, water.fitMat);
      body.quaternion.copy(along);
      body.position.set(v.x, y, z);
      const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 12), water.fitMat);
      bonnet.position.set(v.x, y + r + 0.5, z);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc23b2a, metalness: 0.5, roughness: 0.4 }));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(v.x, y + r + 1.15, z);
      water.group.add(body, bonnet, wheel);
    }
    // flow sensor clamp at the B-12 branch junction
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, r * 2.5, r * 2.5), new THREE.MeshStandardMaterial({ color: 0x1d2630, metalness: 0.6, roughness: 0.3 }));
    clamp.position.set(-11, y, z);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), this.ledMat);
    led.position.set(-11, y + 0.3, z + r * 1.26);
    water.group.add(clamp, led);
  }

  private buildMarkers() {
    const prefs: Record<UtilityId, [number, number][]> = {
      water: [
        [53, -8],
        [-80, -44],
      ],
      electricity: [
        [15.4, 25.4],
        [85.4, -46.6],
      ],
      telecom: [[-18.3, -9.3]],
      cooling: [[54.3, -6.7]],
      sewage: [[-49.4, -41.4]],
    };
    for (const u of UTILITY_ORDER) {
      const layer = this.layers[u];
      const spec = UTILITIES[u];
      const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(spec.color), transparent: true, opacity: 0.5 });
      const spriteMat = new THREE.SpriteMaterial({ map: getIconTexture(u, spec.color), transparent: true, depthWrite: false });
      layer.markerMats.push(lineMat, spriteMat);
      for (const [px, pz] of prefs[u]) {
        const best = this.hubs[u].reduce<{ p: THREE.Vector3; r: number } | null>(
          (acc, h) => (!acc || Math.hypot(h.p.x - px, h.p.z - pz) < Math.hypot(acc.p.x - px, acc.p.z - pz) ? h : acc),
          null,
        );
        if (!best) continue;
        const hub = best.p;
        const top = 9;
        const lg = new THREE.BufferGeometry().setFromPoints([hub.clone(), new THREE.Vector3(hub.x, top - 1.2, hub.z)]);
        layer.group.add(new THREE.Line(lg, lineMat));
        const s = new THREE.Sprite(spriteMat);
        s.position.set(hub.x, top, hub.z);
        s.scale.setScalar(2.5);
        s.renderOrder = 8;
        layer.group.add(s);
      }
    }
  }

  // ---------------------------------------------------------------------------
  getSegment(mesh: THREE.Object3D, instanceId: number): PipeSegment | null {
    const u = mesh.userData.utility as UtilityId | undefined;
    if (!u) return null;
    return this.layers[u].segments[instanceId] ?? null;
  }

  getByAsset(assetId: string) {
    return this.segByAsset.get(assetId) ?? null;
  }

  /** Points along a segment's whole route (for camera follow). */
  routePoints(seg: PipeSegment): THREE.Vector3[] {
    const r = ROUTES[seg.routeIndex];
    return r.points.map((p) => new THREE.Vector3(...p));
  }

  setVisible(u: UtilityId, v: boolean) {
    this.layers[u].group.visible = v;
  }

  /** Emphasise one utility (others dim) — null resets. */
  setEmphasis(u: UtilityId | null) {
    for (const k of UTILITY_ORDER) this.layers[k].targetEmphasis = u === null ? 1 : k === u ? 1.6 : 0.25;
  }

  setDay(day: boolean) {
    for (const k of UTILITY_ORDER) this.layers[k].uniforms.uThemeEmis.value = day ? 0.45 : 1;
    this.edgeMat.color.set(day ? 0x3f6f8f : 0xa8d8f0);
    this.edgeMat.opacity = day ? 0.5 : 0.38;
    this.glassMat.opacity = day ? 0.12 : 0.05;
  }

  setBoost(v: number) {
    for (const k of UTILITY_ORDER) this.layers[k].uniforms.uBoost.value = v;
  }

  setLeakSeverity(s: number) {
    this.layers.water.uniforms.uLeakSev.value = s;
  }

  /** Current effective emphasis per utility (drives soil glow). */
  glowLevels(): Record<UtilityId, number> {
    const out = {} as Record<UtilityId, number>;
    for (const k of UTILITY_ORDER) {
      const l = this.layers[k];
      out[k] = l.group.visible ? l.emphasis * (0.6 + 0.4 * l.uniforms.uBoost.value) : 0;
    }
    return out;
  }

  update(dt: number, t: number) {
    for (const k of UTILITY_ORDER) {
      const l = this.layers[k];
      l.emphasis = damp(l.emphasis, l.targetEmphasis, 4, dt);
      l.uniforms.uEmph.value = l.emphasis;
      l.uniforms.uTime.value = t;
      for (const mm of l.markerMats) mm.opacity = Math.min(1, 0.25 + 0.75 * Math.min(l.emphasis, 1)) * (mm instanceof THREE.LineBasicMaterial ? 0.5 : 1);
    }
    this.ledMat.color.setRGB(0.6, 2.6 * (0.6 + 0.4 * Math.sin(t * 5)), 3.2);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        const mm = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose());
      }
    });
  }
}

function sectorCode(s: SectorId) {
  const [l, n] = s.split('-');
  return `${l}${n.padStart(2, '0')}`;
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Intersection of two axis-aligned straight routes (same depth), if any. */
function intersect(a: RouteDef, b: RouteDef): THREE.Vector3 | null {
  const [a0, a1] = a.points;
  const [b0, b1] = b.points;
  const aAlongX = Math.abs(a0[0] - a1[0]) > Math.abs(a0[2] - a1[2]);
  const bAlongX = Math.abs(b0[0] - b1[0]) > Math.abs(b0[2] - b1[2]);
  if (aAlongX === bAlongX) return null;
  const [h0, h1] = aAlongX ? [a0, a1] : [b0, b1];
  const [v0, v1] = aAlongX ? [b0, b1] : [a0, a1];
  const x = v0[0];
  const z = h0[2];
  const eps = 0.05;
  const inH = x >= Math.min(h0[0], h1[0]) - eps && x <= Math.max(h0[0], h1[0]) + eps;
  const inV = z >= Math.min(v0[2], v1[2]) - eps && z <= Math.max(v0[2], v1[2]) + eps;
  if (!inH || !inV || Math.abs(h0[1] - v0[1]) > 0.01) return null;
  return new THREE.Vector3(x, h0[1], z);
}

function patchPipeMaterial(mat: THREE.MeshStandardMaterial, uniforms: LayerUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aFlowStart; attribute float aFlowLen;
         varying float vFlow; varying vec3 vPW;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vFlow = aFlowStart + (position.y + 0.5) * aFlowLen;
         mat4 pkIm = mat4(1.0);
         #ifdef USE_INSTANCING
           pkIm = instanceMatrix;
         #endif
         vPW = (modelMatrix * pkIm * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform float uSpeed; uniform float uSpacing; uniform float uWidth;
         uniform float uStrength; uniform vec3 uFlowColor; uniform float uEmph; uniform float uBoost;
         uniform vec3 uLeakPos; uniform float uLeakSev; uniform float uIsWater; uniform float uBaseEmis; uniform float uThemeEmis;
         varying float vFlow; varying vec3 vPW;
         float pkH(float n) { return fract(sin(n * 91.345) * 47453.21); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float pkDl = length(vPW - uLeakPos);
         float pkDmg = exp(-pkDl * pkDl * 0.38) * uLeakSev * uIsWater;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.12, 0.07), clamp(pkDmg * 0.9, 0.0, 0.85));
         diffuseColor.rgb *= mix(0.3, 1.0, clamp(uEmph, 0.0, 1.0));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float ph = (vFlow - uTime * uSpeed) / uSpacing;
         float cellId = floor(ph);
         float d = fract(ph) - 0.5;
         float bw = uWidth * 0.42;
         float band = exp(-(d * d) / (bw * bw) * 0.5);
         // flow disrupted downstream of the breach (west of the leak on the trunk)
         float down = uIsWater * step(vPW.x, uLeakPos.x - 1.5) * step(abs(vPW.z - uLeakPos.z), 2.5) * step(abs(vPW.y - uLeakPos.y), 2.5);
         float missing = step(0.45, pkH(cellId + 3.7));
         float flick = 0.55 + 0.45 * sin(uTime * 23.0 + cellId * 4.1);
         band *= mix(1.0, missing * flick * 0.6, down * clamp(uLeakSev * 1.6, 0.0, 1.0));
         float emph = uEmph * uBoost * uThemeEmis;
         vec3 pkV = normalize(vViewPosition);
         float rim = pow(1.0 - abs(dot(normal, pkV)), 3.0);
         totalEmissiveRadiance += uFlowColor * (uBaseEmis + rim * 0.08) * emph;
         totalEmissiveRadiance += uFlowColor * band * uStrength * 0.42 * emph * (1.0 - pkDmg);
         // breach glow
         float pulse = 0.75 + 0.25 * sin(uTime * 7.0);
         totalEmissiveRadiance += vec3(1.0, 0.28, 0.08) * pkDmg * 1.5 * pulse;`,
      );
  };
  mat.customProgramCacheKey = () => 'pk-pipe-v1';
}
