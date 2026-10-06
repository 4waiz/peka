import * as THREE from 'three';
import { NOISE_GLSL } from './utils/glsl';
import type { BuildingSpec, CityPlan } from './CityGenerator';

/**
 * Instanced city buildings. A single unit box is instanced for every massing
 * volume; windows, glass, storefronts, crown lights, sector outlines and x-ray
 * edges are all procedural in the fragment shader (no textures).
 */
export class Buildings {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly distantMesh: THREE.InstancedMesh;
  readonly specs: BuildingSpec[];
  readonly uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uHoverSector: { value: -5 },
    uSelectedSector: { value: -5 },
    uAlertSector: { value: -5 },
    uAlertLevel: { value: 0 },
    uImpactLevel: { value: 0 },
    uXray: { value: 0 },
    uWindowBoost: { value: 1 },
    uDay: { value: 0 },
    uLitScale: { value: 0.62 },
    uHoverColor: { value: new THREE.Color('#46d6ff') },
    uAlertColor: { value: new THREE.Color('#ff5a3c') },
    uImpactColor: { value: new THREE.Color('#ffb347') },
  };
  private distantUniforms = {
    ...this.uniforms,
    uOpacity: { value: 1 },
    uHoverSector: { value: -5 },
    uSelectedSector: { value: -5 },
    uAlertSector: { value: -5 },
    uAlertLevel: { value: 0 },
    uImpactLevel: { value: 0 },
    uXray: { value: 0 },
    uLitScale: { value: 0.48 },
  };
  private material: THREE.MeshStandardMaterial;
  private distantMaterial: THREE.MeshStandardMaterial;
  private spireMesh: THREE.InstancedMesh;
  private beaconMesh: THREE.InstancedMesh;
  private beaconMat: THREE.MeshBasicMaterial;
  private mast: THREE.Group;
  private mastLights: THREE.MeshBasicMaterial;

  constructor(plan: CityPlan) {
    this.specs = plan.buildings;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);

    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.15, transparent: true, envMapIntensity: 1.2 });
    patchBuildingMaterial(this.material, this.uniforms);
    this.mesh = this.buildInstanced(box, this.material, plan.buildings);
    this.mesh.renderOrder = 4;
    this.group.add(this.mesh);

    this.distantMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.1, envMapIntensity: 0.8 });
    patchBuildingMaterial(this.distantMaterial, this.distantUniforms);
    this.distantMesh = this.buildInstanced(box.clone(), this.distantMaterial, plan.distant);
    this.group.add(this.distantMesh);

    // ---- antenna spires + aviation beacons ------------------------------
    const spires = plan.spires.filter((s) => s.h > 0);
    this.spireMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.22, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a96a3, metalness: 0.7, roughness: 0.35 }),
      Math.max(1, spires.length),
    );
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.35, 0.25) });
    this.beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), this.beaconMat, Math.max(1, spires.length));
    const m = new THREE.Matrix4();
    spires.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(1, s.h, 1));
      this.spireMesh.setMatrixAt(i, m);
      m.makeTranslation(s.x, s.y + s.h, s.z);
      this.beaconMesh.setMatrixAt(i, m);
    });
    this.spireMesh.count = spires.length;
    this.beaconMesh.count = spires.length;
    this.group.add(this.spireMesh, this.beaconMesh);

    // ---- landmark telecom mast -----------------------------------------
    this.mastLights = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.3, 0.2) });
    this.mast = new THREE.Group();
    const mastSpec = plan.spires.find((s) => s.h < 0);
    if (mastSpec) this.buildMast(mastSpec.x, mastSpec.z);
    this.group.add(this.mast);
  }

  private buildInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, specs: BuildingSpec[]) {
    const n = specs.length;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const seed = new Float32Array(n);
    const style = new Float32Array(n);
    const kind = new Float32Array(n);
    const sector = new Float32Array(n);
    const lit = new Float32Array(n);
    const rim = new Float32Array(n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    specs.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.w, s.h, s.d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, s.color.clone().multiplyScalar(0.8));
      seed[i] = s.seed;
      style[i] = s.style;
      kind[i] = s.kind;
      sector[i] = s.sector;
      lit[i] = s.lit;
      rim[i] = s.rim;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.setAttribute('aSector', new THREE.InstancedBufferAttribute(sector, 1));
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
    geo.setAttribute('aRim', new THREE.InstancedBufferAttribute(rim, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  private buildMast(x: number, z: number) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.8, roughness: 0.35 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8c2a24, metalness: 0.4, roughness: 0.5, emissive: 0x3a0806 });
    const sections = [
      { y: 0, h: 34, r0: 4.2, r1: 2.6, mat: steel },
      { y: 34, h: 26, r0: 2.6, r1: 1.5, mat: red },
      { y: 60, h: 22, r0: 1.5, r1: 0.7, mat: steel },
      { y: 82, h: 18, r0: 0.5, r1: 0.12, mat: red },
    ];
    for (const s of sections) {
      const g = new THREE.CylinderGeometry(s.r1, s.r0, s.h, 4, 1, true);
      g.rotateY(Math.PI / 4);
      const mesh = new THREE.Mesh(g, s.mat);
      mesh.position.set(x, s.y + s.h / 2, z);
      this.mast.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x6fd9ff, transparent: true, opacity: 0.35 }));
      edges.position.copy(mesh.position);
      this.mast.add(edges);
    }
    for (const py of [34, 60]) {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 1.2, 16), steel);
      deck.position.set(x, py, z);
      this.mast.add(deck);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3.2) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, py + 0.7, z);
      this.mast.add(ring);
    }
    for (const py of [33.5, 59.5, 81.5, 100]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), this.mastLights);
      light.position.set(x, py, z);
      this.mast.add(light);
    }
  }

  /** Index of the instance's sector (for hover resolution). */
  sectorOfInstance(i: number) {
    return this.specs[i]?.sector ?? -1;
  }

  setDay(day: boolean) {
    this.uniforms.uDay.value = day ? 1 : 0;
    this.uniforms.uWindowBoost.value = day ? 0.04 : 1;
  }

  setOpacity(v: number) {
    this.uniforms.uOpacity.value = v;
    const faded = v < 0.98;
    this.material.depthWrite = !faded;
    this.spireMesh.visible = v > 0.5;
    this.beaconMesh.visible = v > 0.3;
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
    const blink = Math.sin(t * 2.4) > 0.55 ? 1 : 0.12;
    this.beaconMat.color.setRGB(4 * blink, 0.35 * blink, 0.25 * blink);
    const mb = Math.sin(t * 2.4 + 1.2) > 0.4 ? 1 : 0.1;
    this.mastLights.color.setRGB(3.5 * mb, 0.3 * mb, 0.2 * mb);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const mm = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose());
      }
    });
  }
}

