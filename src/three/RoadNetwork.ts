import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './utils/glsl';
import { getLightPoolTexture } from './utils/textures';
import { Rng } from './utils/random';
import type { CityPlan } from './CityGenerator';
import {
  BLOCKS,
  CANAL,
  MAIN,
  OUTER,
  ROAD_W,
  X_ROADS,
  Z_ROADS,
  rectContains,
  subtractMany,
  type Rect,
} from '../simulation/infrastructureData';

const PLINTH_H = 0.25;

/**
 * Street level of the twin: asphalt, raised blocks with sidewalks, lane
 * markings, crosswalks, canal bridges, street lights (with light pools on the
 * road), trees, parks and the low-detail surroundings.
 */
export class RoadNetwork {
  readonly group = new THREE.Group();
  /** Detailed-area surface materials that fade for the underground reveal. */
  private fadeSurface: THREE.Material[] = [];
  /** Street furniture that fades together with buildings. */
  private fadeFurniture: THREE.Material[] = [];
  private poolMat: THREE.MeshBasicMaterial;
  private railMat: THREE.MeshBasicMaterial;
  private headMat!: THREE.MeshBasicMaterial;
  private markMat!: THREE.MeshStandardMaterial;
  private reveal = 0;
  private day = false;
  /** materials whose base colour changes between night and day */
  private themed: { mat: THREE.MeshStandardMaterial; night: THREE.Color; day: THREE.Color }[] = [];

  private theme(mat: THREE.MeshStandardMaterial, day: string | THREE.Color) {
    this.themed.push({ mat, night: mat.color.clone(), day: day instanceof THREE.Color ? day : new THREE.Color(day) });
    return mat;
  }

