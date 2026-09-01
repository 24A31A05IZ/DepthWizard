"""
DepthWizard — Flask Backend
SIH26175 | ISRO Prototype | Single-View Height Estimation & 3D Flythrough
"""

import os
import uuid
import json
import base64
import numpy as np
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import io

# ── Module imports ──────────────────────────────────────────────────────────
from modules.image_analysis import analyze_image
from modules.depth_estimation import estimate_depth
from modules.dsm_generation import generate_dsm, get_elevation_profile
from modules.calibration import calibrate_with_gcps, calibrate_with_srtm
from modules.validation import compute_metrics, demo_metrics, run_gamus_benchmark, GAMUS_AVAILABLE_SAMPLES

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".geotiff"}

# In-memory session store
SESSIONS: dict = {}


def _allowed(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


def _save_upload(file) -> tuple[str, str]:
    """Save uploaded file, return (session_id, filepath)."""
    session_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{session_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)
    return session_id, filepath


def _image_to_b64(image_path: str, max_size: int = 1024) -> str:
    """Return base64-encoded JPEG preview of an image."""
    try:
        img = Image.open(image_path).convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"[DepthWizard] Thumbnail error: {e}")
        return ""


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "DepthWizard",
        "version": "1.1.0-SIH26175",
        "capabilities": ["GeoTIFF", "DepthAnythingV2-ONNX", "SRTM-Calibration", "GCP-Calibration", "GAMUS-Benchmark"],
    })


SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "samples")

SAMPLE_SCENES = [
    {
        "id": "optical_mountain",
        "name": "Mountain Ridge Scene",
        "subtitle": "Single-View Optical Ingestion",
        "type": "non-georeferenced",
        "format": "JPG",
        "badge": "RELATIVE rDSM",
        "filename": "sample_optical_mountain.jpg",
        "description": "High-relief optical satellite image demonstrating zero-shot Depth Anything V2 relative depth estimation, uncalibrated rDSM, and 3D WebGL terrain flythrough.",
    },
    {
        "id": "geotiff_nilgiris",
        "name": "Western Ghats / Nilgiris",
        "subtitle": "Georeferenced Overhead GeoTIFF",
        "type": "georeferenced",
        "format": "GeoTIFF",
        "badge": "METRIC SRTM DEM",
        "filename": "sample_geotiff_scene.tif",
        "description": "Georeferenced GeoTIFF (EPSG:4326) demonstrating Rasterio spatial CRS/bounds extraction, automated SRTM 30m DEM alignment, and Metric DSM (metres).",
    },
    {
        "id": "gamus_benchmark",
        "name": "GAMUS Washington DC",
        "subtitle": "LiDAR Ground-Truth Scene",
        "type": "benchmark",
        "format": "GAMUS H5 / RGB",
        "badge": "LiDAR BENCHMARK",
        "filename": "DC_03_26_RGB.h5",
        "description": "Overhead satellite tile (1024×1024) from earthflow/GAMUS dataset evaluated directly against true airborne LiDAR Above-Ground-Level (AGL) ground truth.",
    },
]


@app.get("/api/samples")
def get_samples():
    """List pre-packaged demonstration scenes."""
    return jsonify({"samples": SAMPLE_SCENES})


@app.post("/api/samples/load/<sample_id>")
def load_sample(sample_id: str):
    """Load a real pre-packaged demonstration scene into a new session."""
    session_id = str(uuid.uuid4())

    if sample_id == "optical_mountain":
        src_path = os.path.join(SAMPLE_DIR, "sample_optical_mountain.jpg")
        target_path = os.path.join(UPLOAD_DIR, f"{session_id}.jpg")
        if not os.path.exists(src_path):
            return jsonify({"error": "Sample file not found"}), 404
        import shutil
        shutil.copyfile(src_path, target_path)

    elif sample_id == "geotiff_nilgiris":
        src_path = os.path.join(SAMPLE_DIR, "sample_geotiff_scene.tif")
        target_path = os.path.join(UPLOAD_DIR, f"{session_id}.tif")
        if not os.path.exists(src_path):
            return jsonify({"error": "Sample GeoTIFF not found"}), 404
        import shutil
        shutil.copyfile(src_path, target_path)

    elif sample_id == "gamus_benchmark":
        src_h5 = os.path.join(SAMPLE_DIR, "images", "test", "DC_03_26_RGB.h5")
        if not os.path.exists(src_h5):
            # Fallback check
            src_h5 = os.path.join(SAMPLE_DIR, "DC_03_26_RGB.h5")
        if not os.path.exists(src_h5):
            return jsonify({"error": "GAMUS sample file not found"}), 404

        import h5py
        with h5py.File(src_h5, "r") as f:
            rgb_arr = f["image"][:]
        target_path = os.path.join(UPLOAD_DIR, f"{session_id}.png")
        Image.fromarray(rgb_arr).save(target_path)

    else:
        return jsonify({"error": f"Unknown sample ID: {sample_id}"}), 404

    # Run standard analysis pipeline on loaded sample
    analysis = analyze_image(target_path)
    preview_b64 = _image_to_b64(target_path)

    SESSIONS[session_id] = {
        "filepath": target_path,
        "analysis": analysis,
        "depth_result": None,
        "dsm_result": None,
        "calibration": None,
    }

    return jsonify({
        "session_id": session_id,
        "analysis": analysis,
        "preview_b64": preview_b64,
    })


