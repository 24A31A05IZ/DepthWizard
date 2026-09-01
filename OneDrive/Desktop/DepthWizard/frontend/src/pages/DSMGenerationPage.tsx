// DepthWizard — DSM Generation Step

import { useState } from 'react';
import { Layers, ChevronRight, AlertTriangle, Download } from 'lucide-react';
import { generateDSM } from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

export default function DSMGenerationPage() {
  const { sessionId, dsmData, setDsmData, calibrationData, setCurrentStep } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSlope, setShowSlope] = useState(false);

  async function generate() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateDSM(sessionId);
      setDsmData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'DSM generation failed.');
    } finally {
      setLoading(false);
    }
  }

  function downloadPNG() {
    if (!dsmData) return;
    const b64 = showSlope ? dsmData.slope_png_b64 : dsmData.dsm_png_b64;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${b64}`;
    link.download = `depthwizard_${showSlope ? 'slope' : 'dsm'}.png`;
    link.click();
  }

  const isMetric = calibrationData?.success ?? false;
  const unit = isMetric ? 'm' : 'rel.';
  const s = dsmData?.stats;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 03</div>
        <h2>DSM Generation</h2>
        <p>Digital Surface Model — {isMetric ? 'metric elevation (calibrated)' : 'relative elevation (unitless)'}</p>
      </div>

      {!isMetric && (
        <div className={styles.infoPanel} style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
          <span>
            No calibration applied — DSM values are <strong>relative (unitless)</strong> and do not represent
            absolute metric elevation. Use the Scale Calibration step to obtain metric estimates.
          </span>
        </div>
      )}

      {!dsmData ? (
        <div className={styles.actionArea}>
          <div className={styles.card} style={{ maxWidth: 440 }}>
            <div className={styles.actionContent}>
              <div className={styles.bigIcon}><Layers size={48} /></div>
              <h3>Generate Digital Surface Model</h3>
              <p>
                Converts the relative depth map into an elevation grid with colorized
                visualization and slope analysis.
              </p>
              <button className={styles.primaryBtn} onClick={generate} disabled={loading}>
                {loading ? <><span className={styles.spinner} /> Generating DSM…</> : <><Layers size={16} /> Generate DSM</>}
              </button>
              {loading && <div className={styles.progressBar}><div className={styles.progressFill} /></div>}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Toggle and download */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className={`${styles.controlBtn} ${!showSlope ? styles.active : ''}`} onClick={() => setShowSlope(false)}>
              🗺️ DSM / Elevation
            </button>
            <button className={`${styles.controlBtn} ${showSlope ? styles.active : ''}`} onClick={() => setShowSlope(true)}>
              📐 Slope Map
            </button>
            <div style={{ flex: 1 }} />
            <button className={styles.secondaryBtn} onClick={downloadPNG}>
              <Download size={14} /> Download {showSlope ? 'Slope' : 'DSM'} PNG
            </button>
          </div>

          <div className={styles.grid2}>
            {/* Visualization */}
            <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
              <div className={styles.cardHeader}>
                <span>{showSlope ? 'Slope Map (°)' : 'Digital Surface Model'}</span>
                <div className="demo-badge">{isMetric ? 'CALIBRATED' : 'RELATIVE'}</div>
              </div>
              <div className={styles.previewWrap}>
                <img
                  src={`data:image/png;base64,${showSlope ? dsmData.slope_png_b64 : dsmData.dsm_png_b64}`}
                  alt={showSlope ? 'Slope map' : 'DSM'}
                  className={styles.preview}
                  style={{ maxHeight: 420 }}
                />
              </div>
              <div className={styles.colormapLegend}>
                <span className="mono" style={{ color: '#440154' }}>
                  {showSlope ? '0°' : `Low ${unit}`}
                </span>
                <div className={styles.colormapBar} style={{
                  background: showSlope
                    ? 'linear-gradient(90deg, #000004, #3b0f70, #8c2981, #de4968, #fe9f6d, #fcfdbf)'
                    : 'linear-gradient(90deg, #440154, #3e4a89, #26828e, #35b779, #b5de2b, #fde725)'
                }} />
                <span className="mono" style={{ color: showSlope ? '#fcfdbf' : '#fde725' }}>
                  {showSlope ? `${s?.max_slope_deg.toFixed(1)}°` : `High ${unit}`}
                </span>
              </div>
            </div>

            {/* Stats */}
            {s && (
              <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.cardHeader}><span>Elevation Statistics</span></div>
                <div className={styles.statsGrid}>
                  <StatCard label="Min Elevation" value={s.min_elevation.toFixed(2)} unit={unit} />
                  <StatCard label="Max Elevation" value={s.max_elevation.toFixed(2)} unit={unit} />
                  <StatCard label="Mean Elevation" value={s.mean_elevation.toFixed(2)} unit={unit} />
                  <StatCard label="Std Dev" value={s.std_elevation.toFixed(2)} unit={unit} />
                  <StatCard label="Min Slope" value={s.min_slope_deg.toFixed(1)} unit="°" />
                  <StatCard label="Max Slope" value={s.max_slope_deg.toFixed(1)} unit="°" />
                  <StatCard label="Mean Slope" value={s.mean_slope_deg.toFixed(1)} unit="°" />
                  <StatCard label="Grid Size" value={`${s.width}×${s.height}`} unit="px" />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{error}</span></div>}

      {dsmData && (
        <div className={styles.footer}>
          <button className={styles.secondaryBtn} onClick={() => setDsmData(null!)}>Re-generate</button>
          <button className={styles.nextBtn} onClick={() => setCurrentStep('calibration')}>
            Proceed to Scale Calibration<ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statUnit}>{unit}</div>
    </div>
  );
}
