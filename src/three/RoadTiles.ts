import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './utils/glsl';
import { Rng } from './utils/random';
import { BLOCKS, CANAL, FACE_Z, MAIN, subtractMany } from '../simulation/infrastructureData';

interface Tile {
  x: number;
  z: number;
  w: number;
  d: number;
  lift: number;
  tiltX: number;
  tiltZ: number;
  driftX: number;
  driftZ: number;
  delay: number;
  p: number;
  v: number;
}

const TILE = 4.4;
const THICK = 0.7;
const FOUNDATION = 2.8;

/**
 * The street surface of the detailed district as instanced slabs. When the
 * underground is revealed the slabs crack apart in a ripple from the focus
 * point, lift, tilt and shrink to expose the utility trenches beneath the
 * streets — then drop back and lock together with a small bounce.
 * Each slab is driven by its own under-damped spring.
 */
export class RoadTiles {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private mesh: THREE.InstancedMesh;
  private tiles: Tile[] = [];
  private open = false;
  private changedAt = 0;
  private time = 0;
  private settled = true;
  private focus = new THREE.Vector2();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private uniforms = { uOpacity: { value: 1 }, uSide: { value: new THREE.Color('#3b3833') } };
  private nightTop = new THREE.Color('#171d25');
  private dayTop = new THREE.Color('#565c64');
  /** 0 = streets closed, 1 = fully broken open (average slab progress) */
  reveal = 0;

