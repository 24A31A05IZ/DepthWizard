"""
DepthWizard — Validation & Benchmarking Module
Provides:
  1. Quantitative comparison against user-uploaded ground-truth DSM datasets (RMSE, MAE, Pearson r).
  2. Genuine remote-sensing benchmark on earthflow/GAMUS dataset (LiDAR AGL height ground truth).
"""

import os
import io
import base64
import numpy as np
from PIL import Image

# Benchmark sample candidates from earthflow/GAMUS test split
GAMUS_AVAILABLE_SAMPLES = [
    {"id": "DC_03_26", "name": "Washington DC Urban (Tile 03_26)", "split": "test"},
    {"id": "DC_05_28", "name": "Washington DC Mixed Urban (Tile 05_28)", "split": "test"},
    {"id": "DC_07_21", "name": "Washington DC Suburban (Tile 07_21)", "split": "test"},
    {"id": "DC_08_27", "name": "Washington DC Commercial (Tile 08_27)", "split": "test"},
    {"id": "DC_09_18", "name": "Washington DC Residential (Tile 09_18)", "split": "test"},
]


def compute_metrics(estimated: np.ndarray, reference: np.ndarray) -> dict:
    """
    Compute DSM accuracy metrics against a reference elevation dataset.
    Aligns spatial grids and filters valid non-nodata pixels.
    """
    # Resize estimated array to match reference if dimensions differ
    if estimated.shape != reference.shape:
        est_img = Image.fromarray(estimated.astype(np.float32), mode="F")
        est_img = est_img.resize((reference.shape[1], reference.shape[0]), Image.BILINEAR)
        estimated = np.array(est_img)

    est_flat = estimated.flatten()
    ref_flat = reference.flatten()

    # Filter valid pixels (exclude extreme nodata values)
    valid_mask = (~np.isnan(est_flat)) & (~np.isnan(ref_flat)) & (ref_flat > -500.0) & (ref_flat < 10000.0)

    if valid_mask.sum() < 10:
        return {
            "rmse": None,
            "mae": None,
            "correlation": None,
            "n_pixels": int(valid_mask.sum()),
            "is_demo": False,
            "warning": "Insufficient overlapping valid pixels to compute meaningful validation metrics.",
        }

    e_val = est_flat[valid_mask]
    r_val = ref_flat[valid_mask]

    diff = e_val - r_val
    rmse = float(np.sqrt(np.mean(diff**2)))
    mae = float(np.mean(np.abs(diff)))

    # Pearson correlation coefficient
    if e_val.std() > 1e-6 and r_val.std() > 1e-6:
        corr_matrix = np.corrcoef(e_val, r_val)
        correlation = float(corr_matrix[0, 1])
    else:
        correlation = 0.0

    return {
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "correlation": round(correlation, 4),
        "n_pixels": int(valid_mask.sum()),
        "reference_min": round(float(r_val.min()), 2),
        "reference_max": round(float(r_val.max()), 2),
        "reference_mean": round(float(r_val.mean()), 2),
        "is_demo": False,
        "warning": None,
    }


def demo_metrics() -> dict:
    """Return explicit empty state when no ground truth is available."""
    return {
        "rmse": None,
        "mae": None,
        "correlation": None,
        "n_pixels": None,
        "is_demo": True,
        "demo_message": (
            "No reference elevation dataset uploaded. "
            "Upload a reference DSM (PNG/NPY) or run the GAMUS benchmark below to evaluate accuracy."
        ),
    }