type BuildingUniforms = Buildings['uniforms'];

function patchBuildingMaterial(mat: THREE.MeshStandardMaterial, uniforms: BuildingUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aSeed; attribute float aStyle; attribute float aKind;
         attribute float aSector; attribute float aLit; attribute float aRim;
         varying vec3 vBW; varying vec3 vBN; varying vec3 vBC; varying vec3 vBS;
         varying float vSeed; varying float vStyle; varying float vKind;
         varying float vSector; varying float vLit; varying float vRim;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         mat4 pkIm = mat4(1.0);
         #ifdef USE_INSTANCING
           pkIm = instanceMatrix;
         #endif
         vec4 pkWp = modelMatrix * pkIm * vec4(transformed, 1.0);
         vBW = pkWp.xyz;
         vBN = normalize(mat3(modelMatrix) * mat3(pkIm) * objectNormal);
         vBC = (modelMatrix * pkIm * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         vBS = vec3(length(pkIm[0].xyz), length(pkIm[1].xyz), length(pkIm[2].xyz));
         vSeed = aSeed; vStyle = aStyle; vKind = aKind; vSector = aSector; vLit = aLit; vRim = aRim;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform float uOpacity; uniform float uHoverSector; uniform float uSelectedSector;
         uniform float uAlertSector; uniform float uAlertLevel; uniform float uImpactLevel; uniform float uXray;
         uniform float uWindowBoost; uniform float uLitScale; uniform float uDay;
         uniform vec3 uHoverColor; uniform vec3 uAlertColor; uniform vec3 uImpactColor;
         varying vec3 vBW; varying vec3 vBN; varying vec3 vBC; varying vec3 vBS;
         varying float vSeed; varying float vStyle; varying float vKind;
         varying float vSector; varying float vLit; varying float vRim;
         ${NOISE_GLSL}
         float pkAA(float e0, float e1, float x) {
           float w = fwidth(x) * 0.8;
           return smoothstep(e0 - w, e0 + w, x) * (1.0 - smoothstep(e1 - w, e1 + w, x));
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec3 pkN = normalize(vBN);
         float pkWall = 1.0 - step(0.5, abs(pkN.y));
         float pkU; float pkFW; float pkFace;
         if (abs(pkN.x) > 0.5) { pkU = vBW.z - (vBC.z - vBS.z * 0.5); pkFW = vBS.z; pkFace = pkN.x > 0.0 ? 0.0 : 1.0; }
         else { pkU = vBW.x - (vBC.x - vBS.x * 0.5); pkFW = vBS.x; pkFace = pkN.z > 0.0 ? 2.0 : 3.0; }
         float pkV = vBW.y - vBC.y;
         float pkFH = vBS.y;
         vec3 pkBase = diffuseColor.rgb;
         float pkGrad = mix(0.72, 1.06, clamp(pkV / max(pkFH, 1.0), 0.0, 1.0));
         float pkFn = pk_noise(vec2(pkU * 0.3 + vSeed * 40.0, pkV * 0.3));
         pkBase *= pkGrad * (0.9 + 0.2 * pkFn);
         // daylight: lighter architectural palette (warm concrete / pale stone)
         pkBase = mix(pkBase, pkBase * 1.35 + vec3(0.2, 0.2, 0.21), uDay);
         vec3 pkEmis = vec3(0.0);
         float pkRough = 0.76;
         float pkMetal = 0.12;
         vec3 pkCol = pkBase;

         if (pkWall > 0.5 && vKind != 1.0) {
           float colW = vStyle < 0.5 ? 2.3 : (vStyle < 1.5 ? 3.1 : 1.7);
           float floorH = vStyle < 1.5 ? 3.3 : 3.6;
           float nCols = max(1.0, floor((pkFW - 0.8) / colW));
           float uu = pkU - (pkFW - nCols * colW) * 0.5;
           float vv = pkV - 0.7;
           float inside = step(0.0, uu) * step(uu, nCols * colW) * step(0.0, vv) * step(pkV, pkFH - 0.9);
           vec2 cell = vec2(uu / colW, vv / floorH);
           vec2 cid = floor(cell);
           vec2 f = fract(cell);
           float wx; float wy;
           if (vStyle < 0.5) { wx = pkAA(0.05, 0.95, f.x); wy = pkAA(0.14, 0.92, f.y); }
           else if (vStyle < 1.5) { wx = pkAA(0.22, 0.78, f.x); wy = pkAA(0.26, 0.8, f.y); }
           else { wx = pkAA(0.2, 0.8, f.x); wy = pkAA(0.06, 0.96, f.y); }
           float detail = 1.0 - smoothstep(0.22, 0.55, max(fwidth(cell.x), fwidth(cell.y)));
           float avgWin = vStyle < 0.5 ? 0.7 : (vStyle < 1.5 ? 0.3 : 0.55);
           float win = mix(avgWin, wx * wy, detail) * inside;

           float rnd = pk_hash12(cid + vec2(pkFace * 37.0 + vSeed * 113.0, vSeed * 71.0));
           float rowRnd = pk_hash12(vec2(cid.y * 1.31, vSeed * 53.0 + pkFace));
           float litRatio = clamp(vLit * uLitScale * (0.45 + 1.1 * rowRnd), 0.0, 0.95);
           float tShift = floor(uTime / 7.0 + vSeed * 20.0 + rnd * 6.0);
           float toggle = step(0.988, pk_hash12(cid + tShift * 1.7));
           float lit = abs(step(1.0 - litRatio, rnd) - toggle);
           lit = mix(litRatio, lit, detail);
           float tone = pk_hash12(cid * 1.7 + vSeed * 9.0);
           vec3 warm = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.8, 0.52), tone);
           vec3 cool = vec3(0.7, 0.85, 1.0);
           vec3 wc = mix(warm, cool, step(0.8, tone));
           if (vKind > 1.5) wc = mix(vec3(0.72, 0.94, 1.0), vec3(1.0, 0.97, 0.9), tone);
           float inten = (0.6 + 0.9 * pk_hash12(cid + 4.2)) * uWindowBoost;
           vec3 glass = vStyle < 0.5 ? vec3(0.045, 0.085, 0.13) : vec3(0.035, 0.05, 0.075);
           glass = mix(glass, vec3(0.16, 0.22, 0.28), uDay);
           pkCol = mix(pkBase, glass, win);
           pkEmis += wc * lit * inten * win * 0.6;
           pkRough = mix(0.78, 0.1, win);
           pkMetal = mix(0.12, 0.9, win * (1.0 - lit));

           // ground-floor storefront glow
           if (vBC.y < 0.5 && pkV < 3.2 && pkV > 0.35 && vSeed > 0.3) {
             float shop = pkAA(0.08, 0.92, fract(pkU / 4.2));
             pkEmis += vec3(1.0, 0.72, 0.42) * shop * 0.3 * uWindowBoost;
             pkCol = mix(pkCol, mix(vec3(0.05), vec3(0.18, 0.22, 0.26), uDay), shop * 0.6);
           }
           // crown light line
           if (vRim > 0.5 && pkV > pkFH - 0.32) pkEmis += vec3(0.45, 0.82, 1.0) * 0.32 * uWindowBoost;
         } else if (pkWall > 0.5) {
           // mechanical louvres
           float l = pkAA(0.0, 0.5, fract(pkV * 2.2));
           pkCol = pkBase * (0.55 + 0.25 * l);
         } else if (pkN.y > 0.5) {
           pkCol = pkBase * 0.42;
           pkRough = 0.9;
         }

         // edges (for outlines / x-ray)
         float pkEd;
         if (pkWall > 0.5) {
           pkEd = min(min(pkU, pkFW - pkU), min(pkV, pkFH - pkV));
         } else {
           float ex = min(vBW.x - (vBC.x - vBS.x * 0.5), (vBC.x + vBS.x * 0.5) - vBW.x);
           float ez = min(vBW.z - (vBC.z - vBS.z * 0.5), (vBC.z + vBS.z * 0.5) - vBW.z);
           pkEd = min(ex, ez);
         }
         float pkEW = fwidth(pkEd) * 1.6 + 0.05;
         float pkEdge = 1.0 - smoothstep(0.0, pkEW, pkEd);

         float hov = step(abs(vSector - uHoverSector), 0.5);
         float sel = step(abs(vSector - uSelectedSector), 0.5);
         float alrt = step(abs(vSector - uAlertSector), 0.5) * uAlertLevel;
         float imp = step(abs(vSector - 1.0), 0.5) * uImpactLevel;
         float pulse = 0.65 + 0.35 * sin(uTime * 3.2);
         float hs = max(hov, sel);
         pkEmis += uHoverColor * hs * (pkEdge * (0.75 + 0.35 * sel) + 0.018);
         pkEmis += uAlertColor * alrt * (pkEdge * 0.7 + 0.02) * pulse;
         pkEmis += uImpactColor * imp * (pkEdge * 0.6 + 0.025);
         pkEmis += vec3(0.3, 0.7, 0.95) * uXray * pkEdge * 0.42;

         diffuseColor.rgb = pkCol;
         diffuseColor.a = clamp(uOpacity + pkEdge * uXray * 0.7, 0.0, 1.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = pkRough;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
         metalnessFactor = pkMetal;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += pkEmis;`,
      );
  };
  mat.customProgramCacheKey = () => 'pk-building-v1';
}