@app.post("/api/upload")
def upload():
    """
    Step 1: Upload image (JPG, PNG, TIFF, GeoTIFF).
    Returns: session_id, image preview, full technical analysis.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename or not _allowed(file.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    session_id, filepath = _save_upload(file)

    # Analyze image
    analysis = analyze_image(filepath)
    preview_b64 = _image_to_b64(filepath)

    SESSIONS[session_id] = {
        "filepath": filepath,
        "analysis": analysis,
        "depth_result": None,
        "dsm_result": None,
        "calibration": None,
    }

    return jsonify({
        "session_id": session_id,
        "analysis": analysis,
        "preview_b64": preview_b64,
    })


@app.post("/api/depth/<session_id>")
def depth(session_id: str):
    """
    Step 2: Run Depth Anything v2 Small ONNX monocular depth estimation.
    Returns: colorized depth map (base64 PNG), model info, depth grid for Three.js.
    """
    session = SESSIONS.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    filepath = session["filepath"]

    result = estimate_depth(filepath)
    depth_map = result["depth_map"]

    # Colorize depth map using turbo colormap approximation
    depth_colored = _colorize_depth(depth_map)
    buf = io.BytesIO()
    Image.fromarray(depth_colored).save(buf, format="PNG")
    depth_png_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    # Downsample depth grid for Three.js transfer (max 128x128)
    h, w = depth_map.shape
    max_dim = 128
    scale = min(1.0, max_dim / max(h, w))
    th, tw = max(1, int(h * scale)), max(1, int(w * scale))
    depth_thumb = np.array(
        Image.fromarray(depth_map.astype(np.float32), mode="F").resize((tw, th), Image.BILINEAR)
    )

    session["depth_result"] = result
    SESSIONS[session_id] = session

    return jsonify({
        "depth_png_b64": depth_png_b64,
        "depth_grid": depth_thumb.tolist(),
        "grid_w": tw,
        "grid_h": th,
        "model": result["model"],
        "is_relative": result["is_relative"],
        "is_real_ai": result.get("is_real_ai", False),
        "warning": result["warning"],
        "orig_width": result["width"],
        "orig_height": result["height"],
    })


@app.post("/api/dsm/<session_id>")
def dsm(session_id: str):
    """
    Step 3: Generate DSM from depth map.
    Respects calibration state if available (metric vs relative).
    """
    session = SESSIONS.get(session_id)
    if not session or not session.get("depth_result"):
        return jsonify({"error": "Run depth estimation first"}), 400

    depth_map = session["depth_result"]["depth_map"]
    cal = session.get("calibration")
    analysis = session.get("analysis", {})
    geo = analysis.get("geo_metadata") if analysis else None

    # Determine calibration parameters
    is_metric = bool(cal and cal.get("success"))
    scale_factor = cal["scale_factor"] if is_metric else 1.0
    offset = cal["offset"] if is_metric else 0.0
    pixel_res = geo.get("resolution_x") if geo else None

    dsm_result = generate_dsm(
        depth_map,
        scale_factor=scale_factor,
        offset=offset,
        is_metric=is_metric,
        pixel_size_m=pixel_res,
    )

    # Store serialized in session
    session["dsm_result"] = {
        **dsm_result,
        "elevation": dsm_result["elevation"].tolist(),
        "elevation_norm": dsm_result["elevation_norm"].tolist(),
        "slope_deg": dsm_result["slope_deg"].tolist(),
    }
    SESSIONS[session_id] = session

    return jsonify({
        "dsm_png_b64": dsm_result["dsm_png_b64"],
        "slope_png_b64": dsm_result["slope_png_b64"],
        "heightmap_grid": dsm_result["heightmap_grid"],
        "heightmap_w": dsm_result["heightmap_w"],
        "heightmap_h": dsm_result["heightmap_h"],
        "stats": dsm_result["stats"],
    })


@app.post("/api/calibrate/<session_id>")
def calibrate(session_id: str):
    """
    Step 4 (optional): Scale calibration using SRTM DEM or GCPs.
    """
    session = SESSIONS.get(session_id)
    if not session or not session.get("depth_result"):
        return jsonify({"error": "Run depth estimation first"}), 400

    depth_map = np.array(session["depth_result"]["depth_map"])
    geo_meta = session["analysis"].get("geo_metadata")
    body = request.get_json(force=True) or {}
    method = body.get("method", "srtm")

    if method == "gcp":
        gcps = body.get("gcps", [])
        result = calibrate_with_gcps(depth_map, gcps)
    elif method == "srtm":
        center_elev = float(body.get("center_elevation_m", 500.0)) if "center_elevation_m" in body else None
        range_m = float(body.get("range_m", 250.0)) if "range_m" in body else None
        result = calibrate_with_srtm(depth_map, geo_metadata=geo_meta, center_elevation_m=center_elev, elevation_range_m=range_m)
    else:
        return jsonify({"error": "Method must be 'gcp' or 'srtm'"}), 400

    session["calibration"] = result
    SESSIONS[session_id] = session

    return jsonify(result)


@app.post("/api/validate/<session_id>")
def validate(session_id: str):
    """
    Step 7: Compare estimated DSM against reference dataset.
    """
    session = SESSIONS.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    # If no reference provided, return clear demo/uncalibrated state
    if "reference" not in request.files or not session.get("dsm_result"):
        return jsonify(demo_metrics())

    ref_file = request.files["reference"]
    dsm_data = session["dsm_result"]
    elevation = np.array(dsm_data["elevation"])

    # Load reference file
    ref_ext = os.path.splitext(ref_file.filename)[1].lower()
    if ref_ext == ".npy":
        ref_arr = np.load(io.BytesIO(ref_file.read()))
    else:
        ref_img = Image.open(ref_file).convert("L")
        ref_arr = np.array(ref_img, dtype=np.float32)

    metrics = compute_metrics(elevation, ref_arr)
    return jsonify(metrics)


@app.get("/api/benchmark/gamus/samples")
def gamus_samples():
    """List available benchmark samples from earthflow/GAMUS."""
    return jsonify({"samples": GAMUS_AVAILABLE_SAMPLES})


@app.post("/api/benchmark/gamus")
def gamus_benchmark():
    """
    Execute real quantitative benchmark evaluation on earthflow/GAMUS dataset.
    """
    body = request.get_json(force=True) if request.data else {}
    sample_id = body.get("sample_id", "DC_03_26")
    result = run_gamus_benchmark(sample_id=sample_id)
    return jsonify(result)


@app.get("/api/elevation-profile/<session_id>")
def elevation_profile(session_id: str):
    """Get elevation profile along a 2D line: ?x0=&y0=&x1=&y1=&n=100"""
    session = SESSIONS.get(session_id)
    if not session or not session.get("dsm_result"):
        return jsonify({"error": "DSM not generated yet"}), 400

    elevation = np.array(session["dsm_result"]["elevation"])
    try:
        x0 = int(request.args.get("x0", 0))
        y0 = int(request.args.get("y0", 0))
        x1 = int(request.args.get("x1", elevation.shape[1] - 1))
        y1 = int(request.args.get("y1", elevation.shape[0] - 1))
        n = int(request.args.get("n", 100))
    except ValueError:
        return jsonify({"error": "Invalid coordinates"}), 400

    profile = get_elevation_profile(elevation, x0, y0, x1, y1, n)
    return jsonify({"profile": profile})


# ── Helpers ──────────────────────────────────────────────────────────────────

def _colorize_depth(depth_01: np.ndarray) -> np.ndarray:
    """Apply turbo colormap: blue=far, red=near."""
    TURBO = np.array([
        [48, 18, 59], [68, 54, 192], [34, 143, 255], [24, 220, 166],
        [93, 252, 39], [207, 249, 25], [255, 183, 3], [255, 79, 0],
        [188, 13, 8], [122, 4, 3],
    ], dtype=np.uint8)

    indices = (depth_01 * (len(TURBO) - 1)).astype(int).clip(0, len(TURBO) - 1)
    return TURBO[indices].astype(np.uint8)


if __name__ == "__main__":
    print("=" * 60)
    print("  DepthWizard Backend — SIH26175")
    print("  ISRO | Single-View Height Estimation & 3D Flythrough")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
