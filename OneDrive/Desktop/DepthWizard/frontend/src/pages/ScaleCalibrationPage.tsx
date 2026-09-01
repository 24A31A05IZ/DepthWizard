// DepthWizard — Scale Calibration Step
// Converts relative depth representations into estimated metric elevation using SRTM DEM or GCPs.

import { useState } from 'react';
import { Target, Plus, X, ChevronRight, Info, CheckCircle, AlertTriangle, Layers } from 'lucide-react';
import { calibrateGCP, calibrateSRTM, generateDSM, type GCP, type CalibrationResult } from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

type Method = 'none' | 'srtm' | 'gcp';

export default function ScaleCalibrationPage() {
  const { sessionId, calibrationData, setCalibrationData, setDsmData, setCurrentStep, uploadData } = useAppState();
  const [method, setMethod] = useState<Method>(uploadData?.analysis.is_georeferenced ? 'srtm' : 'none');
  const [gcps, setGcps] = useState<GCP[]>([
    { x: 50, y: 50, elevation_m: 350.0 },
    { x: 200, y: 200, elevation_m: 520.0 },
  ]);
  const [srtmElev, setSrtmElev] = useState('500');
  const [srtmRange, setSrtmRange] = useState('250');
  const [loading, setLoading] = useState(false);
  const [calResult, setCalResult] = useState<CalibrationResult | null>(calibrationData);

  const isGeo = uploadData?.analysis.is_georeferenced;
  const geoMeta = uploadData?.analysis.geo_metadata;

  async function runCalibration() {
    if (!sessionId) return;
    setLoading(true);
    try {
      let result: CalibrationResult;
      if (method === 'gcp') {
        result = await calibrateGCP(sessionId, gcps);
      } else if (method === 'srtm') {
        result = await calibrateSRTM(
          sessionId,
          parseFloat(srtmElev) || undefined,
          parseFloat(srtmRange) || undefined,
        );
      } else {
        return;
      }

      setCalResult(result);
      setCalibrationData(result);

      if (result.success) {
        // Automatically re-generate DSM with newly fitted metric parameters
        const updatedDsm = await generateDSM(sessionId);
        setDsmData(updatedDsm);
      }
    } catch (e: unknown) {
      setCalResult({
        success: false,
        method: method === 'gcp' ? 'GCP' : 'SRTM',
        scale_factor: 1.0,
        offset: 0.0,
        error: e instanceof Error ? e.message : 'Calibration failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  function addGCP() {
    const defaultX = Math.round((uploadData?.analysis.width || 500) / 2);
    const defaultY = Math.round((uploadData?.analysis.height || 500) / 2);
    setGcps(prev => [...prev, { x: defaultX, y: defaultY, elevation_m: 400.0 }]);
  }

  function updateGCP(i: number, field: keyof GCP, val: string) {
    setGcps(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: parseFloat(val) || 0 } : g));
  }

  function removeGCP(i: number) {
    setGcps(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 04 · Scale Anchoring</div>
        <h2>Scale Calibration</h2>
        <p>Convert relative monocular depth into estimated metric elevation using reference data</p>
      </div>

      <div className={styles.infoPanel}>
        <Info size={16} />
        <span>
          Monocular models output unitless relative depth. Calibration anchors the depth range to real elevations
          using SRTM 30m Global DEM or Ground Control Points (GCPs). Output is labeled as{' '}
          <strong>Estimated Metric (m)</strong>.
        </span>
      </div>

      {/* Method selector */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Target size={16} />
          <span>Select Calibration Pathway</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            {
              id: 'srtm' as Method,
              label: 'SRTM 30m Global DEM',
              desc: isGeo ? 'Auto-queries DEM grid over GeoTIFF coordinates' : 'Scales using regional DEM bounds',
              tag: isGeo ? 'RECOMMENDED' : 'REGIONAL',
            },
            {
              id: 'gcp' as Method,
              label: 'Ground Control Points (GCP)',
              desc: 'Fits scale & shift from known pixel/elevation pairs',
              tag: 'SURVEY ANCHOR',
            },
            {
              id: 'none' as Method,
              label: 'Skip (Relative Only)',
              desc: 'Keep uncalibrated unitless DSM representation',
              tag: 'rDSM',
            },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => { setMethod(opt.id); setCalResult(null); }}
              style={{
                padding: '16px',
                background: method === opt.id ? 'rgba(46,134,222,0.15)' : 'var(--bg-elevated)',
                border: `1px solid ${method === opt.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'var(--transition)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: method === opt.id ? 'var(--text-bright)' : 'var(--text-secondary)' }}>
                  {opt.label}
                </span>
                <span className={styles.badge}>{opt.tag}</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SRTM Calibration Details */}
      {method === 'srtm' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Layers size={16} />
            <span>SRTM 30m DEM Alignment Configuration</span>
          </div>

          {isGeo && geoMeta?.bounds_wgs84 ? (
            <div className={styles.infoBox}>
              <CheckCircle size={15} style={{ color: 'var(--color-success)' }} />
              <div>
                <strong>Geographic Scene Detected:</strong> Center at{' '}
                <code className="mono">{geoMeta.bounds_wgs84.center_lat.toFixed(4)}° N, {geoMeta.bounds_wgs84.center_lon.toFixed(4)}° E</code>.
                <br />
                The system will automatically query the 30m SRTM DEM spatial grid across the bounding box and perform
                least-squares alignment against relative depth.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.warnBox}>
                <AlertTriangle size={15} />
                <span>
                  No GeoTIFF spatial metadata detected. Enter regional reference elevation parameters below to scale the scene.
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Regional Mean Elevation (m)</label>
                  <input className={styles.input} type="number" value={srtmElev} onChange={e => setSrtmElev(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Expected Elevation Range (m)</label>
                  <input className={styles.input} type="number" value={srtmRange} onChange={e => setSrtmRange(e.target.value)} placeholder="e.g. 250" />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 4 }}>
            <button className={styles.primaryBtn} onClick={runCalibration} disabled={loading}>
              {loading ? <><span className={styles.spinner} /> Querying SRTM &amp; Calibrating…</> : <><Target size={16} /> Run SRTM DEM Calibration</>}
            </button>
          </div>
        </div>
      )}

      {/* GCP Form */}
      {method === 'gcp' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Target size={16} />
            <span>Ground Control Points Input Table</span>
            <span className="demo-badge">MIN 2 POINTS REQUIRED</span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Enter pixel coordinates $(X, Y)$ within the image $(0 \le X &lt; {uploadData?.analysis.width || 1024}, 0 \le Y &lt; {uploadData?.analysis.height || 1024})$
            and known ground elevation in meters.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className={styles.gcpRow} style={{ paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>PIXEL X</div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>PIXEL Y</div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>KNOWN ELEVATION (m)</div>
              <div />
            </div>
            {gcps.map((gcp, i) => (
              <div key={i} className={styles.gcpRow}>
                <input className={styles.input} type="number" value={gcp.x} onChange={e => updateGCP(i, 'x', e.target.value)} placeholder="X px" min={0} />
                <input className={styles.input} type="number" value={gcp.y} onChange={e => updateGCP(i, 'y', e.target.value)} placeholder="Y px" min={0} />
                <input className={styles.input} type="number" value={gcp.elevation_m} onChange={e => updateGCP(i, 'elevation_m', e.target.value)} placeholder="meters" step="0.1" />
                <button className={styles.removeBtn} onClick={() => removeGCP(i)} disabled={gcps.length <= 2} title="Remove point">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addGCP}>
              <Plus size={14} /> Add GCP Point
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <button className={styles.primaryBtn} onClick={runCalibration} disabled={loading || gcps.length < 2}>
              {loading ? <><span className={styles.spinner} /> Computing Least-Squares Fit…</> : <><Target size={16} /> Fit GCP Calibration</>}
            </button>
          </div>
        </div>
      )}

      {/* Calibration Results Panel */}
      {calResult && calResult.success && (
        <div className={styles.card} style={{ borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.04)' }}>
          <div className={styles.cardHeader}>
            <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
            <span>Calibration Applied Successfully</span>
            <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}>
              ESTIMATED METRIC (m)
            </span>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Reference Source</div>
              <div className={styles.statValue} style={{ fontSize: '0.85rem' }}>{calResult.method}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Fitted Scale Factor (a)</div>
              <div className={styles.statValue}>{calResult.scale_factor.toFixed(2)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Elevation Offset (b)</div>
              <div className={styles.statValue}>{calResult.offset.toFixed(1)} <span className={styles.statUnit}>m</span></div>
            </div>
            {calResult.calibration_rmse_m !== null && calResult.calibration_rmse_m !== undefined && (
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Fit Residual RMSE</div>
                <div className={styles.statValue}>±{calResult.calibration_rmse_m.toFixed(2)} <span className={styles.statUnit}>m</span></div>
              </div>
            )}
          </div>

          {/* GCP Residual Breakdown */}
          {calResult.gcp_residuals && calResult.gcp_residuals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Per-Point Residual Breakdown:
              </div>
              <table className={styles.metaTable}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                    <th style={{ padding: '6px 0', textAlign: 'left' }}>Point (X, Y)</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Known Elev (m)</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Fitted Elev (m)</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Residual (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {calResult.gcp_residuals.map((r, idx) => (
                    <tr key={idx}>
                      <td className={styles.metaValue} style={{ padding: '6px 0' }}>({r.x}, {r.y})</td>
                      <td className={styles.metaValue} style={{ padding: '6px 0', textAlign: 'right' }}>{r.known_elevation_m.toFixed(1)} m</td>
                      <td className={styles.metaValue} style={{ padding: '6px 0', textAlign: 'right' }}>{r.estimated_elevation_m.toFixed(1)} m</td>
                      <td className={styles.metaValue} style={{ padding: '6px 0', textAlign: 'right', color: Math.abs(r.residual_m) < 5 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        {r.residual_m > 0 ? `+${r.residual_m.toFixed(2)}` : r.residual_m.toFixed(2)} m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.infoBox} style={{ marginTop: 6 }}>
            <span>{calResult.disclaimer}</span>
          </div>
        </div>
      )}

      {calResult && !calResult.success && calResult.error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={16} />
          <span>{calResult.error}</span>
        </div>
      )}

      <div className={styles.footer}>
        <button className={styles.nextBtn} onClick={() => setCurrentStep('terrain')}>
          {method === 'none' || !calResult?.success ? 'Proceed to 3D Terrain (Relative Mode)' : 'Open 3D Metric Terrain Viewer'}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
