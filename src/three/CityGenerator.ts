import * as THREE from 'three';
import { Rng } from './utils/random';
import {
  BLOCKS,
  CANAL,
  MAIN,
  OUTER,
  ROAD_W,
  SCHOOL_BLOCK,
  SIDEWALK,
  SECTOR_BY_ID,
  X_ROADS,
  Z_ROADS,
  rectContains,
  sectorAt,
  subtractMany,
  type Block,
  type Rect,
} from '../simulation/infrastructureData';

export interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y: number;
  /** 0 glass curtain wall · 1 punched windows · 2 vertical fins */
  style: number;
  /** 0 regular · 1 mechanical (no windows) · 2 civic/white */
  kind: number;
  seed: number;
  sector: number;
  color: THREE.Color;
  lit: number;
  rim: number;
}

export interface Spire {
  x: number;
  z: number;
  y: number;
  h: number;
}

export interface TreeSpec {
  x: number;
  z: number;
  s: number;
  y: number;
}

export interface LampSpec {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

export interface CityPlan {
  buildings: BuildingSpec[];
  distant: BuildingSpec[];
  spires: Spire[];
  trees: TreeSpec[];
  lamps: LampSpec[];
  distantPools: { x: number; z: number }[];
  parks: Rect[];
  fields: Rect[];
  distantBlocks: Rect[];
  xLines: number[];
  zLines: number[];
}

const GLASS = ['#2f5170', '#3a5f82', '#29465f', '#43678a', '#335a7c'];
const CONCRETE = ['#5e6a77', '#535f6d', '#6d7784', '#4a5563', '#646f7b'];
const WARM = ['#6e655b', '#625a52', '#776c60'];
const DOWNTOWN = new THREE.Vector2(32, -52);
export const MAST = { x: 70.5, z: -63 };

function col(hex: string) {
  return new THREE.Color(hex);
}

export function generateCity(seed = 1337): CityPlan {
  const rng = new Rng(seed);
  const buildings: BuildingSpec[] = [];
  const spires: Spire[] = [];
  const trees: TreeSpec[] = [];
  const lamps: LampSpec[] = [];
  const parks: Rect[] = [];
  const fields: Rect[] = [];

  const sectorIndex = (x: number, z: number) => {
    const s = sectorAt(x, z);
    return s ? SECTOR_BY_ID[s].index : -1;
  };

  const pushBox = (b: Omit<BuildingSpec, 'sector' | 'seed' | 'lit' | 'rim'> & Partial<BuildingSpec>) => {
    buildings.push({
      sector: sectorIndex(b.x, b.z),
      seed: rng.next(),
      lit: rng.range(0.28, 0.62),
      rim: 0,
      ...b,
    } as BuildingSpec);
  };

  const roofUnits = (x: number, z: number, w: number, d: number, top: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const uw = Math.min(w * 0.4, rng.range(2, 4.5));
      const ud = Math.min(d * 0.4, rng.range(2, 4.5));
      pushBox({
        x: x + rng.range(-w / 2 + uw / 2 + 0.4, w / 2 - uw / 2 - 0.4),
        z: z + rng.range(-d / 2 + ud / 2 + 0.4, d / 2 - ud / 2 - 0.4),
        w: uw,
        d: ud,
        h: rng.range(1.2, 2.6),
        y: top,
        style: 1,
        kind: 1,
        color: col('#3b4450'),
      });
    }
  };

  const tower = (x: number, z: number, w: number, d: number, H: number) => {
    const podH = rng.range(5, 9);
    const glassy = rng.chance(0.7);
    pushBox({ x, z, w, d, h: podH, y: 0, style: 1, kind: 0, color: col(rng.pick(CONCRETE)) });
    const inset = rng.range(0.12, 0.22);
    const tw = w * (1 - inset * 2);
    const td = d * (1 - inset * 2);
    const crown = H > 40 && rng.chance(0.6) ? rng.range(4, 9) : 0;
    const shaftH = H - podH - crown;
    const style = glassy ? (rng.chance(0.35) ? 2 : 0) : 1;
    const color = col(glassy ? rng.pick(GLASS) : rng.pick(CONCRETE));
    pushBox({ x, z, w: tw, d: td, h: shaftH, y: podH, style, kind: 0, color, rim: H > 38 ? 1 : 0 });
    let top = podH + shaftH;
    let cw = tw;
    let cd = td;
    if (crown > 0) {
      cw = tw * rng.range(0.62, 0.8);
      cd = td * rng.range(0.62, 0.8);
      pushBox({ x, z, w: cw, d: cd, h: crown, y: top, style, kind: 0, color, rim: 1 });
      top += crown;
    }
    roofUnits(x, z, cw, cd, top, rng.int(1, 2));
    if (H > 52 && rng.chance(0.75)) spires.push({ x, z, y: top, h: rng.range(6, 14) });
  };