  constructor(plan: CityPlan) {
    const rng = new Rng(99);
    const inCanal = (x: number, z: number) => CANAL.rects.some((r) => rectContains(r, x, z));

    // ---- asphalt (detailed-district streets are RoadTiles slabs) -------------
    const outerAsphalt = this.theme(makeAsphaltMaterial(false), '#5b6169');
    const outerRects = subtractMany([{ ...OUTER, x0: -1400, x1: 1400, z0: -1400 }], [MAIN, ...CANAL.rects]);
    this.group.add(new THREE.Mesh(mergeGeometries(outerRects.map((r) => groundRect(r, 0))), outerAsphalt));

    // ---- block plinths (sidewalks) -----------------------------------------
    const plinthMat = this.theme(new THREE.MeshStandardMaterial({ color: 0x343c46, roughness: 0.92, metalness: 0, transparent: true }), '#a7adb3');
    patchPaving(plinthMat);
    this.fadeSurface.push(plinthMat);
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const plinths = new THREE.InstancedMesh(unit, plinthMat, BLOCKS.length);
    const m = new THREE.Matrix4();
    BLOCKS.forEach((b, i) => {
      m.compose(new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(b.x1 - b.x0, PLINTH_H, b.z1 - b.z0));
      plinths.setMatrixAt(i, m);
    });
    plinths.renderOrder = 1;
    this.group.add(plinths);

    const outerPlinthMat = this.theme(new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.95 }), '#9aa1a8');
    const outerPlinths = new THREE.InstancedMesh(unit.clone(), outerPlinthMat, plan.distantBlocks.length);
    plan.distantBlocks.forEach((b, i) => {
      m.compose(new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(b.x1 - b.x0, 0.2, b.z1 - b.z0));
      outerPlinths.setMatrixAt(i, m);
    });
    this.group.add(outerPlinths);

    // ---- parks & sports field ---------------------------------------------
    const grassMat = this.theme(new THREE.MeshStandardMaterial({ color: 0x1c3a2a, roughness: 1, transparent: true }), '#5b8a55');
    this.fadeSurface.push(grassMat);
    const greens = [...plan.parks, ...plan.fields].map((r) => groundRect(r, PLINTH_H + 0.03));
    if (greens.length) {
      const g = new THREE.Mesh(mergeGeometries(greens), grassMat);
      g.renderOrder = 1;
      this.group.add(g);
    }
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ef, emissive: 0x2a3640, roughness: 0.6, transparent: true });
    this.fadeSurface.push(lineMat);
    const fieldLines: THREE.BufferGeometry[] = [];
    for (const f of plan.fields) {
      const y = PLINTH_H + 0.06;
      const t = 0.18;
      fieldLines.push(groundRect({ x0: f.x0 + 0.5, x1: f.x1 - 0.5, z0: f.z0 + 0.5, z1: f.z0 + 0.5 + t }, y));
      fieldLines.push(groundRect({ x0: f.x0 + 0.5, x1: f.x1 - 0.5, z0: f.z1 - 0.5 - t, z1: f.z1 - 0.5 }, y));
      fieldLines.push(groundRect({ x0: f.x0 + 0.5, x1: f.x0 + 0.5 + t, z0: f.z0 + 0.5, z1: f.z1 - 0.5 }, y));
      fieldLines.push(groundRect({ x0: f.x1 - 0.5 - t, x1: f.x1 - 0.5, z0: f.z0 + 0.5, z1: f.z1 - 0.5 }, y));
      const mx = (f.x0 + f.x1) / 2;
      fieldLines.push(groundRect({ x0: mx - t / 2, x1: mx + t / 2, z0: f.z0 + 0.5, z1: f.z1 - 0.5 }, y));
    }

    // ---- lane markings & crosswalks ----------------------------------------
    const marks: THREE.BufferGeometry[] = [...fieldLines];
    const nearX = (x: number) => X_ROADS.some((r) => Math.abs(x - r) < ROAD_W / 2 + 1.5);
    const nearZ = (z: number) => Z_ROADS.some((r) => Math.abs(z - r) < ROAD_W / 2 + 1.5);
    for (const x of X_ROADS) {
      for (let z = MAIN.z0 + 1; z < Z_ROADS[3] + 2; z += 5) {
        if (nearZ(z) || nearZ(z + 2.4) || inCanal(x, z) || inCanal(x, z + 2.4)) continue;
        marks.push(groundRect({ x0: x - 0.11, x1: x + 0.11, z0: z, z1: z + 2.4 }, 0.03));
      }
    }
    for (const z of Z_ROADS) {
      for (let x = MAIN.x0 + 1; x < MAIN.x1 - 2; x += 5) {
        if (nearX(x) || nearX(x + 2.4) || inCanal(x, z) || inCanal(x + 2.4, z)) continue;
        marks.push(groundRect({ x0: x, x1: x + 2.4, z0: z - 0.11, z1: z + 0.11 }, 0.03));
      }
    }
    for (const x of X_ROADS) {
      for (const z of Z_ROADS) {
        if (inCanal(x, z)) continue;
        // four zebra crossings around the junction
        for (const s of [-1, 1]) {
          const zc = z + s * (ROAD_W / 2 + 1.4);
          if (zc < MAIN.z1 - 1 && !inCanal(x, zc)) {
            for (let k = -3; k <= 3; k++) marks.push(groundRect({ x0: x + k * 1.05 - 0.28, x1: x + k * 1.05 + 0.28, z0: zc - 1.0, z1: zc + 1.0 }, 0.03));
          }
          const xc = x + s * (ROAD_W / 2 + 1.4);
          if (!inCanal(xc, z)) {
            for (let k = -3; k <= 3; k++) marks.push(groundRect({ x0: xc - 1.0, x1: xc + 1.0, z0: z + k * 1.05 - 0.28, z1: z + k * 1.05 + 0.28 }, 0.03));
          }
        }
      }
    }
    const markMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cf, emissive: 0x1a232c, roughness: 0.7, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.markMat = markMat;
    this.fadeSurface.push(lineMat);
    const marksMesh = new THREE.Mesh(mergeGeometries(marks), markMat);
    marksMesh.renderOrder = 2;
    this.group.add(marksMesh);

    // ---- bridges -----------------------------------------------------------
    const deckMat = this.theme(new THREE.MeshStandardMaterial({ color: 0x3a434e, roughness: 0.8, metalness: 0.1 }), '#9097a0');
    this.railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 0.82) });
    const decks: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const addBridgeAlongX = (z: number, x0: number, x1: number) => {
      decks.push(boxGeo((x0 + x1) / 2, -0.45, z, x1 - x0, 1.1, ROAD_W + 1.4));
      for (const s of [-1, 1]) {
        decks.push(boxGeo((x0 + x1) / 2, 0.45, z + s * (ROAD_W / 2 + 0.5), x1 - x0, 0.7, 0.3));
        rails.push(boxGeo((x0 + x1) / 2, 0.85, z + s * (ROAD_W / 2 + 0.5), x1 - x0, 0.07, 0.07));
      }
    };
    const addBridgeAlongZ = (x: number, z0: number, z1: number) => {
      decks.push(boxGeo(x, -0.45, (z0 + z1) / 2, ROAD_W + 1.4, 1.1, z1 - z0));
      for (const s of [-1, 1]) {
        decks.push(boxGeo(x + s * (ROAD_W / 2 + 0.5), 0.45, (z0 + z1) / 2, 0.3, 0.7, z1 - z0));
        rails.push(boxGeo(x + s * (ROAD_W / 2 + 0.5), 0.85, (z0 + z1) / 2, 0.07, 0.07, z1 - z0));
      }
    };
    const c1 = CANAL.rects[0];
    const c2 = CANAL.rects[1];
    for (const z of plan.zLines) if (z < c1.z1 - 2 && z > -560) addBridgeAlongX(z, c1.x0 - 1.5, c1.x1 + 1.5);
    for (const x of plan.xLines) if (x < c2.x1 && x > -600) addBridgeAlongZ(x, c2.z0 - 1.5, c2.z1 + 1.5);
    const deckMesh = new THREE.Mesh(mergeGeometries(decks), deckMat);
    this.group.add(deckMesh);
    // asphalt top on decks
    const deckTop: THREE.BufferGeometry[] = [];
    for (const z of plan.zLines) if (z < c1.z1 - 2 && z > -560) deckTop.push(groundRect({ x0: c1.x0 - 1.5, x1: c1.x1 + 1.5, z0: z - ROAD_W / 2, z1: z + ROAD_W / 2 }, 0.11));
    for (const x of plan.xLines) if (x < c2.x1 && x > -600) deckTop.push(groundRect({ x0: x - ROAD_W / 2, x1: x + ROAD_W / 2, z0: c2.z0 - 1.5, z1: c2.z1 + 1.5 }, 0.11));
    this.group.add(new THREE.Mesh(mergeGeometries(deckTop), outerAsphalt));
    this.group.add(new THREE.Mesh(mergeGeometries(rails), this.railMat));

    // ---- street lights -----------------------------------------------------
    const lamps = plan.lamps;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5561, metalness: 0.6, roughness: 0.4, transparent: true });
    this.fadeFurniture.push(poleMat);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 5.6, 6).translate(0, 2.8 + PLINTH_H, 0), poleMat, lamps.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.5).translate(0, 5.5 + PLINTH_H, 0.7), poleMat, lamps.length);
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.92), transparent: true });
    this.fadeFurniture.push(this.headMat);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.1, 0.62).translate(0, 5.45 + PLINTH_H, 1.35), this.headMat, lamps.length);
    this.poolMat = new THREE.MeshBasicMaterial({
      map: getLightPoolTexture(),
      color: new THREE.Color(1.0, 0.74, 0.45).multiplyScalar(0.3),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, this.poolMat, lamps.length + plan.distantPools.length);
    const q = new THREE.Quaternion();
    lamps.forEach((l, i) => {
      const ang = Math.atan2(l.dirX, l.dirZ);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      m.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m);
      arms.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(l.x + l.dirX * 2.2, 0.06, l.z + l.dirZ * 2.2), new THREE.Quaternion(), new THREE.Vector3(11, 1, 11));
      pools.setMatrixAt(i, m);
    });
    plan.distantPools.forEach((p, j) => {
      const s = rng.range(8, 11);
      m.compose(new THREE.Vector3(p.x, 0.08, p.z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
      pools.setMatrixAt(lamps.length + j, m);
    });
    pools.renderOrder = 2;
    this.group.add(poles, arms, heads, pools);

    // ---- trees -------------------------------------------------------------
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1, transparent: true });
    // instance colours are night-tuned dark greens; daylight multiplies them up
    const leafMat = this.theme(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, flatShading: true }), new THREE.Color(2.1, 2.4, 1.7));
    this.fadeFurniture.push(trunkMat, leafMat);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 5).translate(0, 0.5, 0), trunkMat, plan.trees.length);
    const canopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, plan.trees.length);
    const leafCols = ['#1d3a2b', '#22402f', '#193325', '#2a4a35', '#24443a'].map((c) => new THREE.Color(c));
    plan.trees.forEach((t, i) => {
      const h = 1.6 * t.s;
      m.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, h, t.s));
      trunks.setMatrixAt(i, m);
      const r = 1.25 * t.s;
      m.compose(new THREE.Vector3(t.x, t.y + h + r * 0.75, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6), 0)), new THREE.Vector3(r, r * 1.12, r));
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, leafCols[i % leafCols.length]);
    });
    this.group.add(trunks, canopies);
  }

  private surfaceOpacity = 1;

  setSurfaceOpacity(v: number) {
    this.surfaceOpacity = v;
    const faded = v < 0.98;
    for (const m of this.fadeSurface) {
      m.opacity = v;
      m.depthWrite = !faded;
    }
    // lane markings ride on the street slabs: they vanish while the street is open
    this.markMat.opacity = v * Math.max(0, 1 - this.reveal * 3);
    this.markMat.depthWrite = !faded && this.reveal < 0.01;
    this.poolMat.opacity = this.day ? 0 : (0.12 + 0.88 * v) * (1 - this.reveal * 0.8);
  }

  /** 0..1 how far the street slabs have broken open (RoadTiles.reveal). */
  setReveal(r: number) {
    if (Math.abs(r - this.reveal) < 0.001) return;
    this.reveal = r;
    this.setSurfaceOpacity(this.surfaceOpacity);
  }

  setDay(day: boolean) {
    this.day = day;
    for (const t of this.themed) t.mat.color.copy(day ? t.day : t.night);
    this.headMat.color.setRGB(day ? 0.75 : 1.6, day ? 0.72 : 1.3, day ? 0.68 : 0.92);
    this.poolMat.visible = !day;
    this.setSurfaceOpacity(this.surfaceOpacity);
  }

  setFurnitureOpacity(v: number) {
    const faded = v < 0.98;
    for (const m of this.fadeFurniture) {
      m.opacity = v;
      m.depthWrite = !faded;
    }
  }

  update(t: number) {
    // gentle shimmer on bridge light strips
    const s = (1 + Math.sin(t * 1.3) * 0.06) * (this.day ? 0.6 : 1);
    this.railMat.color.setRGB(0.3 * s, 0.6 * s, 0.82 * s);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

function groundRect(r: Rect, y: number) {
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
  g.rotateX(-Math.PI / 2);
  g.translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  return g;
}

function boxGeo(x: number, y: number, z: number, w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function makeAsphaltMaterial(fadeable: boolean) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x171d25, roughness: 0.82, metalness: 0.05, transparent: fadeable, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPkW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPkW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPkW;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float an = pk_fbm(vPkW.xz * 0.08);
         float ag = pk_noise(vPkW.xz * 2.5);
         diffuseColor.rgb *= 0.78 + 0.32 * an + 0.12 * ag;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(0.55, 0.9, pk_noise(vPkW.xz * 0.15));`,
      );
  };
  mat.customProgramCacheKey = () => 'pk-asphalt-v1';
  return mat;
}

function patchPaving(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPkW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 pkP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\npkP = instanceMatrix * pkP;\n#endif\nvPkW = (modelMatrix * pkP).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPkW;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 tile = abs(fract(vPkW.xz / 1.2) - 0.5);
         float joint = smoothstep(0.47, 0.5, max(tile.x, tile.y));
         diffuseColor.rgb *= (0.85 + 0.25 * pk_noise(vPkW.xz * 0.6)) * (1.0 - joint * 0.25);`,
      );
  };
  mat.customProgramCacheKey = () => 'pk-paving-v1';
}
