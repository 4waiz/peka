import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { selectSector } from '../store/actions';
import {
  BLOCKS,
  CANAL,
  CREW_ROUTE,
  FACILITIES,
  LEAK,
  MAIN,
  ROUTES,
  SECTORS,
  UTILITIES,
  UTILITY_ORDER,
  type RiskLevel,
  type SectorId,
  type UtilityId,
} from '../simulation/infrastructureData';
import { riskLevel } from '../simulation/riskEngine';

const VB = { x: MAIN.x0 - 3, y: MAIN.z0 - 3, w: MAIN.x1 - MAIN.x0 + 6, h: MAIN.z1 - MAIN.z0 + 6 };
const RISK_FILL: Record<RiskLevel, string> = { high: '#ff4a3d', medium: '#ffc34a', low: '#2f9bff' };

function clipRect(r: { x0: number; x1: number; z0: number; z1: number }) {
  const x0 = Math.max(r.x0, VB.x);
  const x1 = Math.min(r.x1, VB.x + VB.w);
  const z0 = Math.max(r.z0, VB.y);
  const z1 = Math.min(r.z1, VB.y + VB.h);
  return x1 > x0 && z1 > z0 ? { x: x0, y: z0, w: x1 - x0, h: z1 - z0 } : null;
}

function routePath(u: UtilityId) {
  return ROUTES.filter((r) => r.utility === u && (r.kind !== 'trunk' || r.conduit === 0))
    .map((r) => {
      const [a, b] = r.points;
      const ax = Math.max(VB.x, Math.min(VB.x + VB.w, a[0]));
      const bx = Math.max(VB.x, Math.min(VB.x + VB.w, b[0]));
      const az = Math.min(MAIN.z1 + 1, a[2]);
      const bz = Math.min(MAIN.z1 + 1, b[2]);
      return `M${ax.toFixed(1)} ${az.toFixed(1)}L${bx.toFixed(1)} ${bz.toFixed(1)}`;
    })
    .join('');
}

