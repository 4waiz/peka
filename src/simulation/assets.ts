import { DEPTH_SCALE, LEAK, UTILITIES, type SectorId, type UtilityId } from './infrastructureData';

export interface AssetRef {
  assetId: string;
  utility: UtilityId;
  kind: 'trunk' | 'main' | 'branch';
  sector: SectorId | null;
  depth: number;
  length: number;
}

export interface AssetDetails {
  assetId: string;
  utility: UtilityId;
  type: string;
  material: string;
  diameter: string;
  installed: number;
  lastInspection: string;
  reading: string;
  readingLabel: string;
  health: number;
  failureProbability: number;
  depthM: string;
  lengthM: string;
  sector: SectorId | null;
  critical: boolean;
}

function h(s: string, salt = 0) {
  let x = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return ((x >>> 0) % 100000) / 100000;
}

const TYPE_NAMES: Record<UtilityId, Record<AssetRef['kind'], string>> = {
  water: { trunk: 'Primary Water Main', main: 'Distribution Main', branch: 'Service Main' },
  electricity: { trunk: '11 kV Feeder Bank', main: 'LV Distribution Cable', branch: 'Service Cable' },
  telecom: { trunk: 'Fibre Backbone Duct', main: 'Metro Fibre Ring', branch: 'Access Fibre Duct' },
  cooling: { trunk: 'Chilled Water Trunk', main: 'Chilled Water Main', branch: 'Building Branch' },
  sewage: { trunk: 'Trunk Sewer', main: 'Collector Sewer', branch: 'Lateral Sewer' },
};

const READING: Record<UtilityId, { label: string; make: (r: number) => string }> = {
  water: { label: 'Current pressure', make: (r) => `${(4.0 + r * 0.6).toFixed(1)} bar` },
  electricity: { label: 'Current load', make: (r) => `${Math.round(48 + r * 30)}% · 11 kV` },
  telecom: { label: 'Utilisation', make: (r) => `${Math.round(30 + r * 35)}% · ${(1.2 + r).toFixed(1)} Tbps` },
  cooling: { label: 'Supply temperature', make: (r) => `${(5.6 + r * 1.1).toFixed(1)} °C` },
  sewage: { label: 'Flow capacity', make: (r) => `${Math.round(28 + r * 30)}% used` },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Deterministic mock asset register entry for any pipe segment. */
export function getAssetDetails(ref: AssetRef, live?: { pressureDelta: number; health?: number; failure?: number }): AssetDetails {
  const spec = UTILITIES[ref.utility];
  const r1 = h(ref.assetId, 1);
  const r2 = h(ref.assetId, 2);
  const r3 = h(ref.assetId, 3);
  const isLeak = ref.assetId === LEAK.assetId;
  const diameter = ref.kind === 'trunk' ? spec.diameters[1] : spec.diameters[0];
  const base: AssetDetails = {
    assetId: ref.assetId,
    utility: ref.utility,
    type: TYPE_NAMES[ref.utility][ref.kind],
    material: spec.material,
    diameter: `${diameter} mm`,
    installed: 1996 + Math.floor(r1 * 24),
    lastInspection: `${1 + Math.floor(r2 * 27)} ${MONTHS[Math.floor(r3 * 12)]} ${r3 > 0.6 ? 2025 : 2026}`,
    reading: READING[ref.utility].make(r2),
    readingLabel: READING[ref.utility].label,
    health: Math.round(80 + r3 * 18),
    failureProbability: Math.round(1 + r1 * 7),
    depthM: `${(-ref.depth * DEPTH_SCALE).toFixed(1)} m`,
    lengthM: `${Math.round(ref.length * 4)} m`,
    sector: ref.sector,
    critical: false,
  };
  if (isLeak) {
    const pd = live?.pressureDelta ?? -2.7;
    return {
      ...base,
      type: 'Primary Water Main',
      material: 'Ductile Iron',
      diameter: '900 mm',
      installed: 2014,
      lastInspection: '12 Aug 2026',
      reading: `${(4.36 * (1 + pd / 100)).toFixed(2)} bar (${pd.toFixed(1)}%)`,
      readingLabel: 'Current pressure',
      health: live?.health ?? 63,
      failureProbability: live?.failure ?? 93,
      critical: true,
    };
  }
  return base;
}
