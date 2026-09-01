// DepthWizard — Backend API Client
// Centralizes all HTTP calls to the Flask backend.

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300_000, // 5 min for model inference & dataset download
});

// ── Types ──────────────────────────────────────────────────────────────────

export interface BoundsWGS84 {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
  center_lon: number;
  center_lat: number;
}

export interface GeoMetadata {
  crs: string;
  crs_epsg: number | null;
  transform: number[];
  bounds_projected: { left: number; bottom: number; right: number; top: number };
  bounds_wgs84?: BoundsWGS84 | null;
  resolution_x: number;
  resolution_y: number;
  nodata: number | null;
}

export interface AnalysisResult {
  filename: string;
  format: string;
  is_georeferenced: boolean;
  geo_metadata: GeoMetadata | null;
  width: number;
  height: number;
  bands: number;
  file_size_kb: number;
  warnings: string[];
  mode?: string;
  driver?: string;
  exif?: Record<string, string>;
}

export interface UploadResponse {
  session_id: string;
  analysis: AnalysisResult;
  preview_b64: string;
}

export interface DepthResponse {
  depth_png_b64: string;
  depth_grid: number[][];
  grid_w: number;
  grid_h: number;
  model: string;
  is_relative: boolean;
  is_real_ai?: boolean;
  warning: string | null;
  orig_width: number;
  orig_height: number;
}

export interface DSMStats {
  min_elevation: number;
  max_elevation: number;
  mean_elevation: number;
  std_elevation: number;
  elevation_range: number;
  min_slope_deg: number;
  max_slope_deg: number;
  mean_slope_deg: number;
  is_metric: boolean;
  units: string;
  elevation_type: string;
  scale_factor: number;
  offset: number;
  width: number;
  height: number;
}

export interface DSMResponse {
  dsm_png_b64: string;
  slope_png_b64: string;
  heightmap_grid: number[][];
  heightmap_w: number;
  heightmap_h: number;
  stats: DSMStats;
}

export interface GCPResidual {
  x: number;
  y: number;
  rel_height: number;
  known_elevation_m: number;
  estimated_elevation_m: number;
  residual_m: number;
}

export interface CalibrationResult {
  success: boolean;
  scale_factor: number;
  offset: number;
  method: string;
  warning?: string;
  error?: string;
  calibration_rmse_m?: number | null;
  calibration_mae_m?: number | null;
  n_gcps?: number;
  gcp_residuals?: GCPResidual[];
  reference_min_elevation_m?: number;
  reference_max_elevation_m?: number;
  reference_mean_elevation_m?: number;
  elevation_type?: string;
  units?: string;
  disclaimer?: string;
}

export interface GCP {
  x: number;
  y: number;
  elevation_m: number;
}

export interface ValidationResult {
  rmse: number | null;
  mae: number | null;
  correlation: number | null;
  n_pixels: number | null;
  reference_min?: number;
  reference_max?: number;
  reference_mean?: number;
  is_demo: boolean;
  demo_message?: string;
  warning?: string | null;
}

export interface GAMUSSample {
  id: string;
  name: string;
  split: string;
}

export interface GAMUSBenchmarkResult {
  success: boolean;
  dataset?: string;
  sample_id?: string;
  sample_name?: string;
  model_evaluated?: string;
  n_pixels_evaluated?: number;
  rmse_m?: number;
  mae_m?: number;
  pearson_r?: number;
  delta_1_25_pct?: number;
  fitted_scale?: number;
  fitted_offset?: number;
  gt_min_height_m?: number;
  gt_max_height_m?: number;
  gt_mean_height_m?: number;
  pred_mean_height_m?: number;
  rgb_b64?: string;
  pred_depth_b64?: string;
  gt_height_b64?: string;
  disclaimer?: string;
  error?: string;
}

export interface SampleScene {
  id: string;
  name: string;
  subtitle: string;
  type: string;
  format: string;
  badge: string;
  filename: string;
  description: string;
}

export interface ElevationProfile {
  profile: { distance: number; elevation: number }[];
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function uploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<UploadResponse>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function runDepthEstimation(sessionId: string): Promise<DepthResponse> {
  const res = await api.post<DepthResponse>(`/api/depth/${sessionId}`);
  return res.data;
}

export async function generateDSM(sessionId: string): Promise<DSMResponse> {
  const res = await api.post<DSMResponse>(`/api/dsm/${sessionId}`);
  return res.data;
}

export async function calibrateGCP(sessionId: string, gcps: GCP[]): Promise<CalibrationResult> {
  const res = await api.post<CalibrationResult>(`/api/calibrate/${sessionId}`, {
    method: 'gcp',
    gcps,
  });
  return res.data;
}

export async function calibrateSRTM(
  sessionId: string,
  centerElevationM?: number,
  rangeM?: number,
): Promise<CalibrationResult> {
  const res = await api.post<CalibrationResult>(`/api/calibrate/${sessionId}`, {
    method: 'srtm',
    center_elevation_m: centerElevationM,
    range_m: rangeM,
  });
  return res.data;
}

export async function validateDSM(sessionId: string, referenceFile?: File): Promise<ValidationResult> {
  if (!referenceFile) {
    const res = await api.post<ValidationResult>(`/api/validate/${sessionId}`);
    return res.data;
  }
  const formData = new FormData();
  formData.append('reference', referenceFile);
  const res = await api.post<ValidationResult>(`/api/validate/${sessionId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function fetchGamusSamples(): Promise<GAMUSSample[]> {
  const res = await api.get<{ samples: GAMUSSample[] }>('/api/benchmark/gamus/samples');
  return res.data.samples;
}

export async function runGamusBenchmark(sampleId: string = 'DC_03_26'): Promise<GAMUSBenchmarkResult> {
  const res = await api.post<GAMUSBenchmarkResult>('/api/benchmark/gamus', { sample_id: sampleId });
  return res.data;
}

export async function getElevationProfile(
  sessionId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n = 100,
): Promise<ElevationProfile> {
  const res = await api.get<ElevationProfile>(`/api/elevation-profile/${sessionId}`, {
    params: { x0, y0, x1, y1, n },
  });
  return res.data;
}

export async function fetchSampleScenes(): Promise<SampleScene[]> {
  const res = await api.get<{ samples: SampleScene[] }>('/api/samples');
  return res.data.samples;
}

export async function loadSampleScene(sampleId: string): Promise<UploadResponse> {
  const res = await api.post<UploadResponse>(`/api/samples/load/${sampleId}`);
  return res.data;
}

export async function checkHealth(): Promise<boolean> {
  try {
    await api.get('/api/health');
    return true;
  } catch {
    return false;
  }
}
