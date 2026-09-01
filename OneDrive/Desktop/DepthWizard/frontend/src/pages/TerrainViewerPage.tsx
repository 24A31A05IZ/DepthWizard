// DepthWizard — 3D Terrain Viewer Step

import { Mountain, ChevronRight } from 'lucide-react';
import TerrainViewer from '../components/TerrainViewer';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

export default function TerrainViewerPage() {
  const { dsmData, uploadData, calibrationData, setCurrentStep } = useAppState();

  if (!dsmData) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.stepTag}>Step 05</div>
          <h2>3D Terrain Viewer</h2>
          <p>Generate a DSM first to enable 3D visualization</p>
        </div>
        <div className={styles.infoPanel}>
          <Mountain size={16} />
          <span>Please complete the DSM Generation step before opening the terrain viewer.</span>
        </div>
        <div className={styles.footer}>
          <button className={styles.primaryBtn} onClick={() => setCurrentStep('dsm')}>Go to DSM Generation</button>
        </div>
      </div>
    );
  }

  const isMetric = calibrationData?.success ?? false;
  const scaleLabel = isMetric ? 'm' : 'rel.';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 05</div>
        <h2>3D Terrain Viewer</h2>
        <p>Interactive WebGL terrain reconstruction · {isMetric ? 'Metric elevation' : 'Relative elevation'}</p>
      </div>

      {/* Info bar */}
      <div className={styles.infoPanel}>
        <Mountain size={16} />
        <span>
          Terrain reconstructed from DSM · Vertical exaggeration: 3× for visual clarity
          {!isMetric && ' · Values are relative (unitless) — no metric calibration applied'}
        </span>
        {!isMetric && <div className="demo-badge">RELATIVE</div>}
      </div>

      {/* Three.js viewer */}
      <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
        <TerrainViewer
          heightmapGrid={dsmData.heightmap_grid}
          gridW={dsmData.heightmap_w}
          gridH={dsmData.heightmap_h}
          textureB64={uploadData?.preview_b64}
          isMetric={isMetric}
          scaleLabel={scaleLabel}
        />
      </div>

      {/* Stats strip */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><span>Terrain Statistics</span></div>
        <div className={styles.statsGrid}>
          <StatCard label="Terrain Width" value={`${dsmData.heightmap_w}`} unit="grid pts" />
          <StatCard label="Terrain Height" value={`${dsmData.heightmap_h}`} unit="grid pts" />
          <StatCard label="Min Elevation" value={dsmData.stats.min_elevation.toFixed(3)} unit={scaleLabel} />
          <StatCard label="Max Elevation" value={dsmData.stats.max_elevation.toFixed(3)} unit={scaleLabel} />
          <StatCard label="Elevation Range" value={(dsmData.stats.max_elevation - dsmData.stats.min_elevation).toFixed(3)} unit={scaleLabel} />
          <StatCard label="Mean Slope" value={dsmData.stats.mean_slope_deg.toFixed(1)} unit="°" />
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.nextBtn} onClick={() => setCurrentStep('analysis-3d')}>
          Height &amp; Slope Analysis
          <ChevronRight size={18} />
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
