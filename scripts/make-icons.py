#!/usr/bin/env python3
"""Render Cody's brand assets from the logo artwork.

The logo — a brushed-steel chevron with its diamond counterweight, on black —
lives in `docs/brand/cody-mark.png`. Everything else is derived from it, so the
home-screen icon, the favicon, the iOS touch icon and the in-app mark can never
drift apart.

    python3 scripts/make-icons.py

Requires Pillow (`pip install pillow`). Output goes to `public/`.
"""
from base64 import b64encode
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
SOURCE = ROOT / 'docs' / 'brand' / 'cody-mark.png'

BLACK = (0, 0, 0)


def load_mark() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f'missing source artwork: {SOURCE}')
    mark = Image.open(SOURCE).convert('RGB')
    # The artwork was exported on black with a little film grain in the
    # background. Crush that grain to true black so the plate has no visible
    # edge where the crop ends; the metal itself is far above this floor.
    mark = mark.point(lambda v: 0 if v < 12 else min(255, round((v - 12) * 255 / 243)))
    return mark


def plate(mark: Image.Image, size: int, height_ratio: float, radius: float = 0.0) -> Image.Image:
    """A square plate carrying the mark at `height_ratio` of its own height.

    The artwork is rendered metal on black, so the plate *is* black: nothing is
    keyed out and nothing frays. `radius` (0–1 of the side) rounds the corners
    the way each target expects.
    """
    canvas = Image.new('RGB', (size, size), BLACK)
    target_h = max(1, round(size * height_ratio))
    target_w = max(1, round(mark.width * target_h / mark.height))
    scaled = mark.resize((target_w, target_h), Image.LANCZOS)

    # Small sizes lose the brushed texture; a touch of sharpening keeps the
    # bevel readable as a metal edge rather than a grey blur.
    if size <= 256:
        scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.1, percent=70, threshold=1))

    canvas.paste(scaled, ((size - target_w) // 2, (size - target_h) // 2))

    if radius > 0:
        mask = Image.new('L', (size, size), 0)
        from PIL import ImageDraw

        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, size - 1, size - 1), radius=round(size * radius), fill=255
        )
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(canvas, (0, 0), mask)
        return out
    return canvas


def write_favicon(mark: Image.Image, path: Path) -> None:
    """A self-contained SVG favicon: the plate, inlined."""
    size = 512
    inner = plate(mark, 256, 0.80, radius=0.22)
    buf = PUBLIC / 'brand' / '.favicon-tmp.png'
    inner.save(buf, optimize=True)
    data = b64encode(buf.read_bytes()).decode('ascii')
    buf.unlink()
    path.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
        'width="512" height="512">\n'
        '  <title>Cody</title>\n'
        f'  <image x="0" y="0" width="{size}" height="{size}" '
        f'href="data:image/png;base64,{data}"/>\n'
        '</svg>\n'
    )


def main() -> None:
    mark = load_mark()
    (PUBLIC / 'brand').mkdir(parents=True, exist_ok=True)

    jobs = [
        # Full-bleed square icons: launchers apply their own mask.
        (PUBLIC / 'icon-512.png', 512, 0.72, 0.0),
        (PUBLIC / 'icon-192.png', 192, 0.74, 0.0),
        # Maskable icons are cropped to a circle, so the mark must sit inside
        # the safe zone: smaller, with air on every side.
        (PUBLIC / 'icon-maskable-512.png', 512, 0.54, 0.0),
        (PUBLIC / 'apple-touch-icon.png', 180, 0.74, 0.0),
        # The in-app mark: a rounded plate that reads as a logo on any skin.
        (PUBLIC / 'brand' / 'mark.png', 256, 0.82, 0.22),
    ]
    for path, size, ratio, radius in jobs:
        plate(mark, size, ratio, radius).save(path, optimize=True)
        print('wrote', path.relative_to(ROOT))

    write_favicon(mark, PUBLIC / 'icon.svg')
    print('wrote', (PUBLIC / 'icon.svg').relative_to(ROOT))


if __name__ == '__main__':
    main()
