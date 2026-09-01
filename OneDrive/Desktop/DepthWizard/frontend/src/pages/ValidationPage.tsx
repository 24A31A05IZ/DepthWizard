// DepthWizard — Quantitative Validation & GAMUS Benchmark Step

import { useState, useEffect, useRef } from 'react';
import { BarChart2, Upload, AlertTriangle, RotateCcw, Satellite, Play, CheckCircle } from 'lucide-react';
import {
  validateDSM,
  fetchGamusSamples,
  runGamusBenchmark,
  type GAMUSSample,
  type GAMUSBenchmarkResult,
} from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

export default function ValidationPage() {
  const { sessionId, validationData, setValidationData, setCurrentStep } = useAppState();
  const [loadingUserVal, setLoadingUserVal] = useState(false);
  const [errorUserVal, setErrorUserVal] = useState<string | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // GAMUS benchmark state
  const [gamusSamples, setGamusSamples] = useState<GAMUSSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<string>('DC_03_26');
  const [gamusLoading, setGamusLoading] = useState(false);
  const [gamusResult, setGamusResult] = useState<GAMUSBenchmarkResult | null>(null);
  const [gamusError, setGamusError] = useState<string | null>(null);

  useEffect(() => {
    fetchGamusSamples()
      .then(samples => setGamusSamples(samples))
      .catch(() => {
        setGamusSamples([
          { id: 'DC_03_26', name: 'Washington DC Urban (Tile 03_26)', split: 'test' },
          { id: 'DC_05_28', name: 'Washington DC Mixed Urban (Tile 05_28)', split: 'test' },
          { id: 'DC_07_21', name: 'Washington DC Suburban (Tile 07_21)', split: 'test' },
        ]);
      });
  }, []);

  async function runUserValidation() {
    if (!sessionId) return;
    setLoadingUserVal(true);
    setErrorUserVal(null);
    try {
      const result = await validateDSM(sessionId, refFile || undefined);
      setValidationData(result);
    } catch (e: unknown) {
      setErrorUserVal(e instanceof Error ? e.message : 'Validation failed.');
    } finally {
      setLoadingUserVal(false);
    }
  }

  async function executeGamusBenchmark() {
    setGamusLoading(true);
    setGamusError(null);
    try {
      const res = await runGamusBenchmark(selectedSample);
      if (res.success) {
        setGamusResult(res);
      } else {
        setGamusError(res.error || 'Benchmark execution failed.');
      }
    } catch (e: unknown) {
      setGamusError(e instanceof Error ? e.message : 'Failed to connect to benchmark runner.');
    } finally {
      setGamusLoading(false);
    }
  }

  const v = validationData;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 07 · Accuracy Assessment</div>
        <h2>Quantitative Validation &amp; Benchmarking</h2>
        <p>Validate estimated elevation against ground-truth datasets with zero fabricated metrics</p>
      </div>

      {/* ── SECTION 1: User-Uploaded Ground Truth DSM ─────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Upload size={16} />
          <span>Section 1: User Reference Dataset Evaluation</span>
          {refFile ? (
            <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}>
              FILE ATTACHED
            </span>
          ) : (
            <span className="demo-badge">NO REFERENCE ATTACHED</span>
          )}
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Upload a known reference Digital Surface Model (as a 1-channel Grayscale PNG or NumPy <code className="mono">.npy</code> array)
          to compute real-time Root Mean Square Error (RMSE), Mean Absolute Error (MAE), and Pearson correlation ($r$).
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.npy"
            onChange={e => setRefFile(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
          <button className={styles.secondaryBtn} onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> {refFile ? refFile.name : 'Select Reference DSM File (PNG / NPY)'}
          </button>
          {refFile && (
            <button className={styles.secondaryBtn} onClick={() => setRefFile(null)}>
              <RotateCcw size={14} /> Clear File
            </button>
          )}
          <button className={styles.primaryBtn} onClick={runUserValidation} disabled={loadingUserVal}>
            {loadingUserVal ? <><span className={styles.spinner} /> Evaluating…</> : <><BarChart2 size={15} /> Compute User Validation</>}
          </button>
        </div>

        {errorUserVal && (
          <div className={styles.errorBox}>
            <AlertTriangle size={15} />
            <span>{errorUserVal}</span>
          </div>
        )}

        {v && (
          <div style={{ marginTop: 12 }}>
            {v.is_demo ? (
              <div>
                <div className={styles.infoBox} style={{ marginBottom: 12 }}>
                  <InfoIcon size={14} />
                  <span>{v.demo_message}</span>
                </div>
                <div className={styles.metricsRow}>
                  <UnavailableMetric name="RMSE" desc="Root Mean Square Error" />
                  <UnavailableMetric name="MAE" desc="Mean Absolute Error" />
                  <UnavailableMetric name="Pearson r" desc="Spatial Correlation" />
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.metricsRow}>
                  <MetricCard
                    name="RMSE"
                    value={v.rmse !== null ? `${v.rmse.toFixed(3)} m` : '—'}
                    desc="Root Mean Square Error"
                    color={v.rmse && v.rmse < 5.0 ? 'var(--color-success)' : 'var(--color-warning)'}
                  />
                  <MetricCard
                    name="MAE"
                    value={v.mae !== null ? `${v.mae.toFixed(3)} m` : '—'}
                    desc="Mean Absolute Error"
                    color={v.mae && v.mae < 3.0 ? 'var(--color-success)' : 'var(--color-warning)'}
                  />
                  <MetricCard
                    name="Pearson r"
                    value={v.correlation !== null ? v.correlation.toFixed(4) : '—'}
                    desc="Linear Correlation"
                    color={v.correlation && v.correlation > 0.6 ? 'var(--color-success)' : 'var(--color-warning)'}
                  />
                  <MetricCard
                    name="Valid Pixels"
                    value={v.n_pixels ? v.n_pixels.toLocaleString() : '—'}
                    desc="Overlapping Area"
                    color="var(--accent-cyan)"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: GAMUS Remote-Sensing Benchmark ───────────────────── */}
      <div className={styles.card} style={{ borderColor: 'rgba(46,134,222,0.4)' }}>
        <div className={styles.cardHeader}>
          <Satellite size={16} />
          <span>Section 2: earthflow/GAMUS Remote-Sensing Benchmark</span>
          <span className={styles.badge} style={{ background: 'rgba(46,134,222,0.15)', borderColor: 'rgba(46,134,222,0.4)', color: 'var(--accent-cyan)' }}>
            AIRBORNE LiDAR AGL GROUND TRUTH
          </span>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Evaluates the <strong>Depth Anything V2 Small ONNX</strong> pipeline on high-resolution overhead optical imagery from the
          open-access <strong>earthflow/GAMUS</strong> remote-sensing dataset against true airborne LiDAR Above-Ground-Level (AGL) height maps.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Benchmark Scene:</span>
            <select
              className={styles.input}
              style={{ width: 'auto', minWidth: 260, padding: '7px 12px' }}
              value={selectedSample}
              onChange={e => setSelectedSample(e.target.value)}
            >
              {gamusSamples.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <button className={styles.primaryBtn} onClick={executeGamusBenchmark} disabled={gamusLoading}>
            {gamusLoading ? (
              <><span className={styles.spinner} /> Running Real GAMUS Benchmark…</>
            ) : (
              <><Play size={15} /> Run GAMUS Evaluation</>
            )}
          </button>
        </div>

        {gamusError && (
          <div className={styles.errorBox} style={{ marginTop: 12 }}>
            <AlertTriangle size={15} />
            <span>{gamusError}</span>
          </div>
        )}

        {/* GAMUS Results Display */}
        {gamusResult && gamusResult.success && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-success)', fontSize: '0.82rem', fontWeight: 600 }}>
              <CheckCircle size={15} />
              <span>Benchmark Completed: Evaluated {gamusResult.n_pixels_evaluated?.toLocaleString()} pixels against LiDAR AGL Ground Truth</span>
            </div>

            {/* Metrics Grid */}
            <div className={styles.metricsRow}>
              <MetricCard
                name="RMSE"
                value={`${gamusResult.rmse_m?.toFixed(2)} m`}
                desc="Root Mean Square Error"
                color="var(--accent-cyan)"
              />
              <MetricCard
                name="MAE"
                value={`${gamusResult.mae_m?.toFixed(2)} m`}
                desc="Mean Absolute Error"
                color="var(--accent-cyan)"
              />
              <MetricCard
                name="Pearson r"
                value={gamusResult.pearson_r?.toFixed(4) || '—'}
                desc="Height Correlation"
                color="var(--color-success)"
              />
              <MetricCard
                name="δ < 1.25"
                value={`${gamusResult.delta_1_25_pct?.toFixed(1)}%`}
                desc="Threshold Accuracy"
                color="var(--text-primary)"
              />
              <MetricCard
                name="GT Height Range"
                value={`${gamusResult.gt_min_height_m?.toFixed(0)} to ${gamusResult.gt_max_height_m?.toFixed(0)} m`}
                desc={`Mean: ${gamusResult.gt_mean_height_m?.toFixed(1)} m`}
                color="var(--text-secondary)"
              />
            </div>

            {/* Visual Tile Triplet */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {gamusResult.rgb_b64 && (
                <div className={styles.card} style={{ padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 6 }}>
                    1. GAMUS OPTICAL RGB
                  </div>
                  <img
                    src={`data:image/jpeg;base64,${gamusResult.rgb_b64}`}
                    alt="GAMUS RGB"
                    style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              )}
              {gamusResult.pred_depth_b64 && (
                <div className={styles.card} style={{ padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 6 }}>
                    2. DEPTH ANYTHING V2 PREDICTION
                  </div>
                  <img
                    src={`data:image/jpeg;base64,${gamusResult.pred_depth_b64}`}
                    alt="Depth Prediction"
                    style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              )}
              {gamusResult.gt_height_b64 && (
                <div className={styles.card} style={{ padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 6 }}>
                    3. LiDAR AGL GROUND TRUTH
                  </div>
                  <img
                    src={`data:image/jpeg;base64,${gamusResult.gt_height_b64}`}
                    alt="LiDAR AGL"
                    style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              )}
            </div>

            <div className={styles.infoBox}>
              <span>{gamusResult.disclaimer}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.primaryBtn} onClick={() => setCurrentStep('landing')}>
          ↩ Start New Analysis
        </button>
      </div>
    </div>
  );
}

function MetricCard({ name, value, desc, color }: { name: string; value: string; desc: string; color: string }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricName}>{name}</div>
      <div className={styles.metricValue} style={{ color }}>{value}</div>
      <div className={styles.metricDesc}>{desc}</div>
    </div>
  );
}

function UnavailableMetric({ name, desc }: { name: string; desc: string }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricName}>{name}</div>
      <div className={styles.metricValueNa}>N/A</div>
      <div className={styles.metricDesc}>{desc}</div>
    </div>
  );
}

function InfoIcon({ size = 14 }: { size?: number }) {
  return <BarChart2 size={size} style={{ flexShrink: 0, color: 'var(--accent-cyan)', marginTop: 2 }} />;
}
