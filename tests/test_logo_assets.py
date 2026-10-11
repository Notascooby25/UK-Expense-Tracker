"""Tests verifying presence, dimensions, and validity of app logo and PWA assets."""

import json
import os
from PIL import Image

FRONTEND_PUBLIC = os.path.join(os.path.dirname(__file__), "..", "frontend", "public")


def test_logo_assets_exist_and_valid():
    """Verify all favicon and PWA icons exist with exact specifications."""
    # 1. Favicon SVG
    svg_path = os.path.join(FRONTEND_PUBLIC, "favicon.svg")
    assert os.path.isfile(svg_path), "favicon.svg missing"
    with open(svg_path, "r", encoding="utf-8") as f:
        svg_content = f.read()
    assert "<svg" in svg_content
    assert "</svg>" in svg_content
    assert "£" in svg_content or "&#163;" in svg_content or "pound" in svg_content.lower()

    # 2. PNG Icons
    expected_pngs = {
        "favicon-16x16.png": (16, 16),
        "favicon-32x32.png": (32, 32),
        "apple-touch-icon.png": (180, 180),
        "pwa-192x192.png": (192, 192),
        "pwa-512x512.png": (512, 512),
    }

    for filename, (expected_w, expected_h) in expected_pngs.items():
        file_path = os.path.join(FRONTEND_PUBLIC, filename)
        assert os.path.isfile(file_path), f"{filename} missing"
        with Image.open(file_path) as img:
            assert img.size == (expected_w, expected_h), (
                f"{filename} has invalid dimensions {img.size}"
            )

    # 3. Favicon ICO
    ico_path = os.path.join(FRONTEND_PUBLIC, "favicon.ico")
    assert os.path.isfile(ico_path), "favicon.ico missing"
    with Image.open(ico_path) as ico:
        assert ico.format == "ICO"

    # 4. Web Manifest
    manifest_path = os.path.join(FRONTEND_PUBLIC, "manifest.webmanifest")
    assert os.path.isfile(manifest_path), "manifest.webmanifest missing"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("name") == "UK Expense Tracker"
    assert manifest.get("short_name") == "UK Expenses"
    assert manifest.get("display") == "standalone"
    assert manifest.get("start_url") == "/"
    assert len(manifest.get("icons", [])) >= 2


def test_index_html_contains_pwa_and_favicon_tags():
    """Verify frontend/index.html includes all required favicon and PWA meta tags."""
    index_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    assert os.path.isfile(index_path)
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert '<link rel="icon" type="image/svg+xml" href="/favicon.svg"' in html
    assert '<link rel="manifest" href="/manifest.webmanifest"' in html
    assert '<link rel="apple-touch-icon"' in html
    assert '<meta name="theme-color"' in html
