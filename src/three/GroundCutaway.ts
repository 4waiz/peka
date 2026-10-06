import * as THREE from 'three';
import { NOISE_GLSL } from './utils/glsl';
import {
  BENCH_Y,
  DEEP_Y,
  FACE_Z,
  FADE_TOP,
  FLOOR_Y,
  LEAK,
  LOWER_FACE_Z,
  MAIN,
  UTILITIES,
  UTILITY_ORDER,
  type UtilityId,
} from '../simulation/infrastructureData';

const FACE_X0 = -760;
const FACE_X1 = 760;

/**
 * Sliced-open ground: a two-step benched excavation along the city's front edge
 * with a niche cut for every utility, plus the inner walls of the "x-ray box"
 * under the detailed district. All surfaces share one world-space strata shader
 * (asphalt → gravel → sand → clay → marl → rock) with procedural variation,
 * moisture spread around the leak and soft glow cast by nearby utilities.
 */
export class GroundCutaway {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms = {
    uTime: { value: 0 },
    uLeakPos: { value: new THREE.Vector3(...LEAK.crack) },
    uWet: { value: 0 },
    uFadeColor: { value: new THREE.Color('#050b13') },
    uGlowCol: { value: UTILITY_ORDER.map(() => new THREE.Color(0, 0, 0)) },
    uGlowY: { value: UTILITY_ORDER.map((u) => UTILITIES[u].depth) },
    uGlowZ: {
      value: UTILITY_ORDER.map((u) => {
        const c = UTILITIES[u].conduits;
        return c.reduce((a, b) => a + b.z, 0) / c.length;
      }),
    },
    uGlowK: {
      value: UTILITY_ORDER.map((u) => {
        const r = UTILITIES[u].conduits[0].r;
        return 1.0 / Math.pow(r * 2.4 + 0.8, 2);
      }),
    },
  };
  private glowBase = UTILITY_ORDER.map((u) => new THREE.Color(UTILITIES[u].color));
  private edgeMat: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
    this.patchMaterial(this.material);

    const add = (geo: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(geo, this.material);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };

    // ---- excavation faces ------------------------------------------------
    const upperNiches = (['electricity', 'telecom', 'water'] as UtilityId[]).map((u) => UTILITIES[u].niche);
    const lowerNiches = (['cooling', 'sewage'] as UtilityId[]).map((u) => UTILITIES[u].niche);
    this.buildFace(FACE_Z, 0, BENCH_Y, upperNiches).forEach(add);
    this.buildFace(LOWER_FACE_Z, BENCH_Y, DEEP_Y, lowerNiches).forEach(add);
    for (const n of [...upperNiches, ...lowerNiches]) this.buildNiche(n).forEach(add);

    // bench (safety step); below the lower utilities the section fades into darkness
    add(hPlane(FACE_X0, FACE_X1, FACE_Z, LOWER_FACE_Z, BENCH_Y, true));

    // ---- x-ray box under the detailed district --------------------------
    const innerZ1 = 67.0;
    add(hPlane(MAIN.x0, MAIN.x1, MAIN.z0, innerZ1, FLOOR_Y, true, 8));
    add(vPlaneX(MAIN.x0, MAIN.z0, innerZ1, FLOOR_Y, 0, +1));
    add(vPlaneX(MAIN.x1, MAIN.z0, innerZ1, FLOOR_Y, 0, -1));
    add(vPlaneZ(MAIN.z0, MAIN.x0, MAIN.x1, FLOOR_Y, 0));