  constructor(foundationMaterial: THREE.Material) {
    const rng = new Rng(808);
    const roadRects = subtractMany([MAIN], [...CANAL.rects, ...BLOCKS]);
    for (const r of roadRects) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const nx = Math.max(1, Math.round(w / TILE));
      const nz = Math.max(1, Math.round(d / TILE));
      const tw = w / nx;
      const td = d / nz;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          this.tiles.push({
            x: r.x0 + tw * (i + 0.5),
            z: r.z0 + td * (j + 0.5),
            w: tw - 0.06,
            d: td - 0.06,
            lift: rng.range(1.8, 4.2),
            tiltX: rng.range(-0.22, 0.22),
            tiltZ: rng.range(-0.22, 0.22),
            driftX: rng.range(-0.35, 0.35),
            driftZ: rng.range(-0.35, 0.35),
            delay: 0,
            p: 0,
            v: 0,
          });
        }
      }
    }

    this.material = new THREE.MeshStandardMaterial({ color: this.nightTop.clone(), roughness: 0.85, metalness: 0.04, transparent: true, envMapIntensity: 0.6 });
    this.patch(this.material);
    const geo = new THREE.BoxGeometry(1, THICK, 1).translate(0, -THICK / 2, 0);
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.tiles.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 1;
    this.tiles.forEach((_, i) => this.writeMatrix(i));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.group.add(this.mesh);

    // foundation faces along block edges: the cut walls you see once the street has opened
    const walls: THREE.BufferGeometry[] = [];
    const onCanal = (x0: number, z0: number, x1: number, z1: number) =>
      CANAL.rects.some((c) => {
        if (x0 === x1) return (Math.abs(x0 - c.x0) < 0.01 || Math.abs(x0 - c.x1) < 0.01) && Math.max(z0, c.z0) < Math.min(z1, c.z1);
        return (Math.abs(z0 - c.z0) < 0.01 || Math.abs(z0 - c.z1) < 0.01) && Math.max(x0, c.x0) < Math.min(x1, c.x1);
      });
    for (const b of BLOCKS) {
      const edges: [number, number, number, number, 'x' | 'z', 1 | -1][] = [
        [b.x0, b.z0, b.x0, b.z1, 'x', -1],
        [b.x1, b.z0, b.x1, b.z1, 'x', 1],
        [b.x0, b.z0, b.x1, b.z0, 'z', -1],
        [b.x0, b.z1, b.x1, b.z1, 'z', 1],
      ];
      for (const [x0, z0, x1, z1, axis, facing] of edges) {
        if (axis === 'x' && (Math.abs(x0 - MAIN.x0) < 0.01 || Math.abs(x0 - MAIN.x1) < 0.01)) continue;
        if (axis === 'z' && (Math.abs(z0 - MAIN.z0) < 0.01 || Math.abs(z0 - FACE_Z) < 0.01)) continue;
        if (onCanal(x0, z0, x1, z1)) continue;
        const len = axis === 'x' ? z1 - z0 : x1 - x0;
        const g = new THREE.PlaneGeometry(len, FOUNDATION);
        if (axis === 'x') g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
        else if (facing < 0) g.rotateY(Math.PI);
        g.translate(axis === 'x' ? x0 : (x0 + x1) / 2, -FOUNDATION / 2, axis === 'x' ? (z0 + z1) / 2 : z0);
        walls.push(g);
      }
    }
    if (walls.length) this.group.add(new THREE.Mesh(mergeGeometries(walls), foundationMaterial));
  }

  private patch(mat: THREE.MeshStandardMaterial) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTL; varying vec3 vTN; varying vec3 vTW;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vTL = position; vTN = normal;
           mat4 tIm = mat4(1.0);
           #ifdef USE_INSTANCING
             tIm = instanceMatrix;
           #endif
           vTW = (modelMatrix * tIm * vec4(position, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vTL; varying vec3 vTN; varying vec3 vTW;\nuniform float uOpacity; uniform vec3 uSide;\n${NOISE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float an = pk_fbm(vTW.xz * 0.08) * 0.32 + pk_noise(vTW.xz * 2.5) * 0.12;
           vec3 top = diffuseColor.rgb * (0.78 + an);
           float band = step(-0.16, vTL.y);
           vec3 side = mix(uSide * (0.8 + 0.4 * pk_noise(vec2(vTW.x + vTW.z, vTL.y * 9.0) * 3.0)), top * 0.8, band);
           diffuseColor.rgb = vTN.y > 0.5 ? top : side;
           diffuseColor.a = uOpacity;`,
        );
    };
    mat.customProgramCacheKey = () => 'pk-roadtile-v1';
  }

  private writeMatrix(i: number) {
    const t = this.tiles[i];
    const p = t.p;
    const s = 1 - 0.5 * THREE.MathUtils.smoothstep(p, 0, 1);
    // gentle idle float while hovering open
    const bob = Math.sin(this.time * 1.3 + i * 0.73) * 0.16 * Math.max(0, p);
    this.pos.set(t.x + t.driftX * p, t.lift * p + bob, t.z + t.driftZ * p);
    this.e.set(t.tiltX * p, 0, t.tiltZ * p);
    this.q.setFromEuler(this.e);
    this.scl.set(t.w * s, Math.max(0.35, s), t.d * s);
    this.m.compose(this.pos, this.q, this.scl);
    this.mesh.setMatrixAt(i, this.m);
  }

  /** Crack the streets open (ripple from `focus`) or bring them back together. */
  setOpen(open: boolean, focus?: { x: number; z: number }) {
    if (open === this.open) return;
    this.open = open;
    this.changedAt = this.time;
    if (focus) this.focus.set(focus.x, focus.z);
    let maxD = 1;
    for (const t of this.tiles) maxD = Math.max(maxD, Math.hypot(t.x - this.focus.x, t.z - this.focus.y));
    for (const t of this.tiles) {
      const d = Math.hypot(t.x - this.focus.x, t.z - this.focus.y);
      // opening ripples outward from the focus; closing sweeps back inward to it
      t.delay = open ? d * 0.006 + Math.random() * 0.08 : (maxD - d) * 0.0045 + Math.random() * 0.06;
    }
    this.settled = false;
  }

  setOpacity(v: number) {
    this.uniforms.uOpacity.value = v;
    this.material.depthWrite = v > 0.98;
  }

  setDay(day: boolean) {
    this.material.color.copy(day ? this.dayTop : this.nightTop);
    this.uniforms.uSide.value.set(day ? '#8a8174' : '#3b3833');
  }

  update(dt: number, t: number) {
    this.time = t;
    if (this.settled) {
      // keep the open slabs gently floating
      if (this.open) {
        for (let i = 0; i < this.tiles.length; i++) this.writeMatrix(i);
        this.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    const since = t - this.changedAt;
    const k = 95;
    const c = 10.5;
    let busy = false;
    let sum = 0;
    // frame-rate independent: integrate in ≤1/60 s sub-steps (capped for long stalls)
    const total = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(total / (1 / 60)));
    const step = total / n;
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      const target = since >= tile.delay ? (this.open ? 1 : 0) : this.open ? 0 : 1;
      for (let s = 0; s < n; s++) {
        const a = k * (target - tile.p) - c * tile.v;
        tile.v += a * step;
        tile.p += tile.v * step;
        if (tile.p < 0) {
          // slab lands: small bounce as the street locks back together
          tile.p = 0;
          tile.v = Math.abs(tile.v) > 0.4 ? -tile.v * 0.32 : 0;
        }
      }
      if (Math.abs(target - tile.p) > 0.002 || Math.abs(tile.v) > 0.01) busy = true;
      sum += tile.p;
      this.writeMatrix(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.reveal = sum / this.tiles.length;
    if (!busy) {
      this.settled = true;
      this.reveal = this.open ? 1 : 0;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.material.dispose();
  }
}
