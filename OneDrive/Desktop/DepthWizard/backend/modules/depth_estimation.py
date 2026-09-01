"""
DepthWizard — Depth Estimation Module
Uses Depth Anything v2 Small ONNX (onnx-community/depth-anything-v2-small)
for monocular relative depth estimation.
"""

import os
import numpy as np
from PIL import Image

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))
HF_REPO = "onnx-community/depth-anything-v2-small"
HF_FILENAME = "onnx/model_quantized.onnx"
FALLBACK_HF_FILENAME = "onnx/model.onnx"

INPUT_SIZE = 518  # Canonical input size for Depth Anything v2


def _find_cached_model() -> str | None:
    """Check common local paths for cached ONNX model file."""
    candidates = [
        os.path.join(MODEL_DIR, "onnx", "model_quantized.onnx"),
        os.path.join(MODEL_DIR, "model_quantized.onnx"),
        os.path.join(MODEL_DIR, "onnx", "model.onnx"),
        os.path.join(MODEL_DIR, "model.onnx"),
    ]
    for c in candidates:
        if os.path.isfile(c) and os.path.getsize(c) > 1024 * 1024:
            return c
    return None


def _ensure_model() -> str:
    """Download model from HuggingFace hub if not already cached locally."""
    cached = _find_cached_model()
    if cached:
        return cached

    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f"[DepthWizard] Downloading Depth Anything v2 Small ONNX model from {HF_REPO}...")
    try:
        from huggingface_hub import hf_hub_download
        try:
            path = hf_hub_download(
                repo_id=HF_REPO,
                filename=HF_FILENAME,
                local_dir=MODEL_DIR,
            )
        except Exception as q_err:
            print(f"[DepthWizard] Quantized model download failed ({q_err}), trying standard model...")
            path = hf_hub_download(
                repo_id=HF_REPO,
                filename=FALLBACK_HF_FILENAME,
                local_dir=MODEL_DIR,
            )
        print(f"[DepthWizard] Model downloaded and cached at: {path}")
        return path
    except Exception as e:
        raise RuntimeError(
            f"Failed to download Depth Anything v2 ONNX model from {HF_REPO}: {e}"
        )


def _load_session():
    """Load ONNX runtime session for CPU execution."""
    import onnxruntime as ort

    model_path = _ensure_model()
    # Configure CPU execution session
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = min(os.cpu_count() or 4, 8)
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    session = ort.InferenceSession(
        model_path,
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )
    return session, model_path


_session = None
_loaded_model_path = None


def _get_session():
    global _session, _loaded_model_path
    if _session is None:
        _session, _loaded_model_path = _load_session()
    return _session, _loaded_model_path


def _preprocess(image: Image.Image, size: int) -> np.ndarray:
    """
    Preprocess image for Depth Anything v2 ONNX:
    Resize to (size, size), normalize with ImageNet mean/std, format as (1, 3, size, size) float32.
    """
    img = image.convert("RGB").resize((size, size), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std

    # HWC -> CHW -> NCHW
    arr = arr.transpose(2, 0, 1)[np.newaxis, ...]
    return arr.astype(np.float32)


def estimate_depth(image_path: str) -> dict:
    """
    Run monocular depth estimation using Depth Anything v2 Small ONNX model.

    Returns:
        dict:
            depth_map: 2D numpy array (H x W), normalized 0-1 (relative depth)
            width: original image width
            height: original image height
            model: exact model name used
            is_relative: True (monocular relative depth)
            is_real_ai: True if real ONNX inference, False if synthetic fallback
            warning: None or warning string
    """
    img = Image.open(image_path).convert("RGB")
    orig_w, orig_h = img.size

    warning = None
    is_real_ai = False

    try:
        session, model_path = _get_session()

        input_tensor = _preprocess(img, INPUT_SIZE)
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name

        outputs = session.run([output_name], {input_name: input_tensor})
        depth_raw = outputs[0]  # Expected shape: (1, 518, 518) or (1, 1, 518, 518)

        if depth_raw.ndim == 4:
            depth_raw = depth_raw[0, 0]
        elif depth_raw.ndim == 3:
            depth_raw = depth_raw[0]

        # Resize depth map back to original image dimensions
        depth_img = Image.fromarray(depth_raw.astype(np.float32), mode="F")
        depth_img = depth_img.resize((orig_w, orig_h), Image.BILINEAR)
        depth_map = np.array(depth_img, dtype=np.float32)

        variant = "Quantized" if "quantized" in model_path.lower() else "Small"
        model_used = f"Depth Anything v2 {variant} (ONNX - onnx-community/depth-anything-v2-small)"
        is_real_ai = True

    except Exception as e:
        warning = f"Depth Anything v2 ONNX inference failed: {e}. Outputting Synthetic DEMO fallback."
        depth_map = _synthetic_depth(orig_w, orig_h)
        model_used = "Synthetic DEMO (Model Unavailable)"
        is_real_ai = False

    # Normalize depth map to 0-1 range
    d_min, d_max = float(depth_map.min()), float(depth_map.max())
    if d_max > d_min:
        depth_normalized = (depth_map - d_min) / (d_max - d_min)
    else:
        depth_normalized = np.zeros_like(depth_map, dtype=np.float32)

    return {
        "depth_map": depth_normalized,
        "width": orig_w,
        "height": orig_h,
        "model": model_used,
        "is_relative": True,
        "is_real_ai": is_real_ai,
        "warning": warning,
    }


def _synthetic_depth(w: int, h: int) -> np.ndarray:
    """
    Generate synthetic depth map for offline fallback.
    Explicitly labeled as DEMONSTRATION.
    """
    x = np.linspace(-1, 1, w)
    y = np.linspace(-1, 1, h)
    xx, yy = np.meshgrid(x, y)
    depth = np.exp(-0.5 * (xx**2 + yy**2))
    noise = np.random.default_rng(42).normal(0, 0.05, depth.shape)
    depth = depth + noise
    return depth.astype(np.float32)
