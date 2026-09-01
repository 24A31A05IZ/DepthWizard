"""
DepthWizard — DSM Generation Module
Converts a relative depth map into a Digital Surface Model (DSM) grid.
Supports:
  - Relative DSM (unitless, 0-1 normalized)
  - Estimated Metric DSM (meters, from SRTM / GCP calibration)
  - Slope angle computation in degrees (0-90°)
  - Viridis (DSM) and Magma (Slope) base64 PNG visualizations
  - Downsampled grid generation for Three.js 3D WebGL rendering
"""

import numpy as np
from PIL import Image
import io
import base64

# Colormaps (10-step discrete ramps)
VIRIDIS = np.array([
    [68, 1, 84], [72, 40, 120], [62, 83, 160], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88],
    [181, 222, 43], [253, 231, 37],
], dtype=np.uint8)

MAGMA = np.array([
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135],
    [252, 253, 191], [252, 253, 191],
], dtype=np.uint8)


def _apply_colormap(arr_01: np.ndarray, cmap: np.ndarray) -> np.ndarray:
    """Map a 0-1 float array to RGB values using a discrete colormap."""
    indices = (arr_01 * (len(cmap) - 1)).astype(int).clip(0, len(cmap) - 1)
    return cmap[indices]


def _to_base64_png(rgb_array: np.ndarray) -> str:
    """Convert HxWx3 uint8 numpy array to base64-encoded PNG string."""
    img = Image.fromarray(rgb_array.astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def generate_dsm(
    depth_map: np.ndarray,
    scale_factor: float = 1.0,
    offset: float = 0.0,
    is_metric: bool = False,
    pixel_size_m: float | None = None,
) -> dict:
    """
    Convert a normalized depth map into a Digital Surface Model (DSM).

    Args:
        depth_map: 2D float array (0-1), where larger values mean farther from camera
        scale_factor: metric scale multiplier (from calibration)
        offset: metric elevation offset in meters (from calibration)
        is_metric: True if calibrated into meters; False for relative unitless DSM
        pixel_size_m: ground sampling distance in meters per pixel (from GeoTIFF)

    Returns:
        dict with elevation array, slope array, stats, and visualization images
    """
    h, w = depth_map.shape

    # Relative height: 0 (lowest) to 1 (highest)
    rel_height = 1.0 - depth_map

    if is_metric:
        elevation = rel_height * scale_factor + offset
        units = "m"
        elevation_type = "Estimated Metric"
        # Ground pixel step for slope calculation
        step_m = pixel_size_m if pixel_size_m and pixel_size_m > 0 else (scale_factor / 100.0)
    else:
        elevation = rel_height
        units = "rel."
        elevation_type = "Relative / Uncalibrated"
        step_m = 1.0

    # Compute surface slope magnitude via finite differences
    dy, dx = np.gradient(elevation)
    slope_rad = np.arctan(np.sqrt(dx**2 + dy**2) / max(step_m, 1e-4))
    slope_deg = np.degrees(slope_rad).clip(0, 90)

    # Normalize elevation to 0-1 for colormap rendering
    elev_min, elev_max = float(elevation.min()), float(elevation.max())
    if elev_max > elev_min:
        elev_norm = (elevation - elev_min) / (elev_max - elev_min)
    else:
        elev_norm = np.zeros_like(elevation)

    # Normalize slope to 0-1 for colormap rendering
    slope_max = float(slope_deg.max())
    slope_norm = slope_deg / max(slope_max, 1e-5)

    # Colorize
    dsm_rgb = _apply_colormap(elev_norm, VIRIDIS)
    slope_rgb = _apply_colormap(slope_norm, MAGMA)

    # Downsample heightmap for Three.js WebGL (max 256x256)
    max_dim = 256
    scale = min(1.0, max_dim / max(h, w))
    tw, th = max(1, int(w * scale)), max(1, int(h * scale))
    elev_thumb = np.array(
        Image.fromarray(elev_norm.astype(np.float32), mode="F").resize((tw, th), Image.LANCZOS)
    )

    stats = {
        "min_elevation": round(elev_min, 3 if not is_metric else 2),
        "max_elevation": round(elev_max, 3 if not is_metric else 2),
        "mean_elevation": round(float(elevation.mean()), 3 if not is_metric else 2),
        "std_elevation": round(float(elevation.std()), 3 if not is_metric else 2),
        "elevation_range": round(elev_max - elev_min, 3 if not is_metric else 2),
        "min_slope_deg": round(float(slope_deg.min()), 1),
        "max_slope_deg": round(float(slope_deg.max()), 1),
        "mean_slope_deg": round(float(slope_deg.mean()), 1),
        "is_metric": is_metric,
        "units": units,
        "elevation_type": elevation_type,
        "scale_factor": round(scale_factor, 3),
        "offset": round(offset, 2),
        "width": w,
        "height": h,
    }

    return {
        "elevation": elevation,
        "elevation_norm": elev_norm,
        "slope_deg": slope_deg,
        "heightmap_grid": elev_thumb.tolist(),
        "heightmap_w": tw,
        "heightmap_h": th,
        "dsm_png_b64": _to_base64_png(dsm_rgb),
        "slope_png_b64": _to_base64_png(slope_rgb),
        "stats": stats,
    }


def get_elevation_profile(elevation: np.ndarray, x0: int, y0: int, x1: int, y1: int, n_points: int = 100) -> list:
    """Extract 1D cross-section profile between two image coordinates."""
    h, w = elevation.shape
    xs = np.linspace(x0, x1, n_points).clip(0, w - 1).astype(int)
    ys = np.linspace(y0, y1, n_points).clip(0, h - 1).astype(int)
    distances = np.linspace(0, np.hypot(x1 - x0, y1 - y0), n_points)

    return [
        {"distance": round(float(d), 1), "elevation": round(float(elevation[y, x]), 2)}
        for d, x, y in zip(distances, xs, ys)
    ]
