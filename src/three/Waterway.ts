import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './utils/glsl';
import { CANAL, MAIN, OUTER, subtractMany, type Rect } from '../simulation/infrastructureData';

interface Wall {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  facing: 1 | -1;
}

/**
 * Riverside canal (B-12 "Riverside District" borders it): animated glossy water
 * with fresnel sky reflection and city-light glints, concrete embankments and
 * bed. Only the part inside the detailed district fades for the x-ray reveal.
 */
export class Waterway {
  readonly group = new THREE.Group();
  private waterMain: THREE.ShaderMaterial;
  private waterOuter: THREE.ShaderMaterial;
  private wallMain: THREE.MeshStandardMaterial;
  private wallOuter: THREE.MeshStandardMaterial;
  private bedMain: THREE.MeshStandardMaterial;
  private bedOuter: THREE.MeshStandardMaterial;

  constructor() {
    const { waterY, bedY } = CANAL;
    const inside: Rect[] = [];
    for (const r of CANAL.rects) {
      const c = { x0: Math.max(r.x0, MAIN.x0), x1: Math.min(r.x1, MAIN.x1), z0: Math.max(r.z0, MAIN.z0), z1: Math.min(r.z1, MAIN.z1) };
      if (c.x1 > c.x0 && c.z1 > c.z0) inside.push(c);
    }
    const outside = subtractMany(CANAL.rects, [MAIN]);

    this.waterMain = makeWater(true);
    this.waterOuter = makeWater(false);
    const wm = new THREE.Mesh(mergeGeometries(inside.map((r) => hRect(r, waterY))), this.waterMain);
    wm.renderOrder = 2;
    const wo = new THREE.Mesh(mergeGeometries(outside.map((r) => hRect(r, waterY, 6))), this.waterOuter);
    this.group.add(wm, wo);

    this.bedMain = new THREE.MeshStandardMaterial({ color: 0x0a1820, roughness: 1, transparent: true });
    this.bedOuter = new THREE.MeshStandardMaterial({ color: 0x0a1820, roughness: 1 });
    this.group.add(new THREE.Mesh(mergeGeometries(inside.map((r) => hRect(r, bedY))), this.bedMain));
    this.group.add(new THREE.Mesh(mergeGeometries(outside.map((r) => hRect(r, bedY))), this.bedOuter));

    const c1 = CANAL.rects[0];
    const c2 = CANAL.rects[1];
    const walls: Wall[] = [
      { axis: 'x', at: c1.x0, from: c1.z0, to: c2.z0, facing: 1 },
      { axis: 'x', at: c1.x1, from: c1.z0, to: c1.z1, facing: -1 },
      { axis: 'z', at: c1.z1, from: OUTER.x0, to: c1.x1, facing: -1 },
      { axis: 'z', at: c2.z0, from: OUTER.x0, to: c1.x0, facing: 1 },
    ];
    this.wallMain = new THREE.MeshStandardMaterial({ color: 0x46505b, roughness: 0.85, transparent: true });
    this.wallOuter = new THREE.MeshStandardMaterial({ color: 0x3c454f, roughness: 0.9 });
    const wallOuter = this.wallOuter;
    const inGeo: THREE.BufferGeometry[] = [];
    const outGeo: THREE.BufferGeometry[] = [];
    for (const w of walls) {
      const lo = w.axis === 'x' ? MAIN.z0 : MAIN.x0;
      const hi = w.axis === 'x' ? MAIN.z1 : MAIN.x1;
      const withinMain = w.axis === 'x' ? w.at >= MAIN.x0 && w.at <= MAIN.x1 : w.at >= MAIN.z0 && w.at <= MAIN.z1;
      const segs: [number, number, boolean][] = [];
      if (!withinMain) segs.push([w.from, w.to, false]);
      else {
        if (w.from < lo) segs.push([w.from, Math.min(lo, w.to), false]);
        if (w.to > lo && w.from < hi) segs.push([Math.max(w.from, lo), Math.min(w.to, hi), true]);
        if (w.to > hi) segs.push([Math.max(hi, w.from), w.to, false]);
      }
      for (const [a, b, ins] of segs) {
        if (b - a < 0.01) continue;
        const g = new THREE.PlaneGeometry(b - a, -bedY);
        if (w.axis === 'x') {
          g.rotateY(w.facing > 0 ? Math.PI / 2 : -Math.PI / 2);
          g.translate(w.at, bedY / 2, (a + b) / 2);
        } else {
          if (w.facing < 0) g.rotateY(Math.PI);
          g.translate((a + b) / 2, bedY / 2, w.at);
        }
        (ins ? inGeo : outGeo).push(g);
      }
    }
    if (inGeo.length) this.group.add(new THREE.Mesh(mergeGeometries(inGeo), this.wallMain));
    if (outGeo.length) this.group.add(new THREE.Mesh(mergeGeometries(outGeo), wallOuter));
  }

  setDay(day: boolean) {
    for (const m of [this.waterMain, this.waterOuter]) {
      (m.uniforms.uDeep.value as THREE.Color).set(day ? '#2a5874' : '#03101b');
      (m.uniforms.uSky.value as THREE.Color).set(day ? '#b4cddd' : '#1d4566');
      m.uniforms.uNight.value = day ? 0 : 1;
    }
    this.wallMain.color.set(day ? '#8f969d' : '#46505b');
    this.wallOuter.color.set(day ? '#878e95' : '#3c454f');
    this.bedMain.color.set(day ? '#22404f' : '#0a1820');
    this.bedOuter.color.set(day ? '#22404f' : '#0a1820');
  }

  setOpacity(v: number) {
    this.waterMain.uniforms.uOpacity.value = 0.25 + 0.7 * v;
    this.waterMain.depthWrite = v > 0.98;
    for (const m of [this.wallMain, this.bedMain]) {
      m.opacity = v;
      m.depthWrite = v > 0.98;
    }
  }

  update(t: number) {
    this.waterMain.uniforms.uTime.value = t;
    this.waterOuter.uniforms.uTime.value = t;
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

function hRect(r: Rect, y: number, seg = 1) {
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  return g;
}

function makeWater(transparent: boolean) {
  return new THREE.ShaderMaterial({
    transparent,
    fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      uTime: { value: 0 },
      uOpacity: { value: 0.95 },
      uDeep: { value: new THREE.Color('#03101b') },
      uSky: { value: new THREE.Color('#1d4566') },
      uNight: { value: 1 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uOpacity; uniform vec3 uDeep; uniform vec3 uSky; uniform float uNight;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vW.xz;
        float n1 = pk_noise(p * 0.32 + vec2(uTime * 0.11, uTime * 0.04));
        float n2 = pk_noise(p * 1.05 - vec2(uTime * 0.19, -uTime * 0.08));
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.22, 1.0, (n2 - 0.5) * 0.4));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(nrm, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uSky, clamp(fres * 1.1, 0.0, 1.0));
        vec3 L = normalize(vec3(-0.45, 0.7, 0.4));
        vec3 H = normalize(L + V);
        col += vec3(0.75, 0.88, 1.0) * pow(max(dot(nrm, H), 0.0), 260.0) * mix(1.6, 1.0, uNight);
        float sp = pk_noise(vec2(p.x * 0.7, p.y * 0.09) + n1 * 2.2);
        float glint = smoothstep(0.8, 0.96, sp) * (0.4 + 0.6 * n2);
        col += mix(vec3(1.0, 0.68, 0.38), vec3(0.45, 0.78, 1.0), step(0.55, n1)) * glint * 0.3 * uNight;
        gl_FragColor = vec4(col, uOpacity);
        #include <fog_fragment>
      }
    `,
  });
}