def run_gamus_benchmark(sample_id: str = "DC_03_26") -> dict:
    """
    Run an end-to-end evaluation against real earthflow/GAMUS dataset samples.
    Loads paired overhead RGB imagery and ground-truth LiDAR AGL height map.
    """
    try:
        from huggingface_hub import hf_hub_download
        import h5py
        from modules.depth_estimation import estimate_depth
        import tempfile

        rgb_rel_path = f"images/test/{sample_id}_RGB.h5"
        agl_rel_path = f"heights/test/{sample_id}_AGL.h5"

        # Download paired tiles from Hugging Face
        rgb_path = hf_hub_download(repo_id="earthflow/GAMUS", filename=rgb_rel_path, repo_type="dataset")
        agl_path = hf_hub_download(repo_id="earthflow/GAMUS", filename=agl_rel_path, repo_type="dataset")

        with h5py.File(rgb_path, "r") as f_rgb:
            rgb_arr = f_rgb["image"][:]

        with h5py.File(agl_path, "r") as f_h:
            gt_height = f_h["image"][:]

        # Save RGB image temporarily to run standard Depth Anything V2 pipeline
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_img = Image.fromarray(rgb_arr)
            tmp_img.save(tmp.name)
            tmp_path = tmp.name

        try:
            depth_result = estimate_depth(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        pred_depth = depth_result["depth_map"]  # 0-1 normalized
        rel_h = (1.0 - pred_depth).flatten()
        gt_h = gt_height.flatten()

        # Filter valid ground truth height pixels (AGL > 0)
        valid_mask = (gt_h > 0) & (~np.isnan(gt_h)) & (~np.isnan(rel_h))

        if valid_mask.sum() < 100:
            return {"success": False, "error": "Insufficient valid ground truth pixels in selected sample."}

        # Linear alignment (standard monocular depth evaluation protocol)
        A = np.column_stack([rel_h[valid_mask], np.ones(valid_mask.sum())])
        res = np.linalg.lstsq(A, gt_h[valid_mask], rcond=None)
        scale_a, offset_b = float(res[0][0]), float(res[0][1])

        aligned_pred = rel_h[valid_mask] * scale_a + offset_b
        actual_gt = gt_h[valid_mask]

        diff = aligned_pred - actual_gt
        rmse = float(np.sqrt(np.mean(diff**2)))
        mae = float(np.mean(np.abs(diff)))
        corr = float(np.corrcoef(aligned_pred, actual_gt)[0, 1])

        # Delta threshold (< 1.25)
        ratio = np.maximum(aligned_pred / np.maximum(actual_gt, 1e-3), actual_gt / np.maximum(aligned_pred, 1e-3))
        delta_1_25 = float(np.mean(ratio < 1.25) * 100.0)

        # Generate thumbnails for UI display
        def _to_thumb_b64(arr_uint8: np.ndarray, size: int = 256) -> str:
            im = Image.fromarray(arr_uint8).resize((size, size), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=80)
            return base64.b64encode(buf.getvalue()).decode("utf-8")

        rgb_b64 = _to_thumb_b64(rgb_arr)

        # Colorize depth and height for visual inspection
        d_norm = (pred_depth * 255).astype(np.uint8)
        d_b64 = _to_thumb_b64(d_norm)

        gt_norm = ((gt_height - gt_height.min()) / max(1e-3, gt_height.max() - gt_height.min()) * 255).clip(0, 255).astype(np.uint8)
        gt_b64 = _to_thumb_b64(gt_norm)

        sample_meta = next((s for s in GAMUS_AVAILABLE_SAMPLES if s["id"] == sample_id), {"name": sample_id})

        return {
            "success": True,
            "dataset": "earthflow/GAMUS",
            "sample_id": sample_id,
            "sample_name": sample_meta["name"],
            "model_evaluated": depth_result["model"],
            "n_pixels_evaluated": int(valid_mask.sum()),
            "rmse_m": round(rmse, 2),
            "mae_m": round(mae, 2),
            "pearson_r": round(corr, 4),
            "delta_1_25_pct": round(delta_1_25, 1),
            "fitted_scale": round(scale_a, 2),
            "fitted_offset": round(offset_b, 2),
            "gt_min_height_m": round(float(actual_gt.min()), 2),
            "gt_max_height_m": round(float(actual_gt.max()), 2),
            "gt_mean_height_m": round(float(actual_gt.mean()), 2),
            "pred_mean_height_m": round(float(aligned_pred.mean()), 2),
            "rgb_b64": rgb_b64,
            "pred_depth_b64": d_b64,
            "gt_height_b64": gt_b64,
            "disclaimer": (
                "These results represent quantitative benchmark evaluation against airborne LiDAR AGL ground truth. "
                "Monocular overhead predictions provide estimated relative/metric height and are not survey-grade."
            ),
        }

    except Exception as e:
        return {"success": False, "error": f"GAMUS evaluation failed: {e}"}