  const midrise = (x: number, z: number, w: number, d: number, H: number, warm: boolean) => {
    const glassy = !warm && rng.chance(0.35);
    const color = col(warm ? rng.pick(WARM) : glassy ? rng.pick(GLASS) : rng.pick(CONCRETE));
    const style = glassy ? 0 : 1;
    if (H > 16 && rng.chance(0.45)) {
      // setback massing
      const h1 = H * rng.range(0.55, 0.7);
      pushBox({ x, z, w, d, h: h1, y: 0, style, kind: 0, color });
      const w2 = w * rng.range(0.6, 0.82);
      const d2 = d * rng.range(0.6, 0.82);
      const ox = (w - w2) / 2 * (rng.chance(0.5) ? 1 : -1) * rng.range(0, 1);
      const oz = (d - d2) / 2 * (rng.chance(0.5) ? 1 : -1) * rng.range(0, 1);
      pushBox({ x: x + ox, z: z + oz, w: w2, d: d2, h: H - h1, y: h1, style, kind: 0, color });
      roofUnits(x + ox, z + oz, w2, d2, H, 1);
    } else {
      pushBox({ x, z, w, d, h: H, y: 0, style, kind: 0, color });
      roofUnits(x, z, w, d, H, rng.int(1, 2));
    }
  };

  const lowrise = (x: number, z: number, w: number, d: number, H: number) => {
    pushBox({ x, z, w, d, h: H, y: 0, style: 1, kind: 0, color: col(rng.pick(WARM.concat(CONCRETE))) });
    if (rng.chance(0.5)) roofUnits(x, z, w, d, H, 1);
  };

  const maxHeightFor = (b: Block, cx: number, cz: number) => {
    const dist = DOWNTOWN.distanceTo(new THREE.Vector2(cx, cz));
    let hmax = THREE.MathUtils.lerp(78, 18, THREE.MathUtils.smoothstep(dist, 10, 150));
    if (b.sector === 'B-12') hmax = Math.min(hmax, 34);
    if (b.sector === 'D-4') hmax = Math.min(hmax, 22);
    if (b.z0 > 30) hmax = Math.min(hmax, 28); // front row stays low for the overview camera
    return hmax;
  };

