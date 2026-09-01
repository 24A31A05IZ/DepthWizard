// DepthWizard — Landing Page
// Hero upload screen with manual drag-and-drop file acceptance & 1-click Quick-Load SIH demonstration scenes.

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Satellite, AlertCircle, Loader, Sparkles, MapPin, Layers, ArrowRight } from 'lucide-react';
import { uploadImage, fetchSampleScenes, loadSampleScene, type SampleScene } from '../api/client';
import { useAppState } from '../store/AppContext';
import styles from './LandingPage.module.css';

const ACCEPTED = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/tiff'];

export default function LandingPage() {
  const { setSessionId, setUploadData, setCurrentStep } = useAppState();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleScene[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch sample scene definitions on mount
  useEffect(() => {
    fetchSampleScenes()
      .then(data => setSamples(data))
      .catch(() => {
        // Fallback default sample definitions
        setSamples([
          {
            id: 'optical_mountain',
            name: 'Mountain Ridge Scene',
            subtitle: 'Single-View Optical Ingestion',
            type: 'non-georeferenced',
            format: 'JPG',
            badge: 'RELATIVE rDSM',
            filename: 'sample_optical_mountain.jpg',
            description: 'High-relief optical satellite image demonstrating zero-shot Depth Anything V2 relative depth estimation, uncalibrated rDSM, and 3D WebGL terrain flythrough.',
          },
          {
            id: 'geotiff_nilgiris',
            name: 'Western Ghats / Nilgiris',
            subtitle: 'Georeferenced Overhead GeoTIFF',
            type: 'georeferenced',
            format: 'GeoTIFF',
            badge: 'METRIC SRTM DEM',
            filename: 'sample_geotiff_scene.tif',
            description: 'Georeferenced GeoTIFF (EPSG:4326) demonstrating Rasterio spatial CRS/bounds extraction, automated SRTM 30m DEM alignment, and Metric DSM (metres).',
          },
          {
            id: 'gamus_benchmark',
            name: 'GAMUS Washington DC',
            subtitle: 'LiDAR Ground-Truth Scene',
            type: 'benchmark',
            format: 'GAMUS H5 / RGB',
            badge: 'LiDAR BENCHMARK',
            filename: 'DC_03_26_RGB.h5',
            description: 'Overhead satellite tile (1024×1024) from earthflow/GAMUS dataset evaluated directly against true airborne LiDAR Above-Ground-Level (AGL) ground truth.',
          },
        ]);
      });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      setError(`Unsupported file type "${ext}". Please upload JPG, PNG, TIFF, or GeoTIFF.`);
      return;
    }

    setLoading(true);
    try {
      const result = await uploadImage(file);
      setSessionId(result.session_id);
      setUploadData(result);
      setCurrentStep('analysis');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed. Is the backend running?';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setSessionId, setUploadData, setCurrentStep]);

  const handleSampleClick = async (sampleId: string) => {
    setError(null);
    setLoadingSampleId(sampleId);
    try {
      const result = await loadSampleScene(sampleId);
      setSessionId(result.session_id);
      setUploadData(result);
      setCurrentStep('analysis');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load sample scene.';
      setError(msg);
    } finally {
      setLoadingSampleId(null);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={styles.page}>
      {/* Background grid */}
      <div className={styles.grid} aria-hidden />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.isroBadge}>
          <Satellite size={14} />
          <span>Indian Space Research Organisation · SIH26175</span>
        </div>
        <h1 className={styles.title}>
          <span className={styles.titleAccent}>Depth</span>Wizard
        </h1>
        <p className={styles.subtitle}>
          Single-View Height Estimation &amp; Interactive 3D Terrain Reconstruction
          <br />
          from Optical Remote-Sensing Imagery
        </p>
        <div className={styles.prototypeBadge}>
          <span className="demo-badge">⚠ PROTOTYPE — SIH 2026 Demo</span>
        </div>
      </header>

      {/* Manual Upload zone */}
      <div
        className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${loading ? styles.uploading : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload satellite image"
        onKeyDown={e => e.key === 'Enter' && !loading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          onChange={onInputChange}
          style={{ display: 'none' }}
        />

        <div className={styles.dropzoneInner}>
          {loading ? (
            <>
              <Loader size={48} className={styles.loadingIcon} />
              <div className={styles.dropzoneTitle}>Analyzing image…</div>
              <div className={styles.dropzoneHint}>Extracting metadata and preparing workflow</div>
            </>
          ) : (
            <>
              <div className={styles.uploadIcon}>
                <Upload size={36} />
              </div>
              <div className={styles.dropzoneTitle}>
                {dragging ? 'Drop image here' : 'Upload Satellite Image'}
              </div>
              <div className={styles.dropzoneHint}>
                Drag &amp; drop or click to browse
              </div>
              <div className={styles.formatPills}>
                {['JPG', 'PNG', 'TIFF', 'GeoTIFF'].map(f => (
                  <span key={f} className={styles.formatPill}>{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Quick-Load SIH Demonstration Scenes ──────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 840, zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
            ⚡ QUICK-LOAD SIH DEMONSTRATION SCENES
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            (1-Click Pre-packaged Datasets for Live Presentation)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {samples.map(sample => {
            const isLoadingThis = loadingSampleId === sample.id;
            const isGeo = sample.type === 'georeferenced';
            const isBench = sample.type === 'benchmark';

            const badgeColor = isGeo ? 'var(--color-success)' : isBench ? '#a855f7' : '#f59e0b';
            const badgeBg = isGeo ? 'rgba(16,185,129,0.12)' : isBench ? 'rgba(168,85,247,0.12)' : 'rgba(245,158,11,0.12)';
            const borderCol = isGeo ? 'rgba(16,185,129,0.3)' : isBench ? 'rgba(168,85,247,0.3)' : 'rgba(245,158,11,0.3)';

            return (
              <div
                key={sample.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${borderCol}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: badgeBg, color: badgeColor, border: `1px solid ${borderCol}` }}>
                      {sample.badge}
                    </span>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {sample.format}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-bright)', marginBottom: 2 }}>
                    {sample.name}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--accent-cyan)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isGeo ? <MapPin size={12} /> : isBench ? <Layers size={12} /> : <Satellite size={12} />}
                    <span>{sample.subtitle}</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {sample.description}
                  </div>
                </div>

                <button
                  onClick={() => handleSampleClick(sample.id)}
                  disabled={loadingSampleId !== null || loading}
                  style={{
                    padding: '8px 14px',
                    background: isLoadingThis ? 'rgba(0,212,255,0.2)' : 'var(--bg-elevated)',
                    border: '1px solid var(--border-normal)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-bright)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'var(--transition)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-normal)'; }}
                >
                  {isLoadingThis ? (
                    <>
                      <Loader size={14} className={styles.loadingIcon} /> Loading Scene…
                    </>
                  ) : (
                    <>
                      Load Scene <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature cards */}
      <div className={styles.features}>
        {[
          { icon: '🛰️', title: 'Monocular Depth', desc: 'Depth Anything v2 — zero-shot single-image depth inference' },
          { icon: '🗺️', title: 'DSM & Slope Modeling', desc: 'Relative rDSM & Metric DSM with finite-difference slope maps' },
          { icon: '🌐', title: '3D WebGL Flythrough', desc: 'Interactive terrain mesh displacement and optical texture draping' },
          { icon: '📐', title: 'Scale Calibration', desc: 'SRTM 30m Global DEM & Survey GCP scale/offset solvers' },
        ].map(f => (
          <div key={f.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <div className={styles.featureTitle}>{f.title}</div>
            <div className={styles.featureDesc}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
