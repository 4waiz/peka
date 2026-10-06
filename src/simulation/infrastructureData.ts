/**
 * Static description of the monitored city: layout, sectors, utility networks,
 * facilities and key assets. Shared by the Three.js digital twin and the 2D UI
 * (minimap, analytics) so both always describe the same world.
 *
 * World units: horizontal 1u ≈ 4 m, vertical cut-away is exaggerated (1u ≈ 0.48 m).
 */

export type UtilityId = 'water' | 'electricity' | 'telecom' | 'cooling' | 'sewage';
export type SectorId = 'A-7' | 'B-12' | 'C-3' | 'D-4';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Detailed digital-twin area (sectors live here). */
export const MAIN: Rect = { x0: -112, x1: 118, z0: -78, z1: 70 };
/** Extended low-detail surroundings. */
export const OUTER: Rect = { x0: -640, x1: 640, z0: -660, z1: 70 };

export const FACE_Z = 70; // upper cut face (city edge)
export const BENCH_Y = -12; // safety bench between the two excavation faces
export const LOWER_FACE_Z = 77.5; // lower cut face
export const FLOOR_Y = -26; // floor of the x-ray box under the district
export const DEEP_Y = -46; // the cut section continues down and fades into darkness
/** y below which the section fades to black (just under the deepest utility) */
export const FADE_TOP = -24.6;
export const ROAD_W = 8;
export const SIDEWALK = 2;

/** Roads running along Z (constant x). */
export const X_ROADS = [-80, -52, -17, 18, 53, 88];
/** Roads running along X (constant z). The last one is the waterfront avenue. */
export const Z_ROADS = [-44, -8, 28, 62];

export const CANAL = {
  rects: [
    { x0: -74, x1: -58, z0: OUTER.z0, z1: 18 },
    { x0: OUTER.x0, x1: -74, z0: 2, z1: 18 },
  ] as Rect[],
  waterY: -1.1,
  bedY: -3.2,
};

export function rectContains(r: Rect, x: number, z: number) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Axis-aligned rectangle subtraction: returns `a - b` as up to four rects. */
export function subtractRect(a: Rect, b: Rect): Rect[] {
  if (b.x1 <= a.x0 || b.x0 >= a.x1 || b.z1 <= a.z0 || b.z0 >= a.z1) return [a];
  const out: Rect[] = [];
  if (b.z0 > a.z0) out.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: b.z0 });
  if (b.z1 < a.z1) out.push({ x0: a.x0, x1: a.x1, z0: b.z1, z1: a.z1 });
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (b.x0 > a.x0) out.push({ x0: a.x0, x1: b.x0, z0, z1 });
  if (b.x1 < a.x1) out.push({ x0: b.x1, x1: a.x1, z0, z1 });
  return out.filter((r) => r.x1 - r.x0 > 0.01 && r.z1 - r.z0 > 0.01);
}

export function subtractMany(rects: Rect[], holes: Rect[]): Rect[] {
  let cur = rects;
  for (const h of holes) cur = cur.flatMap((r) => subtractRect(r, h));
  return cur;
}

export type BlockKind = 'urban' | 'park' | 'plaza' | 'promenade' | 'hospital' | 'school';

export interface Block extends Rect {
  kind: BlockKind;
  sector: SectorId;
}

function intervalsBetweenRoads(roads: number[], min: number, max: number): [number, number][] {
  const edges: [number, number][] = [];
  let start = min;
  for (const r of roads) {
    const a = r - ROAD_W / 2;
    const b = r + ROAD_W / 2;
    if (a > start) edges.push([start, a]);
    start = b;
  }
  if (max > start) edges.push([start, max]);
  return edges;
}

export const HOSPITAL_BLOCK: Rect = { x0: 22, x1: 49, z0: -4, z1: 24 };
export const SCHOOL_BLOCK: Rect = { x0: -48, x1: -21, z0: -40, z1: -12 };
export const PARK_BLOCK: Rect = { x0: -112, x1: -84, z0: 32, z1: 58 };

function rectEq(a: Rect, b: Rect) {
  return Math.abs(a.x0 - b.x0) < 0.01 && Math.abs(a.x1 - b.x1) < 0.01 && Math.abs(a.z0 - b.z0) < 0.01 && Math.abs(a.z1 - b.z1) < 0.01;
}

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export interface SectorDef {
  id: SectorId;
  index: number;
  district: string;
  rect: Rect;
  baseRisk: RiskLevel;
  health: number;
  assets: number;
  population: number;
}