    // ---- subtle "section line" accents along the cut edges ---------------
    this.edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd6f2'), transparent: true, opacity: 0.22 });
    const edgeGeo = new THREE.BoxGeometry(FACE_X1 - FACE_X0, 0.08, 0.08);
    const e1 = new THREE.Mesh(edgeGeo, this.edgeMat);
    e1.position.set(0, 0.3, FACE_Z + 0.04);
    const e2 = new THREE.Mesh(edgeGeo, this.edgeMat);
    e2.position.set(0, BENCH_Y + 0.03, LOWER_FACE_Z + 0.04);
    this.group.add(e1, e2);
  }

  private buildFace(z: number, top: number, bottom: number, niches: { y0: number; y1: number }[]) {
    const sorted = [...niches].sort((a, b) => b.y1 - a.y1);
    const geos: THREE.BufferGeometry[] = [];
    let cur = top;
    for (const n of sorted) {
      if (cur - n.y1 > 0.01) geos.push(vPlaneFront(z, n.y1, cur));
      cur = n.y0;
    }
    if (cur - bottom > 0.01) geos.push(vPlaneFront(z, bottom, cur));
    return geos;
  }

  private buildNiche(n: { y0: number; y1: number; backZ: number; faceZ: number }) {
    return [
      hPlane(FACE_X0, FACE_X1, n.backZ, n.faceZ, n.y0, true),
      hPlane(FACE_X0, FACE_X1, n.backZ, n.faceZ, n.y1, false),
      vPlaneFront(n.backZ, n.y0, n.y1),
    ];
  }

  private patchMaterial(mat: THREE.MeshStandardMaterial) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vPkWorld;
           varying vec3 vPkNormal;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec4 pkW = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             pkW = instanceMatrix * pkW;
           #endif
           pkW = modelMatrix * pkW;
           vPkWorld = pkW.xyz;
           vPkNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vPkWorld;
           varying vec3 vPkNormal;
           uniform float uTime;
           uniform vec3 uLeakPos;
           uniform float uWet;
           uniform vec3 uFadeColor;
           uniform vec3 uGlowCol[5];
           uniform float uGlowY[5];
           uniform float uGlowZ[5];
           uniform float uGlowK[5];
           ${NOISE_GLSL}
           vec3 pkStrata(vec3 wp, vec3 n, out float rough, out vec3 emis) {
             bool horizontal = abs(n.y) > 0.5;
             float hc = horizontal ? (wp.x * 0.8 + wp.z * 0.6) : (wp.x + wp.z);
             float y = wp.y;
             float b1 = -0.6;
             float b2 = -3.0 + 1.0 * (pk_noise(vec2(hc * 0.06, 1.3)) - 0.5);
             float b3 = -7.6 + 2.8 * (pk_noise(vec2(hc * 0.035, 4.1)) - 0.5);
             float b4 = -14.4 + 3.4 * (pk_noise(vec2(hc * 0.028, 8.7)) - 0.5);
             float b5 = -20.2 + 2.6 * (pk_noise(vec2(hc * 0.022, 2.2)) - 0.5);
             vec3 asphalt = vec3(0.06, 0.065, 0.075);
             vec3 base    = vec3(0.27, 0.255, 0.235);
             vec3 sand    = vec3(0.43, 0.30, 0.19);
             vec3 clay    = vec3(0.31, 0.195, 0.13);
             vec3 marl    = vec3(0.24, 0.21, 0.195);
             vec3 rock    = vec3(0.135, 0.15, 0.175);
             vec2 dc = horizontal ? wp.xz : vec2(hc, y);
             float grain = pk_noise(dc * 3.1) * 0.5 + pk_noise(dc * 9.7) * 0.5;
             float blotch = pk_fbm(dc * 0.2);
             float sft = 0.22;
             vec3 col = asphalt;
             col = mix(col, base, smoothstep(b1 + 0.04, b1 - 0.04, y));
             col = mix(col, sand, smoothstep(b2 + sft, b2 - sft, y));
             col = mix(col, clay, smoothstep(b3 + sft, b3 - sft, y));
             col = mix(col, marl, smoothstep(b4 + sft, b4 - sft, y));
             col = mix(col, rock, smoothstep(b5 + sft, b5 - sft, y));
             float peb = smoothstep(0.78, 0.86, pk_noise(dc * 4.3 + 7.0));
             col *= 0.76 + 0.36 * grain;
             col *= 0.82 + 0.34 * blotch;
             col = mix(col, col * 1.5 + 0.03, peb * 0.3 * step(y, b1));
             float streak = pk_noise(vec2(hc * 0.045, y * 7.0));
             col *= 0.9 + 0.16 * streak;
             float rk = smoothstep(b5, b5 - 0.8, y);
             float crk = smoothstep(0.035, 0.0, abs(pk_noise(dc * 0.55) - 0.5)) * rk;
             col = mix(col, col * 0.4, crk * 0.85);
             rough = 0.93 - grain * 0.08;
             emis = col * 0.035;

             // soft light cast by the utilities onto surrounding soil
             for (int i = 0; i < 5; i++) {
               vec2 d = vec2(y - uGlowY[i], wp.z - uGlowZ[i]);
               float g = exp(-dot(d, d) * uGlowK[i]);
               emis += uGlowCol[i] * g * (0.55 + 0.45 * col.r * 2.0);
             }

             // moisture spreading from the leak + seepage trail running down
             if (uWet > 0.001) {
               float dist = length(wp - uLeakPos);
               float nn = pk_fbm(dc * 0.5 + 3.0);
               float wetR = 1.5 + uWet * 9.0;
               float wet = smoothstep(wetR, wetR * 0.3, dist + (nn - 0.5) * 3.5);
               float drop = uLeakPos.y - y;
               float trailW = (0.6 + max(drop, 0.0) * 0.16) * (0.4 + uWet);
               float reach = uWet * 26.0;
               float trail = smoothstep(-0.6, 0.6, drop) * smoothstep(reach, reach - 3.0, drop)
                           * smoothstep(trailW, trailW * 0.25, abs(wp.x - uLeakPos.x) + (pk_noise(vec2(y * 0.9, wp.x * 0.3)) - 0.5) * 1.6);
               wet = max(wet, trail * 0.95) * smoothstep(0.0, 0.08, uWet);
               col = mix(col, col * vec3(0.38, 0.44, 0.52), wet);
               rough = mix(rough, 0.22, wet);
               emis += vec3(0.01, 0.035, 0.07) * wet;
             }

             // deep section fades into darkness, with faint survey depth lines
             float deep = smoothstep(${FADE_TOP.toFixed(1)}, ${(FADE_TOP - 9).toFixed(1)}, y);
             float dl = abs(fract(y / 6.0 + 0.5) - 0.5) * 6.0;
             float depthLine = (1.0 - smoothstep(0.0, 0.07, dl)) * step(y, ${FADE_TOP.toFixed(1)}) * step(${(DEEP_Y + 6).toFixed(1)}, y) * (horizontal ? 0.0 : 1.0);
             col *= 1.0 - deep;
             emis = mix(emis, uFadeColor, deep);
             emis += vec3(0.05, 0.22, 0.32) * depthLine * 0.12 * (1.0 - deep * 0.6);
             return col;
           }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float pkRough; vec3 pkEmis;
           diffuseColor.rgb = pkStrata(vPkWorld, normalize(vPkNormal), pkRough, pkEmis);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           roughnessFactor = pkRough;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += pkEmis;`,
        );
    };
    mat.customProgramCacheKey = () => 'pk-strata-v1';
  }

  private glowScale = 1;

  /** Per-utility glow intensity on the soil (reacts to emphasis / layer toggles). */
  setGlow(intensities: Record<UtilityId, number>) {
    UTILITY_ORDER.forEach((u, i) => {
      this.uniforms.uGlowCol.value[i].copy(this.glowBase[i]).multiplyScalar(intensities[u] * 0.04 * this.glowScale);
    });
  }

  setDay(day: boolean) {
    this.glowScale = day ? 0.3 : 1;
    this.uniforms.uFadeColor.value.set(day ? '#d3dde6' : '#050b13');
    this.edgeMat.opacity = day ? 0.35 : 0.22;
    this.edgeMat.color.set(day ? '#4f7a96' : '#9fd6f2');
  }

  setWetness(v: number) {
    this.uniforms.uWet.value = v;
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.material.dispose();
    this.edgeMat.dispose();
  }
}

// ---- geometry helpers (world-space quads) ---------------------------------

function vPlaneFront(z: number, y0: number, y1: number, x0 = FACE_X0, x1 = FACE_X1) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, Math.ceil((x1 - x0) / 80), 1);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}

function hPlane(x0: number, x1: number, z0: number, z1: number, y: number, up: boolean, seg = 1) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, seg, seg);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

function vPlaneX(x: number, z0: number, z1: number, y0: number, y1: number, facing: 1 | -1) {
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function vPlaneZ(z: number, x0: number, x1: number, y0: number, y1: number) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}
