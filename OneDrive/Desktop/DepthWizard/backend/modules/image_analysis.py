"""
DepthWizard — Image Analysis Module
Extracts technical and geospatial metadata from uploaded images (JPG, PNG, TIFF, GeoTIFF).
Uses rasterio and pyproj for GeoTIFFs, and PIL for standard images.
"""

import os
from PIL import Image
from PIL.ExifTags import TAGS


def analyze_image(filepath: str) -> dict:
    """
    Analyze an uploaded image file and return detailed metadata.
    Attempts rasterio for GeoTIFF; falls back to PIL for standard imagery.
    """
    ext = os.path.splitext(filepath)[1].lower()
    result = {
        "filename": os.path.basename(filepath),
        "format": _get_format(ext),
        "is_georeferenced": False,
        "geo_metadata": None,
        "width": None,
        "height": None,
        "bands": None,
        "file_size_kb": round(os.path.getsize(filepath) / 1024, 1),
        "warnings": [],
    }

    # Attempt rasterio analysis for TIFF/GeoTIFF
    if ext in (".tif", ".tiff", ".geotiff"):
        geo_result = _analyze_with_rasterio(filepath, result)
        if geo_result:
            return geo_result

    # Fallback to standard PIL inspection
    return _analyze_with_pil(filepath, result)


def _get_format(ext: str) -> str:
    mapping = {
        ".jpg": "JPEG",
        ".jpeg": "JPEG",
        ".png": "PNG",
        ".tif": "TIFF / GeoTIFF",
        ".tiff": "TIFF / GeoTIFF",
        ".geotiff": "GeoTIFF",
    }
    return mapping.get(ext, ext.upper().lstrip("."))


def _analyze_with_pil(filepath: str, result: dict) -> dict:
    try:
        img = Image.open(filepath)
        result["width"] = img.width
        result["height"] = img.height
        result["bands"] = len(img.getbands())
        result["mode"] = img.mode

        # Extract EXIF tags if present
        exif_data = {}
        if hasattr(img, "_getexif") and img._getexif():
            for tag_id, value in img._getexif().items():
                tag = TAGS.get(tag_id, tag_id)
                if isinstance(value, (str, int, float)):
                    exif_data[str(tag)] = str(value)
        if exif_data:
            result["exif"] = exif_data

        return result
    except Exception as e:
        result["warnings"].append(f"PIL inspection error: {str(e)}")
        return result


def _analyze_with_rasterio(filepath: str, result: dict) -> dict | None:
    """Inspects geospatial raster properties using rasterio and pyproj."""
    try:
        import rasterio
        from pyproj import Transformer

        with rasterio.open(filepath) as src:
            result["width"] = src.width
            result["height"] = src.height
            result["bands"] = src.count
            result["mode"] = str(src.dtypes[0]) if src.dtypes else "unknown"
            result["driver"] = src.driver

            if src.crs:
                result["is_georeferenced"] = True
                result["format"] = "GeoTIFF"
                bounds = src.bounds
                epsg = src.crs.to_epsg()

                # Transform bounds to WGS84 (Lat/Lon) if not already geographic
                bounds_wgs84 = None
                try:
                    if src.crs.is_geographic:
                        bounds_wgs84 = {
                            "min_lon": float(bounds.left),
                            "min_lat": float(bounds.bottom),
                            "max_lon": float(bounds.right),
                            "max_lat": float(bounds.top),
                            "center_lon": float((bounds.left + bounds.right) / 2.0),
                            "center_lat": float((bounds.bottom + bounds.top) / 2.0),
                        }
                    else:
                        transformer = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
                        min_lon, min_lat = transformer.transform(bounds.left, bounds.bottom)
                        max_lon, max_lat = transformer.transform(bounds.right, bounds.top)
                        bounds_wgs84 = {
                            "min_lon": float(min_lon),
                            "min_lat": float(min_lat),
                            "max_lon": float(max_lon),
                            "max_lat": float(max_lat),
                            "center_lon": float((min_lon + max_lon) / 2.0),
                            "center_lat": float((min_lat + max_lat) / 2.0),
                        }
                except Exception as proj_err:
                    result["warnings"].append(f"WGS84 reprojection warning: {proj_err}")

                result["geo_metadata"] = {
                    "crs": src.crs.to_string(),
                    "crs_epsg": epsg,
                    "transform": list(src.transform)[:6],
                    "bounds_projected": {
                        "left": float(bounds.left),
                        "bottom": float(bounds.bottom),
                        "right": float(bounds.right),
                        "top": float(bounds.top),
                    },
                    "bounds_wgs84": bounds_wgs84,
                    "resolution_x": float(abs(src.transform.a)),
                    "resolution_y": float(abs(src.transform.e)),
                    "nodata": float(src.nodata) if src.nodata is not None else None,
                }
            else:
                result["format"] = "TIFF (Non-Georeferenced)"
                result["warnings"].append("TIFF file has no spatial reference system (CRS).")

        return result

    except ImportError:
        result["warnings"].append("rasterio not available; fallback to PIL.")
        return None
    except Exception as e:
        result["warnings"].append(f"rasterio inspection error: {str(e)}")
        return None
