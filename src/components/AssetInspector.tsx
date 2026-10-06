import { Crosshair, Route, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { focusAsset, followAsset, selectAsset } from '../store/actions';
import { getAssetDetails } from '../simulation/assets';
import { LEAK, UTILITIES } from '../simulation/infrastructureData';

const RELATED = [
  { id: 'FS-3381', label: 'Flow sensor', detail: 'Last reading 2.7% below normal' },
  { id: 'WV-776', label: 'Isolation valve', detail: 'Downstream · Open' },
  { id: 'WV-781', label: 'Isolation valve', detail: 'Upstream · Open' },
];

export function AssetInspector() {
  const asset = useAppStore((s) => s.selectedAsset);
  const pressure = useAppStore((s) => s.readings.pressure);
  const confidence = useAppStore((s) => s.confidence);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const repairing = useAppStore((s) => s.repair.status === 'repairing');
  if (!asset) return null;
  const isLeak = asset.assetId === LEAK.assetId;
  const d = getAssetDetails(asset, {
    pressureDelta: pressure,
    health: resolved ? 98 : 63,
    failure: resolved ? 2 : Math.max(confidence, isLeak ? 41 : 0) || 93,
  });
  const spec = UTILITIES[d.utility];
  const fields: [string, string][] = [
    ['Asset ID', d.assetId],
    ['Utility type', spec.full],
    ['Type', d.type],
    ['Material', d.material],
    ['Diameter', d.diameter],
    ['Installed', String(d.installed)],
    ['Last inspection', d.lastInspection],
    ['Depth / length', `${d.depthM} · ${d.lengthM}`],
    [d.readingLabel, d.reading],
  ];
  return (
    <div className="panel inspector" style={{ ['--c' as string]: spec.color }}>
      <div className="panel-head">
        <span className="panel-title">
          <i className="ins-swatch" /> Asset Inspection
        </span>
        <button className="icon-btn" onClick={() => selectAsset(null)} aria-label="Close inspector">
          <X size={14} />
        </button>
      </div>
      {d.critical && !resolved && <div className="ins-alert">{repairing ? 'Repair in progress' : 'Active leak signature — breach on this segment'}</div>}
      <dl className="ins-grid">
        {fields.map(([k, v]) => (
          <div key={k} className="ins-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="ins-meters">
        <div>
          <div className="ins-m-top">
            <span>Health score</span>
            <b className={d.health < 70 ? 'bad' : 'good'}>{d.health}%</b>
          </div>
          <div className="meter">
            <div className={d.health < 70 ? 'bad' : 'good'} style={{ width: `${d.health}%` }} />
          </div>
        </div>
        <div>
          <div className="ins-m-top">
            <span>Failure probability</span>
            <b className={d.failureProbability > 50 ? 'bad' : 'good'}>{d.failureProbability}%</b>
          </div>
          <div className="meter">
            <div className={d.failureProbability > 50 ? 'bad' : 'good'} style={{ width: `${d.failureProbability}%` }} />
          </div>
        </div>
      </div>
      {isLeak && (
        <div className="ins-related">
          <div className="ins-rel-title">Related assets</div>
          {RELATED.map((r) => (
            <div key={r.id} className="ins-rel">
              <b>{r.id}</b>
              <span>
                {r.label} · {r.detail}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="ins-actions">
        <button className="primary-btn" onClick={() => focusAsset(d.assetId)}>
          <Crosshair size={14} /> Focus Asset
        </button>
        <button className="ghost-btn" onClick={() => followAsset(d.assetId)} title="Camera follows this pipe underground">
          <Route size={14} /> Follow Pipe
        </button>
      </div>
    </div>
  );
}