export function RiskMap() {
  const network = useAppStore((s) => s.mapNetwork);
  const hovered = useAppStore((s) => s.hoveredSector);
  const selected = useAppStore((s) => s.selectedSector);
  const risk = useAppStore((s) => s.risk);
  const detected = useAppStore(selDetected);
  const localize = useAppStore((s) => s.demo.flags.localize);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const anomaly = useAppStore((s) => s.anomaly);
  const camera = useAppStore((s) => s.camera);
  const repair = useAppStore((s) => s.repair);

  const paths = useMemo(() => {
    const list = network === 'all' ? UTILITY_ORDER : [network];
    return list.map((u) => ({ u, d: routePath(u), color: UTILITIES[u].color }));
  }, [network]);

  const b12Risk: RiskLevel = resolved ? 'low' : detected || localize ? riskLevel(Math.max(risk, localize ? 80 : 0)) : riskLevel(Math.min(risk, 45));
  const sectorRisk = (id: SectorId): RiskLevel => (id === 'B-12' ? b12Risk : SECTORS.find((s) => s.id === id)!.baseRisk);
  const heatR = resolved ? 0 : 14 + Math.min(1, risk / 90) * 26;
  const alertOn = (detected || localize) && !resolved;

  // crew marker along the route
  let crew: [number, number] | null = null;
  if (repair.status !== 'idle' && repair.status !== 'resolved') {
    const pts = CREW_ROUTE;
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const total = lens.reduce((a, b) => a + b, 0);
    let d = repair.progress * total;
    crew = pts[pts.length - 1];
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const t = d / lens[i];
        crew = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
        break;
      }
      d -= lens[i];
    }
  }

  const camX = Math.max(VB.x + 4, Math.min(VB.x + VB.w - 4, camera.x));
  const camZ = Math.max(VB.y + 4, Math.min(VB.y + VB.h - 4, camera.z));
  const camAngle = (Math.atan2(-Math.cos(camera.az), -Math.sin(camera.az)) * 180) / Math.PI;

  return (
    <div className="panel risk-map">
      <div className="panel-head">
        <span className="panel-title">Location &amp; Risk Map</span>
        <label className="select">
          <select value={network} onChange={(e) => useAppStore.setState({ mapNetwork: e.target.value as UtilityId | 'all' })}>
            {UTILITY_ORDER.map((u) => (
              <option key={u} value={u}>
                {UTILITIES[u].full} Network
              </option>
            ))}
            <option value="all">All Networks</option>
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      <div className="map-wrap">
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" className="map-svg">
          <defs>
            <radialGradient id="heat">
              <stop offset="0%" stopColor="#ff3b2f" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#ff6a2a" stopOpacity="0.6" />
              <stop offset="70%" stopColor="#ffb340" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffb340" stopOpacity="0" />
            </radialGradient>
            <clipPath id="mapclip">
              <rect x={VB.x} y={VB.y} width={VB.w} height={MAIN.z1 - VB.y} />
            </clipPath>
          </defs>
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} className="map-road" />
          {CANAL.rects.map((r, i) => {
            const c = clipRect(r);
            return c ? <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} className="map-canal" /> : null;
          })}
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x0 + 0.6} y={b.z0 + 0.6} width={b.x1 - b.x0 - 1.2} height={b.z1 - b.z0 - 1.2} rx={1} className={`map-block kind-${b.kind}`} />
          ))}
          {alertOn && heatR > 0 && (
            <g clipPath="url(#mapclip)">
              <circle cx={LEAK.x} cy={LEAK.surface[2]} r={heatR * 1.25} fill="url(#heat)" className="map-heat" />
            </g>
          )}
          {paths.map((p) => (
            <path key={p.u} d={p.d} stroke={network === 'all' ? p.color : '#3fd8ff'} className="map-net" />
          ))}
          {SECTORS.map((s) => {
            const r = sectorRisk(s.id);
            const isHover = hovered === s.id;
            const isSel = selected === s.id;
            return (
              <g
                key={s.id}
                className={`map-sector ${isHover ? 'is-hover' : ''} ${isSel ? 'is-selected' : ''}`}
                onMouseEnter={() => useAppStore.setState({ hoveredSector: s.id })}
                onMouseLeave={() => useAppStore.setState({ hoveredSector: null })}
                onClick={() => selectSector(s.id)}
              >
                <rect
                  x={s.rect.x0 + 0.8}
                  y={s.rect.z0 + 0.8}
                  width={s.rect.x1 - s.rect.x0 - 1.6}
                  height={s.rect.z1 - s.rect.z0 - 1.6}
                  fill={RISK_FILL[r]}
                  fillOpacity={isHover || isSel ? 0.16 : 0.06}
                  stroke={RISK_FILL[r]}
                  className="map-sector-rect"
                />
              </g>
            );
          })}
          {FACILITIES.map((f) => (
            <g key={f.id} transform={`translate(${f.position[0]} ${f.position[2]})`} className={`map-fac fac-${f.id}`}>
              <circle r="4.2" />
              {f.id === 'hospital' ? <path d="M-0.8 -2.4h1.6v1.6h1.6v1.6h-1.6v1.6h-1.6v-1.6h-1.6v-1.6h1.6z" /> : <path d="M0 -2.4l3 1.5-3 1.5-3-1.5z M-1.8 0.4v1.4c1.2 0.9 2.4 0.9 3.6 0v-1.4" />}
            </g>
          ))}
          {crew && (
            <g transform={`translate(${crew[0]} ${crew[1]})`} className="map-crew">
              <circle r="5" className="ring" />
              <circle r="2.6" />
            </g>
          )}
          {alertOn && (
            <g transform={`translate(${LEAK.x} ${LEAK.surface[2] - 3})`} className="map-alert">
              <circle r="9" className="pulse" />
              <circle r="9" className="pulse delay" />
              <path d="M0 -6.5 L6.2 4.5 H-6.2 Z" className="tri" />
              <rect x="-0.6" y="-2.6" width="1.2" height="3.8" className="ex" />
              <circle cy="2.7" r="0.75" className="ex" />
            </g>
          )}
          <g transform={`translate(${camX} ${camZ}) rotate(${camAngle})`} className="map-cam">
            <path d="M0 0 L18 -9 A20 20 0 0 1 18 9 Z" />
            <circle r="1.8" />
          </g>
          {SECTORS.map((s) => {
            const r = sectorRisk(s.id);
            const cx = (s.rect.x0 + s.rect.x1) / 2 + (s.id === 'B-12' ? 6 : 0);
            const cz = (s.rect.z0 + s.rect.z1) / 2 + (s.id === 'B-12' ? -6 : 0);
            return (
              <g key={`l-${s.id}`} transform={`translate(${cx} ${cz})`} className={`map-label risk-${r}`} onClick={() => selectSector(s.id)}>
                <rect x={-13} y={-6.5} width={26} height={13} rx={2.5} />
                <text y={3.2}>{s.id}</text>
              </g>
            );
          })}
        </svg>
        <div className="map-legend">
          <span>
            <i className="lg-dot high" /> High Risk
          </span>
          <span>
            <i className="lg-dot medium" /> Medium Risk
          </span>
          <span>
            <i className="lg-dot low" /> Low Risk
          </span>
          <span>
            <i className="lg-line" /> Utility Network
          </span>
        </div>
        {anomaly > 0.03 && !resolved && <div className="map-hint">Click a sector to focus the twin</div>}
      </div>
    </div>
  );
}
