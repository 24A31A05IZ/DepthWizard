import requests

BASE = "http://127.0.0.1:5000"

print("======================================================")
print("  DepthWizard SIH26175 — End-to-End Automated Test")
print("======================================================")

# 1. Health check
r = requests.get(f"{BASE}/api/health")
print("1. Health Check:", r.status_code, r.json())
assert r.status_code == 200

# 2. Get samples
r = requests.get(f"{BASE}/api/samples")
samples = r.json()["samples"]
print(f"2. Available Samples: {len(samples)} scenes found.")
for s in samples:
    print(f"   - [{s['badge']}] {s['name']} ({s['format']})")

# 3. Test Sample 1: Optical Mountain JPG (Relative rDSM Workflow)
print("\n3. Testing Sample 1: Optical Mountain (Relative Workflow)...")
r1 = requests.post(f"{BASE}/api/samples/load/optical_mountain")
s1 = r1.json()
sid1 = s1["session_id"]
print(f"   Loaded Session: {sid1} | is_georeferenced: {s1['analysis']['is_georeferenced']}")
assert not s1["analysis"]["is_georeferenced"]

# Run Depth
r1_depth = requests.post(f"{BASE}/api/depth/{sid1}").json()
print(f"   Depth Inference: {r1_depth['model']} | is_real_ai: {r1_depth['is_real_ai']} | Grid: {r1_depth['grid_w']}x{r1_depth['grid_h']}")
assert r1_depth["is_real_ai"] is True

# Run DSM
r1_dsm = requests.post(f"{BASE}/api/dsm/{sid1}").json()
print(f"   rDSM Generated: {r1_dsm['stats']['elevation_type']} | Units: {r1_dsm['stats']['units']} | Mean Elev: {r1_dsm['stats']['mean_elevation']}")
assert r1_dsm["stats"]["units"] == "rel."

# 4. Test Sample 2: GeoTIFF Nilgiris (Metric SRTM Workflow)
print("\n4. Testing Sample 2: GeoTIFF Western Ghats (Metric Workflow)...")
r2 = requests.post(f"{BASE}/api/samples/load/geotiff_nilgiris")
s2 = r2.json()
sid2 = s2["session_id"]
geo = s2["analysis"]["geo_metadata"]
print(f"   Loaded GeoTIFF Session: {sid2} | EPSG: {geo['crs_epsg']} | Resolution: {geo['resolution_x']:.5f}")
assert s2["analysis"]["is_georeferenced"] is True
assert geo["crs_epsg"] == 4326

# Run Depth
r2_depth = requests.post(f"{BASE}/api/depth/{sid2}").json()
print(f"   Depth Inference Done: is_real_ai = {r2_depth['is_real_ai']}")

# Run Scale Calibration (SRTM / GCP)
r2_cal = requests.post(f"{BASE}/api/calibrate/{sid2}", json={"method": "srtm"}).json()
print(f"   SRTM Calibration: {r2_cal['method']} | Scale (a): {r2_cal['scale_factor']} | Offset (b): {r2_cal['offset']}")
assert r2_cal["success"] is True

# Run Metric DSM
r2_dsm = requests.post(f"{BASE}/api/dsm/{sid2}").json()
print(f"   Metric DSM Generated: {r2_dsm['stats']['elevation_type']} | Units: {r2_dsm['stats']['units']} | Elev Range: {r2_dsm['stats']['min_elevation']}m to {r2_dsm['stats']['max_elevation']}m")
assert r2_dsm["stats"]["units"] == "m"

# 5. Test Sample 3: GAMUS Real LiDAR Benchmark Evaluation
print("\n5. Testing GAMUS Real LiDAR Benchmark Evaluation...")
r3_bench = requests.post(f"{BASE}/api/benchmark/gamus", json={"sample_id": "DC_03_26"}).json()
print("   Benchmark Result on earthflow/GAMUS:")
print(f"   - Dataset: {r3_bench['dataset']} | Sample: {r3_bench['sample_id']}")
print(f"   - Evaluated Pixels: {r3_bench['n_pixels_evaluated']:,}")
print(f"   - Real RMSE: {r3_bench['rmse_m']} metres")
print(f"   - Real MAE: {r3_bench['mae_m']} metres")
print(f"   - Pearson r: {r3_bench['pearson_r']}")
print(f"   - Delta < 1.25 Accuracy: {r3_bench['delta_1_25_pct']}%")
assert r3_bench["success"] is True
assert r3_bench["rmse_m"] > 0

print("\n======================================================")
print("  ALL TESTS PASSED! Sample Quick-Loader Fully Verified.")
print("======================================================")
