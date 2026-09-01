// DepthWizard — Depth Estimation Step

import { useState } from 'react';
import { Cpu, AlertTriangle, ChevronRight, Info, Zap } from 'lucide-react';
import { runDepthEstimation } from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

export default function DepthEstimationPage() {
  const { sessionId, depthData, setDepthData, uploadData, setCurrentStep } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runEstimation() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runDepthEstimation(sessionId);
      setDepthData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Depth estimation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 02</div>
        <h2>Depth Estimation</h2>
        <p>Monocular depth inference via Depth Anything v2</p>
      </div>

      {/* Model info */}
      <div className={styles.infoPanel}>
        <Cpu size={16} />
        <div>
          <strong>Model:</strong> Depth Anything v2 Small (ONNX, CPU) —{' '}
          <span className="text-muted">downloads ~99 MB on first run</span>
        </div>
        <div className="demo-badge">RELATIVE</div>
      </div>

      {!depthData ? (
        <div className={styles.actionArea}>
          <div className={styles.card} style={{ maxWidth: 480 }}>
            <div className={styles.actionContent}>
              <div className={styles.bigIcon}><Cpu size={48} /></div>
              <h3>Ready to estimate depth</h3>
              <p>
                The model will analyze the uploaded image and generate a{' '}
                <strong>relative depth map</strong> — pixel intensities correspond to
                estimated relative depth, not absolute metric elevation.
              </p>
              <div className={styles.infoBox}>
                <Info size={14} />
                <span>
                  Inference time: ~5–30 seconds on CPU depending on image resolution.
                  Large images are automatically resized to 518px for inference.
                </span>
              </div>
              <button
                className={styles.primaryBtn}
                onClick={runEstimation}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    Running inference…
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Run Depth Estimation
                  </>
                )}
              </button>
              {loading && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.grid2}>
          {/* Original image */}
          <div className={styles.card}>
            <div className={styles.cardHeader}><span>Original Image</span></div>
            <div className={styles.previewWrap}>
              <img
                src={`data:image/jpeg;base64,${uploadData?.preview_b64}`}
                alt="Original"
                className={styles.preview}
              />
            </div>
          </div>

          {/* Depth map */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Relative Depth Map</span>
              {depthData.is_real_ai ? (
                <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}>
                  ONNX Inference
                </span>
              ) : (
                <span className="demo-badge">SYNTHETIC DEMO</span>
              )}
            </div>
            <div className={styles.previewWrap}>
              <img
                src={`data:image/png;base64,${depthData.depth_png_b64}`}
                alt="Depth map"
                className={styles.preview}
              />
            </div>
            <div className={styles.colormapLegend}>
              <span className="mono" style={{ color: 'var(--accent-primary)' }}>Far</span>
              <div className={styles.colormapBar} />
              <span className="mono" style={{ color: '#ef4444' }}>Near</span>
            </div>
          </div>

          {/* Model info */}
          <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.cardHeader}>
              <span>Inference Results</span>
              {depthData.is_real_ai ? (
                <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}>
                  AI Model Active
                </span>
              ) : (
                <span className="demo-badge">DEMO FALLBACK</span>
              )}
            </div>
            <table className={styles.metaTable}>
              <tbody>
                <tr>
                  <td className={styles.metaLabel}>Model</td>
                  <td className={`${styles.metaValue} ${styles.mono}`}>{depthData.model}</td>
                </tr>
                <tr>
                  <td className={styles.metaLabel}>Pipeline</td>
                  <td className={styles.metaValue}>
                    {depthData.is_real_ai ? (
                      <span style={{ color: 'var(--color-success)' }}>
                        ✓ Monocular Depth Estimation (ONNX CPU Runtime)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-demo)' }}>
                        ⚠ Synthetic demonstration fallback (No scientific inference)
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className={styles.metaLabel}>Depth Type</td>
                  <td className={styles.metaValue}>
                    <span style={{ color: 'var(--color-warning)' }}>
                      Relative (unitless) — not metric elevation
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className={styles.metaLabel}>Output Size</td>
                  <td className={`${styles.metaValue} ${styles.mono}`}>{depthData.orig_width} × {depthData.orig_height} px</td>
                </tr>
              </tbody>
            </table>
            {depthData.warning && (
              <div className={styles.warnBox} style={{ marginTop: 12 }}>
                <AlertTriangle size={14} />
                <span>{depthData.warning}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {depthData && (
        <div className={styles.footer}>
          <button className={styles.secondaryBtn} onClick={() => { setDepthData(null!); }}>
            Re-run
          </button>
          <button className={styles.nextBtn} onClick={() => setCurrentStep('dsm')}>
            Proceed to DSM Generation
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