export const SECTORS: SectorDef[] = [
  { id: 'A-7', index: 0, district: 'Civic Quarter', rect: { x0: -112, x1: 18, z0: -78, z1: -8 }, baseRisk: 'medium', health: 94.2, assets: 96, population: 18200 },
  { id: 'B-12', index: 1, district: 'Riverside District', rect: { x0: -57, x1: 18, z0: -8, z1: 70 }, baseRisk: 'low', health: 96.8, assets: 88, population: 12400 },
  { id: 'C-3', index: 2, district: 'Medical District', rect: { x0: 18, x1: 118, z0: -78, z1: 70 }, baseRisk: 'low', health: 97.9, assets: 102, population: 21600 },
  { id: 'D-4', index: 3, district: 'Canal West', rect: { x0: -112, x1: -57, z0: -8, z1: 70 }, baseRisk: 'low', health: 98.1, assets: 56, population: 7900 },
];

export const SECTOR_BY_ID: Record<SectorId, SectorDef> = Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<SectorId, SectorDef>;

export function sectorAt(x: number, z: number): SectorId | null {
  // B-12 / D-4 take precedence on shared edges
  for (const id of ['B-12', 'D-4', 'A-7', 'C-3'] as SectorId[]) {
    if (rectContains(SECTOR_BY_ID[id].rect, x, z)) return id;
  }
  return null;
}

export function sectorCenter(id: SectorId): [number, number] {
  const r = SECTOR_BY_ID[id].rect;
  return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
}

export const TOTAL_ASSETS = SECTORS.reduce((a, s) => a + s.assets, 0); // 342

/** City blocks of the detailed area (canal already removed). */
export const BLOCKS: Block[] = (() => {
  const xs = intervalsBetweenRoads(X_ROADS, MAIN.x0, MAIN.x1);
  const zs = intervalsBetweenRoads(Z_ROADS, MAIN.z0, MAIN.z1);
  const blocks: Block[] = [];
  for (const [x0, x1] of xs) {
    for (const [z0, z1] of zs) {
      const base: Rect = { x0, x1, z0, z1 };
      const pieces = subtractMany([base], CANAL.rects);
      for (const p of pieces) {
        const w = p.x1 - p.x0;
        const d = p.z1 - p.z0;
        let kind: BlockKind = 'urban';
        if (p.z0 >= Z_ROADS[3] + ROAD_W / 2 - 0.01) kind = 'promenade';
        else if (w < 10 || d < 10) kind = 'plaza';
        else if (rectEq(p, HOSPITAL_BLOCK)) kind = 'hospital';
        else if (rectEq(p, SCHOOL_BLOCK)) kind = 'school';
        else if (rectEq(p, PARK_BLOCK)) kind = 'park';
        const cx = (p.x0 + p.x1) / 2;
        const cz = (p.z0 + p.z1) / 2;
        blocks.push({ ...p, kind, sector: sectorAt(cx, cz) ?? 'C-3' });
      }
    }
  }
  return blocks;
})();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export interface UtilitySpec {
  id: UtilityId;
  label: string;
  full: string;
  prefix: string;
  color: string;
  depth: number;
  cityRadius: number;
  laneOffset: number;
  conduits: { z: number; r: number }[];
  niche: { y0: number; y1: number; backZ: number; faceZ: number };
  flow: { speed: number; spacing: number; width: number; strength: number };
  material: string;
  diameters: number[];
}

export const UTILITY_ORDER: UtilityId[] = ['electricity', 'telecom', 'water', 'cooling', 'sewage'];
export const LAYER_ORDER: UtilityId[] = ['water', 'electricity', 'sewage', 'telecom', 'cooling'];

