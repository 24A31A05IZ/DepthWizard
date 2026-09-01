// DepthWizard — Height & Slope Analysis Step

import { useState } from 'react';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { getElevationProfile } from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

interface ProfilePoint { distance: number; elevation: number; }

export default function HeightAnalysisPage() {
  const { sessionId, dsmData, calibrationData, setCurrentStep } = useAppState();
  const [profile, setProfile] = useState<ProfilePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMetric = calibrationData?.success ?? false;
  const unit = isMetric ? 'm' : 'rel.';
  const s = dsmData?.stats;

  async function fetchDiagonalProfile() {
    if (!sessionId || !dsmData) return;
    setLoading(true);
    setError(null);
    try {
      const { width, height } = dsmData.stats;
      const result = await getElevationProfile(sessionId, 0, 0, width - 1, height - 1, 100);
      setProfile(result.profile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch profile.');
    } finally {
      setLoading(false);
    }
  }

  // Simple SVG line chart
  function ProfileChart({ points }: { points: ProfilePoint[] }) {
    const W = 600, H = 160, pad = { left: 50, right: 20, top: 16, bottom: 30 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const elevs = points.map(p => p.elevation);
    const dists = points.map(p => p.distance);
    const minE = Math.min(...elevs), maxE = Math.max(...elevs);
    const minD = Math.min(...dists), maxD = Math.max(...dists);

    const xScale = (d: number) => ((d - minD) / (maxD - minD || 1)) * chartW;
    const yScale = (e: number) => chartH - ((e - minE) / (maxE - minE || 1)) * chartH;

    const pathD = points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${xScale(p.distance).toFixed(1)} ${yScale(p.elevation).toFixed(1)}`
    ).join(' ');

    const fillD = `${pathD} L ${xScale(maxD).toFixed(1)} ${chartH} L ${xScale(minD).toFixed(1)} ${chartH} Z`;

    // Y-axis ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      y: t * chartH,
      label: (maxE - (maxE - minE) * t).toFixed(2),
    }));

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
        <defs>
          <linearGradient id="profileGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <g transform={`translate(${pad.left},${pad.top})`}>
          {/* Grid lines */}
          {yTicks.map(t => (
            <g key={t.y}>
              <line x1={0} y1={t.y} x2={chartW} y2={t.y} stroke="#1a3a6a" strokeWidth={0.5} />
              <text x={-6} y={t.y + 4} textAnchor="end" fill="#4a6a9a" fontSize={9}>{t.label}</text>
            </g>
          ))}
          {/* Fill */}
          <path d={fillD} fill="url(#profileGrad)" />
          {/* Line */}
          <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth={1.5} />
          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={chartH} stroke="#1a3a6a" strokeWidth={1} />
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#1a3a6a" strokeWidth={1} />
          {/* Labels */}
          <text x={chartW / 2} y={chartH + 22} textAnchor="middle" fill="#4a6a9a" fontSize={9}>Distance (pixels)</text>
          <text x={-chartH / 2} y={-38} textAnchor="middle" fill="#4a6a9a" fontSize={9} transform="rotate(-90)">{`Elevation (${unit})`}</text>
        </g>
      </svg>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 06</div>
        <h2>Height &amp; Slope Analysis</h2>
        <p>Elevation statistics and cross-section profile</p>
      </div>

      {/* Elevation summary */}
      {s && (
        <div className={styles.card}>
          <div className={styles.cardHeader}><TrendingUp size={16} /><span>Elevation Summary</span></div>
          <div className={styles.statsGrid}>
            <StatCard label="Min Elevation" value={s.min_elevation.toFixed(3)} unit={unit} />
            <StatCard label="Max Elevation" value={s.max_elevation.toFixed(3)} unit={unit} />
            <StatCard label="Mean Elevation" value={s.mean_elevation.toFixed(3)} unit={unit} />
            <StatCard label="Std Dev" value={s.std_elevation.toFixed(3)} unit={unit} />
            <StatCard label="Elevation Range" value={(s.max_elevation - s.min_elevation).toFixed(3)} unit={unit} />
            <StatCard label="Mean Slope" value={s.mean_slope_deg.toFixed(1)} unit="°" />
            <StatCard label="Max Slope" value={s.max_slope_deg.toFixed(1)} unit="°" />
            <StatCard label="Calibrated" value={isMetric ? 'Yes' : 'No'} unit={isMetric ? 'metric' : 'relative'} />
          </div>
          {!isMetric && (
            <div className={styles.warnBox} style={{ marginTop: 8 }}>
              <span>⚠ Elevation values are relative and unitless. Use Scale Calibration to obtain metric estimates.</span>
            </div>
          )}
        </div>
      )}

      {/* Elevation profile */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><TrendingUp size={16} /><span>Diagonal Elevation Profile</span></div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Cross-section from top-left to bottom-right corner of the scene.
        </p>
        {!profile ? (
          <button className={styles.primaryBtn} onClick={fetchDiagonalProfile} disabled={loading}>
            {loading ? <><span className={styles.spinner} /> Loading profile…</> : <><TrendingUp size={16} /> Generate Elevation Profile</>}
          </button>
        ) : (
          <>
            <ProfileChart points={profile} />
            <button className={styles.secondaryBtn} onClick={() => setProfile(null)} style={{ marginTop: 8 }}>
              Clear
            </button>
          </>
        )}
        {error && <div className={styles.errorBox} style={{ marginTop: 8 }}><span>{error}</span></div>}
      </div>

      <div className={styles.footer}>
        <button className={styles.nextBtn} onClick={() => setCurrentStep('validation')}>
          Proceed to Validation<ChevronRight size={18} />
        </button>
      </div>
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
