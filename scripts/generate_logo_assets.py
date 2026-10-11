#!/usr/bin/env python3
"""Generate app logo, favicon, and PWA icon assets for UK Expense Tracker.

Generates Option B (Sterling Growth):
- favicon.svg
- favicon.ico (16x16, 32x32, 48x48)
- favicon-16x16.png
- favicon-32x32.png
- apple-touch-icon.png (180x180)
- pwa-192x192.png
- pwa-512x512.png
- manifest.webmanifest
"""

import json
import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "frontend", "public")


def generate_svg():
    """Generate modern, scalable SVG for favicon and brand logo."""
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff5e4d"/>
      <stop offset="50%" stop-color="#e74c3c"/>
      <stop offset="100%" stop-color="#c0392b"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Squircle Background -->
  <rect x="16" y="16" width="480" height="480" rx="110" fill="url(#bgGrad)"/>

  <!-- Rising Financial Analytics Bars -->
  <!-- Baseline -->
  <rect x="76" y="390" width="360" height="24" rx="12" fill="#ffffff"/>

  <!-- Bar 1 -->
  <rect x="110" y="270" width="64" height="120" rx="16" fill="#ffffff"/>

  <!-- Bar 2 -->
  <rect x="210" y="200" width="64" height="190" rx="16" fill="#ffffff"/>

  <!-- Bar 3 -->
  <rect x="310" y="130" width="64" height="260" rx="16" fill="#ffffff"/>

  <!-- Upward Trend Accent Path -->
  <path d="M142 245 L242 175 L342 105" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-dasharray="16 14"/>

  <!-- Accent Circle Badge for British Pound (£) -->
  <g filter="url(#shadow)">
    <circle cx="395" cy="115" r="75" fill="#ffffff"/>
    <text x="395" y="148" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="96" font-weight="900" fill="#e74c3c" text-anchor="middle">£</text>
  </g>
</svg>
"""
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    svg_path = os.path.join(PUBLIC_DIR, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {svg_path}")


def draw_master_icon(size=1024) -> Image.Image:
    """Draw master high-resolution Option B icon using Pillow."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 512.0

    # Gradient background squircle
    radius = int(110 * scale)
    margin = int(16 * scale)
    box = [margin, margin, size - margin, size - margin]

    # Create mask for rounded rectangle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(box, radius=radius, fill=255)

    # Gradient fill
    grad = Image.new("RGBA", (size, size))
    for y in range(size):
        ratio = y / size
        # Linear interpolation from #ff5e4d (255, 94, 77) to #c0392b (192, 57, 43)
        r = int(255 * (1 - ratio) + 192 * ratio)
        g = int(94 * (1 - ratio) + 57 * ratio)
        b = int(77 * (1 - ratio) + 43 * ratio)
        for x in range(size):
            # subtle horizontal gradient component
            hratio = x / size
            r_cur = min(255, max(0, int(r + 15 * (0.5 - hratio))))
            grad.putpixel((x, y), (r_cur, g, b, 255))

    img.paste(grad, (0, 0), mask)

    # Draw white bars and baseline
    white = (255, 255, 255, 255)
    baseline_box = [
        int(76 * scale),
        int(390 * scale),
        int((76 + 360) * scale),
        int((390 + 24) * scale),
    ]
    draw.rounded_rectangle(baseline_box, radius=int(12 * scale), fill=white)

    bar1 = [int(110 * scale), int(270 * scale), int((110 + 64) * scale), int(390 * scale)]
    draw.rounded_rectangle(bar1, radius=int(16 * scale), fill=white)

    bar2 = [int(210 * scale), int(200 * scale), int((210 + 64) * scale), int(390 * scale)]
    draw.rounded_rectangle(bar2, radius=int(16 * scale), fill=white)

    bar3 = [int(310 * scale), int(130 * scale), int((310 + 64) * scale), int(390 * scale)]
    draw.rounded_rectangle(bar3, radius=int(16 * scale), fill=white)

    # Trend line points
    p1 = (int(142 * scale), int(245 * scale))
    p2 = (int(242 * scale), int(175 * scale))
    p3 = (int(342 * scale), int(105 * scale))
    line_w = max(2, int(10 * scale))
    draw.line([p1, p2, p3], fill=white, width=line_w)

    # White badge circle for pound symbol
    badge_cx = int(395 * scale)
    badge_cy = int(115 * scale)
    badge_r = int(75 * scale)

    # Shadow for badge
    shadow_offset = int(6 * scale)
    draw.ellipse(
        [
            badge_cx - badge_r,
            badge_cy - badge_r + shadow_offset,
            badge_cx + badge_r,
            badge_cy + badge_r + shadow_offset,
        ],
        fill=(0, 0, 0, 60),
    )
    # Circle
    draw.ellipse(
        [badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
        fill=white,
    )

    # Draw £ sign
    font_size = int(100 * scale)
    font = None
    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for path in font_candidates:
        if os.path.isfile(path):
            try:
                font = ImageFont.truetype(path, font_size)
                break
            except Exception:
                continue

    if font is None:
        font = ImageFont.load_default()

    text = "£"
    text_bbox = draw.textbbox((badge_cx, badge_cy), text, font=font, anchor="mm")
    text_color = (231, 76, 60, 255)
    draw.text((badge_cx, badge_cy - int(3 * scale)), text, font=font, fill=text_color, anchor="mm")

    return img


def generate_pngs_and_ico():
    """Render PNG icons and multi-res ICO from master image."""
    master = draw_master_icon(size=1024)

    sizes = {
        "pwa-512x512.png": (512, 512),
        "pwa-192x192.png": (192, 192),
        "apple-touch-icon.png": (180, 180),
        "favicon-32x32.png": (32, 32),
        "favicon-16x16.png": (16, 16),
    }

    for filename, (w, h) in sizes.items():
        out_img = master.resize((w, h), Image.Resampling.LANCZOS)
        out_path = os.path.join(PUBLIC_DIR, filename)
        out_img.save(out_path, format="PNG", optimize=True)
        print(f"Generated {out_path} ({w}x{h})")

    # Generate multi-size favicon.ico
    ico_path = os.path.join(PUBLIC_DIR, "favicon.ico")
    ico_img_16 = master.resize((16, 16), Image.Resampling.LANCZOS)
    ico_img_32 = master.resize((32, 32), Image.Resampling.LANCZOS)
    ico_img_48 = master.resize((48, 48), Image.Resampling.LANCZOS)
    ico_img_32.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[ico_img_16, ico_img_48],
    )
    print(f"Generated {ico_path}")


def generate_manifest():
    """Generate web app manifest for PWA installation."""
    manifest = {
        "name": "UK Expense Tracker",
        "short_name": "UK Expenses",
        "description": "Personal & Joint Expense Tracker with Financial Intelligence",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#121a21",
        "theme_color": "#e74c3c",
        "icons": [
            {
                "src": "/favicon-32x32.png",
                "sizes": "32x32",
                "type": "image/png",
            },
            {
                "src": "/pwa-192x192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable",
            },
            {
                "src": "/pwa-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable",
            },
            {
                "src": "/apple-touch-icon.png",
                "sizes": "180x180",
                "type": "image/png",
            },
        ],
    }
    manifest_path = os.path.join(PUBLIC_DIR, "manifest.webmanifest")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Generated {manifest_path}")


if __name__ == "__main__":
    generate_svg()
    generate_pngs_and_ico()
    generate_manifest()