export const UTILITIES: Record<UtilityId, UtilitySpec> = {
  electricity: {
    id: 'electricity',
    label: 'Electricity',
    full: 'Electricity',
    prefix: 'ELC',
    color: '#FFD447',
    depth: -3.0,
    cityRadius: 0.5,
    laneOffset: -2.6,
    conduits: [
      { z: 67.3, r: 0.46 },
      { z: 68.35, r: 0.46 },
      { z: 69.4, r: 0.46 },
    ],
    niche: { y0: -4.1, y1: -1.8, backZ: 66.7, faceZ: FACE_Z },
    flow: { speed: 16, spacing: 9, width: 0.11, strength: 1.5 },
    material: 'XLPE 11 kV cable in HDPE duct',
    diameters: [160, 200],
  },
  telecom: {
    id: 'telecom',
    label: 'Telecom',
    full: 'Data / Telecom',
    prefix: 'TEL',
    color: '#28E8C4',
    depth: -5.75,
    cityRadius: 0.38,
    laneOffset: -1.3,
    conduits: [
      { z: 67.9, r: 0.3 },
      { z: 68.7, r: 0.3 },
      { z: 69.5, r: 0.3 },
    ],
    niche: { y0: -6.5, y1: -5.0, backZ: 67.4, faceZ: FACE_Z },
    flow: { speed: 26, spacing: 6, width: 0.1, strength: 1.5 },
    material: '144F fibre optic in HDPE microduct',
    diameters: [110, 125],
  },
  water: {
    id: 'water',
    label: 'Water',
    full: 'Water Supply',
    prefix: 'WTR',
    color: '#28A9FF',
    depth: -9.4,
    cityRadius: 1.15,
    laneOffset: 0,
    conduits: [{ z: 68.3, r: 1.5 }],
    niche: { y0: -11.5, y1: -7.3, backZ: 66.4, faceZ: FACE_Z },
    flow: { speed: 7, spacing: 7, width: 0.18, strength: 1.2 },
    material: 'Ductile Iron',
    diameters: [600, 900],
  },
  cooling: {
    id: 'cooling',
    label: 'Cooling',
    full: 'District Cooling',
    prefix: 'CLG',
    color: '#9C67FF',
    depth: -15.7,
    cityRadius: 0.95,
    laneOffset: 1.3,
    conduits: [
      { z: 73.7, r: 1.08 },
      { z: 76.2, r: 1.08 },
    ],
    niche: { y0: -17.6, y1: -13.8, backZ: 72.2, faceZ: LOWER_FACE_Z },
    flow: { speed: 3, spacing: 10, width: 0.28, strength: 0.95 },
    material: 'Pre-insulated steel (chilled water)',
    diameters: [500, 700],
  },
  sewage: {
    id: 'sewage',
    label: 'Sewage',
    full: 'Sewage',
    prefix: 'SWR',
    color: '#E58A38',
    depth: -21.6,
    cityRadius: 1.4,
    laneOffset: 2.6,
    conduits: [{ z: 75.3, r: 1.9 }],
    niche: { y0: -24.2, y1: -18.8, backZ: 72.8, faceZ: LOWER_FACE_Z },
    flow: { speed: 1.4, spacing: 9, width: 0.32, strength: 0.5 },
    material: 'Glass-reinforced plastic (GRP)',
    diameters: [900, 1200],
  },
};

/** Units → metres for depth read-outs (vertical exaggeration of the cut-away). */
export const DEPTH_SCALE = 0.34;
export const UNIT_METRES = 4;

export interface RouteDef {
  utility: UtilityId;
  kind: 'trunk' | 'main' | 'branch';
  points: [number, number, number][];
  radius: number;
  conduit?: number;
}

function branch(u: UtilitySpec, xRoad: number, zFrom: number, zTo: number): RouteDef {
  const x = xRoad + u.laneOffset;
  return { utility: u.id, kind: 'branch', radius: u.cityRadius, points: [[x, u.depth, zFrom], [x, u.depth, zTo]] };
}
function cross(u: UtilitySpec, zRoad: number, xFrom: number, xTo: number): RouteDef {
  const z = zRoad + u.laneOffset;
  return { utility: u.id, kind: 'main', radius: u.cityRadius, points: [[xFrom, u.depth, z], [xTo, u.depth, z]] };
}

const TRUNK_X = 620;