  for (const b of BLOCKS) {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;

    if (b.kind === 'hospital') {
      pushBox({ x: 35.5, z: 7, w: 19, d: 14, h: 18, y: 0, style: 1, kind: 2, color: col('#c6d3dc') });
      pushBox({ x: 31, z: 18, w: 10, d: 7, h: 10, y: 0, style: 1, kind: 2, color: col('#b9c7d1') });
      pushBox({ x: 42.5, z: 18.5, w: 7, d: 5, h: 4.5, y: 0, style: 0, kind: 2, color: col('#8fa7b8') });
      roofUnits(31, 18, 10, 7, 10, 1);
      continue;
    }
    if (b.kind === 'school') {
      const r = SCHOOL_BLOCK;
      pushBox({ x: -34.5, z: -35, w: 23, d: 6, h: 7, y: 0, style: 1, kind: 2, color: col('#a9967f') });
      pushBox({ x: -43, z: -28, w: 6, d: 8, h: 6.5, y: 0, style: 1, kind: 2, color: col('#a9967f') });
      pushBox({ x: -26, z: -28, w: 6, d: 8, h: 6.5, y: 0, style: 1, kind: 2, color: col('#a9967f') });
      fields.push({ x0: r.x0 + 6, x1: r.x1 - 6, z0: -23, z1: -15 });
      continue;
    }
    if (rectContains(b, MAST.x, MAST.z)) {
      // landmark telecom mast on a low technical podium
      pushBox({ x: MAST.x, z: MAST.z + 4, w: 18, d: 10, h: 7, y: 0, style: 1, kind: 0, color: col('#4f5b68') });
      pushBox({ x: MAST.x - 6, z: MAST.z - 7, w: 9, d: 9, h: 12, y: 0, style: 0, kind: 0, color: col(rng.pick(GLASS)) });
      roofUnits(MAST.x, MAST.z + 4, 18, 10, 7, 2);
      spires.push({ x: MAST.x + 3, z: MAST.z - 6, y: 0, h: -1 });
      continue;
    }
    if (b.kind === 'park') {
      parks.push({ x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0 + 1, z1: b.z1 - 1 });
      for (let i = 0; i < 46; i++) {
        trees.push({ x: rng.range(b.x0 + 2, b.x1 - 2), z: rng.range(b.z0 + 2, b.z1 - 2), s: rng.range(0.8, 1.35), y: 0.25 });
      }
      continue;
    }
    if (b.kind === 'plaza' || b.kind === 'promenade') {
      const n = Math.floor((w * d) / 40);
      for (let i = 0; i < n; i++) {
        trees.push({ x: rng.range(b.x0 + 1, b.x1 - 1), z: rng.range(b.z0 + 1, b.z1 - 1), s: rng.range(0.6, 1.0), y: 0.25 });
      }
      continue;
    }

    // urban block → lots
    const bx0 = b.x0 + SIDEWALK;
    const bx1 = b.x1 - SIDEWALK;
    const bz0 = b.z0 + SIDEWALK;
    const bz1 = b.z1 - SIDEWALK;
    const bw = bx1 - bx0;
    const bd = bz1 - bz0;
    const hmax = maxHeightFor(b, cx, cz);
    const residential = b.sector === 'B-12' || b.sector === 'D-4';

    if (hmax > 46 && rng.chance(0.55)) {
      tower(cx, cz, bw, bd, rng.range(hmax * 0.7, hmax));
      continue;
    }
    const nx = bw > 20 && rng.chance(0.75) ? 2 : 1;
    const nz = bd > 20 && rng.chance(0.75) ? 2 : 1;
    const gap = 1.6;
    const lw = (bw - gap * (nx - 1)) / nx;
    const ld = (bd - gap * (nz - 1)) / nz;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const lx = bx0 + lw / 2 + ix * (lw + gap);
        const lz = bz0 + ld / 2 + iz * (ld + gap);
        if (rng.chance(0.08) && nx * nz > 1) {
          // small courtyard / pocket plaza
          for (let k = 0; k < 3; k++) trees.push({ x: lx + rng.range(-lw / 3, lw / 3), z: lz + rng.range(-ld / 3, ld / 3), s: rng.range(0.6, 0.9), y: 0.25 });
          continue;
        }
        const H = rng.range(hmax * 0.35, hmax);
        const sx = lw * rng.range(0.86, 1);
        const sz = ld * rng.range(0.86, 1);
        if (H > 36 && lw > 10) tower(lx, lz, sx, sz, H);
        else if (H > 11) midrise(lx, lz, sx, sz, H, residential && rng.chance(0.6));
        else lowrise(lx, lz, sx, sz, Math.max(5, H));
      }
    }
  }

  // ---- street trees & lamps along main-area roads ----------------------
  const inCanal = (x: number, z: number) => CANAL.rects.some((r) => rectContains(r, x, z));
  const nearCross = (v: number, lines: number[]) => lines.some((l) => Math.abs(v - l) < ROAD_W / 2 + 3.5);
  const blockKindAt = (x: number, z: number) => BLOCKS.find((b) => rectContains(b, x, z))?.kind;

  for (const x of X_ROADS) {
    for (let z = MAIN.z0 + 3; z < MAIN.z1 - 6; z += 7) {
      if (nearCross(z, Z_ROADS)) continue;
      for (const side of [-1, 1]) {
        const tx = x + side * (ROAD_W / 2 + 1.0);
        if (inCanal(tx, z) || inCanal(tx + side * 1.5, z)) continue;
        const kind = blockKindAt(tx, z);
        if (!kind || kind === 'park') continue;
        if (rng.chance(0.82)) trees.push({ x: tx, z: z + rng.range(-0.8, 0.8), s: rng.range(0.7, 1.0), y: 0.25 });
      }
    }
    for (let z = MAIN.z0 + 6; z < MAIN.z1 - 4; z += 16) {
      if (nearCross(z, Z_ROADS)) continue;
      const side = Math.round(z / 16) % 2 === 0 ? 1 : -1;
      const lx = x + side * (ROAD_W / 2 + 0.35);
      if (inCanal(lx, z) || inCanal(lx + side, z)) continue;
      lamps.push({ x: lx, z, dirX: -side, dirZ: 0 });
    }
  }
  for (const z of Z_ROADS) {
    for (let x = MAIN.x0 + 3; x < MAIN.x1 - 3; x += 7) {
      if (nearCross(x, X_ROADS)) continue;
      for (const side of [-1, 1]) {
        const tz = z + side * (ROAD_W / 2 + 1.0);
        if (inCanal(x, tz) || tz > MAIN.z1 - 0.5) continue;
        const kind = blockKindAt(x, tz);
        if (!kind || kind === 'park') continue;
        if (rng.chance(0.82)) trees.push({ x: x + rng.range(-0.8, 0.8), z: tz, s: rng.range(0.7, 1.0), y: 0.25 });
      }
    }
    for (let x = MAIN.x0 + 5; x < MAIN.x1 - 3; x += 16) {
      if (nearCross(x, X_ROADS)) continue;
      const side = Math.round(x / 16) % 2 === 0 ? 1 : -1;
      const lz = z + side * (ROAD_W / 2 + 0.35);
      if (inCanal(x, lz)) continue;
      lamps.push({ x, z: lz, dirX: 0, dirZ: -side });
    }
  }
  // canal promenade trees
  for (let z = MAIN.z0 + 3; z < 0; z += 6) {
    trees.push({ x: -75, z, s: rng.range(0.6, 0.85), y: 0.25 });
    trees.push({ x: -57, z: z + 3, s: rng.range(0.6, 0.85), y: 0.25 });
  }

  // ---- distant city ------------------------------------------------------
  const xLines: number[] = [...X_ROADS];
  for (let x = MAIN.x0 - 4; x > OUTER.x0; x -= 36) xLines.unshift(x);
  for (let x = MAIN.x1 + 4; x < OUTER.x1; x += 36) xLines.push(x);
  const zLines: number[] = [...Z_ROADS];
  for (let z = MAIN.z0 - 4; z > OUTER.z0; z -= 36) zLines.unshift(z);

  const intervals = (lines: number[], min: number, max: number) => {
    const out: [number, number][] = [];
    let s = min;
    for (const l of lines) {
      if (l - ROAD_W / 2 > s) out.push([s, l - ROAD_W / 2]);
      s = l + ROAD_W / 2;
    }
    if (max > s) out.push([s, max]);
    return out;
  };
  const xi = intervals(xLines, OUTER.x0, OUTER.x1);
  const zi = intervals(zLines, OUTER.z0, Z_ROADS[3] - ROAD_W / 2);
  const distantBlocks: Rect[] = [];
  for (const [x0, x1] of xi) {
    for (const [z0, z1] of zi) {
      const pieces = subtractMany([{ x0, x1, z0, z1 }], [MAIN, ...CANAL.rects]);
      for (const p of pieces) if (p.x1 - p.x0 > 6 && p.z1 - p.z0 > 6) distantBlocks.push(p);
    }
  }
  // front strip beside the detailed area (between the waterfront avenue and the cut)
  for (const [x0, x1] of xi) {
    const pieces = subtractMany([{ x0, x1, z0: Z_ROADS[3] + ROAD_W / 2, z1: OUTER.z1 }], [MAIN]);
    for (const p of pieces) if (p.x1 - p.x0 > 6) distantBlocks.push(p);
  }

  const distant: BuildingSpec[] = [];
  const skyline = new THREE.Vector2(40, -260);
  for (const b of distantBlocks) {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const dist = Math.hypot(cx, cz - 20);
    if (dist > 640) continue;
    if (b.z0 > Z_ROADS[3]) continue; // keep the waterfront strip open
    const toSky = skyline.distanceTo(new THREE.Vector2(cx, cz));
    const hmax = Math.max(10, THREE.MathUtils.lerp(110, 16, THREE.MathUtils.smoothstep(toSky, 30, 280)));
    const w = b.x1 - b.x0 - 2.5;
    const d = b.z1 - b.z0 - 2.5;
    const n = w > 18 && d > 18 && rng.chance(0.65) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const bw = n === 2 ? w / 2 - 1 : w;
      const ox = n === 2 ? (i === 0 ? -w / 4 : w / 4) : 0;
      const H = rng.chance(0.15) ? rng.range(hmax * 0.6, hmax) : rng.range(6, Math.min(hmax, 34));
      const glassy = H > 40 || rng.chance(0.25);
      distant.push({
        x: cx + ox,
        z: cz,
        w: bw * rng.range(0.75, 1),
        d: d * rng.range(0.75, 1),
        h: H,
        y: 0,
        style: glassy ? (rng.chance(0.3) ? 2 : 0) : 1,
        kind: 0,
        seed: rng.next(),
        sector: -1,
        color: col(glassy ? rng.pick(GLASS) : rng.pick(CONCRETE)).multiplyScalar(0.8),
        lit: rng.range(0.18, 0.45),
        rim: H > 60 ? 1 : 0,
      });
    }
  }

  const distantPools: { x: number; z: number }[] = [];
  for (const x of xLines) {
    if (x > MAIN.x0 - 5 && x < MAIN.x1 + 5) {
      for (let z = MAIN.z0 - 8; z > -420; z -= 18) if (!inCanal(x, z)) distantPools.push({ x: x + 3.6, z });
      continue;
    }
    if (Math.abs(x) > 460) continue;
    for (let z = Z_ROADS[3]; z > -420; z -= 18) if (!inCanal(x, z)) distantPools.push({ x: x + 3.6, z });
  }
  for (const z of zLines) {
    for (let x = -460; x < 460; x += 18) {
      if (z > MAIN.z0 - 5 && x > MAIN.x0 - 2 && x < MAIN.x1 + 2) continue;
      if (z < -420 || inCanal(x, z)) continue;
      distantPools.push({ x, z: z + 3.6 });
    }
  }

  return { buildings, distant, spires, trees, lamps, distantPools, parks, fields, distantBlocks, xLines, zLines };
}
