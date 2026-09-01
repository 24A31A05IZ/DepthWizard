// DepthWizard — Image Analysis Step

import { useEffect } from 'react';
import { Map, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react';
import { useAppState } from '../store/AppContext';
import styles from './StepPage.module.css';

export default function ImageAnalysisPage() {
  const { uploadData, setCurrentStep } = useAppState();

  useEffect(() => {
    if (!uploadData) setCurrentStep('landing');
  }, [uploadData, setCurrentStep]);

  if (!uploadData) return null;
  const { analysis, preview_b64 } = uploadData;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.stepTag}>Step 01</div>
        <h2>Image Analysis</h2>
        <p>Metadata extraction and format identification</p>
      </div>

      <div className={styles.grid2}>
        {/* Preview */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Map size={16} />
            <span>Image Preview</span>
          </div>
          <div className={styles.previewWrap}>
            <img
              src={`data:image/jpeg;base64,${preview_b64}`}
              alt="Uploaded satellite image"
              className={styles.preview}
            />
          </div>
          <div className={styles.previewMeta}>
            {analysis.width}×{analysis.height}px · {analysis.bands} band{analysis.bands !== 1 ? 's' : ''} · {analysis.file_size_kb} KB
          </div>
        </div>

        {/* Metadata */}
        <div className={styles.cardStack}>
          {/* File info */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Info size={16} />
              <span>File Information</span>
            </div>
            <table className={styles.metaTable}>
              <tbody>
                <MetaRow label="Filename" value={analysis.filename} />
                <MetaRow label="Format" value={analysis.format} />
                <MetaRow label="Dimensions" value={`${analysis.width} × ${analysis.height} px`} />
                <MetaRow label="Bands" value={String(analysis.bands)} />
                <MetaRow label="Mode" value={analysis.mode || '—'} />
                <MetaRow label="File Size" value={`${analysis.file_size_kb} KB`} />
              </tbody>
            </table>
          </div>

          {/* Geo metadata */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Map size={16} />
              <span>Geospatial Metadata</span>
              {analysis.is_georeferenced ? (
                <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}>
                  <CheckCircle size={10} /> GeoReferenced
                </span>
              ) : (
                <span className={styles.badge}>
                  Non-Georeferenced
                </span>
              )}
            </div>

            {analysis.is_georeferenced && analysis.geo_metadata ? (
              <table className={styles.metaTable}>
                <tbody>
                  <MetaRow label="Spatial Reference (CRS)" value={analysis.geo_metadata.crs} mono />
                  {analysis.geo_metadata.crs_epsg && (
                    <MetaRow label="EPSG Code" value={`EPSG:${analysis.geo_metadata.crs_epsg}`} mono />
                  )}
                  <MetaRow label="Ground Resolution X" value={`${analysis.geo_metadata.resolution_x.toFixed(3)} m/px (GSD)`} />
                  <MetaRow label="Ground Resolution Y" value={`${analysis.geo_metadata.resolution_y.toFixed(3)} m/px (GSD)`} />
                  {analysis.geo_metadata.bounds_wgs84 && (
                    <>
                      <MetaRow
                        label="Center Lat / Lon"
                        value={`${analysis.geo_metadata.bounds_wgs84.center_lat.toFixed(5)}° N, ${analysis.geo_metadata.bounds_wgs84.center_lon.toFixed(5)}° E`}
                        mono
                      />
                      <MetaRow
                        label="WGS84 Extent"
                        value={`[${analysis.geo_metadata.bounds_wgs84.min_lat.toFixed(4)}°, ${analysis.geo_metadata.bounds_wgs84.min_lon.toFixed(4)}°] to [${analysis.geo_metadata.bounds_wgs84.max_lat.toFixed(4)}°, ${analysis.geo_metadata.bounds_wgs84.max_lon.toFixed(4)}°]`}
                        mono
                      />
                    </>
                  )}
                  <MetaRow
                    label="Projected Bounds"
                    value={`X: [${analysis.geo_metadata.bounds_projected.left.toFixed(1)}, ${analysis.geo_metadata.bounds_projected.right.toFixed(1)}] | Y: [${analysis.geo_metadata.bounds_projected.bottom.toFixed(1)}, ${analysis.geo_metadata.bounds_projected.top.toFixed(1)}]`}
                    mono
                  />
                  <MetaRow label="NoData Value" value={analysis.geo_metadata.nodata !== null ? String(analysis.geo_metadata.nodata) : 'None'} />
                </tbody>
              </table>
            ) : (
              <div className={styles.infoBox}>
                <Info size={14} />
                <span>
                  No spatial reference detected (standard optical image). The pipeline will generate a{' '}
                  <strong>Relative DSM (rDSM)</strong> with unitless values, preserving relative height relationships.
                </span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {analysis.warnings.length > 0 && (
            <div className={styles.warnBox}>
              <AlertTriangle size={14} />
              <div>
                {analysis.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.nextBtn} onClick={() => setCurrentStep('depth')}>
          Proceed to Depth Estimation
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className={styles.metaLabel}>{label}</td>
      <td className={`${styles.metaValue} ${mono ? styles.mono : ''}`}>{value}</td>
    </tr>
  );
}