/** All utility routes. Trunks run along the cut face, mains/branches under streets. */
export const ROUTES: RouteDef[] = (() => {
  const out: RouteDef[] = [];
  const add = (u: UtilitySpec) => {
    // Trunks along the cut face. Flow goes east → west.
    u.conduits.forEach((c, i) => {
      out.push({ utility: u.id, kind: 'trunk', conduit: i, radius: c.r, points: [[TRUNK_X, u.depth, c.z], [-TRUNK_X, u.depth, c.z]] });
    });
  };
  Object.values(UTILITIES).forEach(add);

  const W = UTILITIES.water;
  const rearW = W.conduits[0].z;
  for (const x of X_ROADS) out.push(branch(W, x, rearW, MAIN.z0 + 2));
  for (const z of [-44, -8, 28]) out.push(cross(W, z, MAIN.x0 + 2, MAIN.x1 - 2));

  const E = UTILITIES.electricity;
  const rearE = E.conduits[0].z;
  for (const x of [-52, -17, 18, 53, 88]) out.push(branch(E, x, rearE, MAIN.z0 + 2));
  out.push(branch(E, -80, rearE, 20));
  out.push(branch(E, -80, -1, MAIN.z0 + 2));
  out.push(cross(E, 28, MAIN.x0 + 2, MAIN.x1 - 2));
  out.push(cross(E, -8, -52 + E.laneOffset, MAIN.x1 - 2));
  out.push(cross(E, -44, -52 + E.laneOffset, MAIN.x1 - 2));
  out.push(cross(E, -8, MAIN.x0 + 2, -77));
  out.push(cross(E, -44, MAIN.x0 + 2, -77));

  const T = UTILITIES.telecom;
  const rearT = T.conduits[0].z;
  for (const x of [-80, -17, 18, 53, 88]) out.push(branch(T, x, rearT, MAIN.z0 + 2));
  out.push(cross(T, -8, MAIN.x0 + 2, MAIN.x1 - 2));
  out.push(cross(T, 28, MAIN.x0 + 2, MAIN.x1 - 2));

  const C = UTILITIES.cooling;
  const rearC = C.conduits[0].z;
  for (const x of [-17, 18, 53]) out.push(branch(C, x, rearC, MAIN.z0 + 2));
  out.push(cross(C, -8, -52, MAIN.x1 - 2));
  out.push(cross(C, -44, -17 + C.laneOffset, 88 + C.laneOffset));

  const S = UTILITIES.sewage;
  const rearS = S.conduits[0].z;
  for (const x of [-52, -17, 53, 88]) out.push(branch(S, x, rearS, MAIN.z0 + 2));
  out.push(cross(S, -44, MAIN.x0 + 2, MAIN.x1 - 2));
  out.push(cross(S, 28, MAIN.x0 + 2, MAIN.x1 - 2));
  return out;
})();

// ---------------------------------------------------------------------------
// Incident / key assets
// ---------------------------------------------------------------------------

export const LEAK = {
  x: -26,
  /** Pipe centre */
  center: [-26, UTILITIES.water.depth, UTILITIES.water.conduits[0].z] as [number, number, number],
  /** Crack on the front-lower surface of the main */
  crack: [-26, UTILITIES.water.depth - 0.423 * UTILITIES.water.conduits[0].r, UTILITIES.water.conduits[0].z + 0.906 * UTILITIES.water.conduits[0].r] as [number, number, number],
  surface: [-26, 0.3, 67.5] as [number, number, number],
  assetId: 'WTR-B12-047',
  sector: 'B-12' as SectorId,
};

export interface Facility {
  id: 'hospital' | 'school';
  name: string;
  short: string;
  position: [number, number, number];
  distance: string;
}

export const FACILITIES: Facility[] = [
  { id: 'hospital', name: 'Central City Hospital', short: 'Hospital', position: [35.5, 21, 10], distance: '320 m' },
  { id: 'school', name: 'Riverside Primary School', short: 'School', position: [-34.5, 9, -26], distance: '480 m' },
];

export const POPULATION_POINT: [number, number, number] = [-20, 14, 16];
export const ROAD_CLOSURE = { z: 62, x0: -50, x1: -4 };

export interface SensorNode {
  id: string;
  label: string;
  kind: 'pressure' | 'moisture' | 'flow' | 'temperature';
  position: [number, number, number];
}

export const SENSOR_NODES: SensorNode[] = [
  { id: 'PS-B12-04', label: 'Pressure sensor', kind: 'pressure', position: [-44, 0.3, 67.4] },
  { id: 'MP-B12-11', label: 'Soil moisture probe', kind: 'moisture', position: [-31, 0.3, 57] },
  { id: 'FM-B12-02', label: 'Flow meter', kind: 'flow', position: [-14.5, 0.3, 30.5] },
  { id: 'TP-B12-07', label: 'Temperature probe', kind: 'temperature', position: [4, 0.3, 64.5] },
];

export const VALVES = [
  { id: 'WV-776', x: -44, status: 'Open' },
  { id: 'WV-781', x: -8, status: 'Open' },
];

/** Crew route from the C-3 maintenance depot to the leak (road lanes). */
export const CREW_ROUTE: [number, number][] = [
  [116, -5.6],
  [-14.6, -5.6],
  [-14.6, 59.6],
  [-24, 59.6],
];

export const RELATED_ASSETS = [
  { id: 'WTR-B12-047', name: 'Water Main', detail: 'Depth 3.2 m · Ø900 mm', kind: 'water' },
  { id: 'FS-3381', name: 'Flow Sensor', detail: 'Last reading 2.7% below normal', kind: 'sensor' },
  { id: 'WV-776', name: 'Isolation Valve', detail: 'Status: Open · downstream', kind: 'valve' },
  { id: 'WV-781', name: 'Isolation Valve', detail: 'Status: Open · upstream', kind: 'valve' },
];
