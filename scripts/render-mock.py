#!/usr/bin/env python3
"""Render a high-fidelity mock of Cody's editor screen.

Not a device screenshot: every colour is parsed from `src/styles.css` and the
real VS Code Dark+/Light+ scheme in `src/editor/syntaxThemes.ts`, and the layout
mirrors the real DOM (tab strip → editor
→ status strip → keyboard rail → tab bar), including soft-wrapped lines.

Usage: python3 scripts/render-mock.py [out.png]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SS = 3  # supersample
W, H = 390, 844  # logical phone viewport
SCALE = 2  # output device pixels per logical px
MARK = ROOT / "docs/brand/cody-mark.png"  # the app logo


# --------------------------------------------------------------------------- #
# tokens straight out of the source of truth
# --------------------------------------------------------------------------- #

def parse_tokens() -> dict[str, dict[str, str]]:
    css = (ROOT / "src/styles.css").read_text()
    light_at = css.index("[data-theme='light']")
    blocks = {
        "dark": css[:light_at],
        "light": css[light_at : css.index("* {", light_at)],
    }
    keys = ["bg", "bg-chrome", "bg-elevated", "surface", "surface-2", "surface-3", "border", "border-strong",
            "text", "text-dim", "muted", "accent", "accent-ink", "editor-bg", "warn", "error"]
    out: dict[str, dict[str, str]] = {"dark": {}, "light": {}}
    for mode, block in blocks.items():
        for key in keys:
            match = re.search(rf"--{key}:\s*(#[0-9a-fA-F]{{6}})", block)
            if match:
                out[mode][key] = match.group(1)
    # the light theme inherits anything it does not override
    for key, value in out["dark"].items():
        out["light"].setdefault(key, value)
    return out


def _balanced(src: str, start: int) -> str:
    """Return the {...} block that starts at `start`."""
    depth = 0
    for index in range(start, len(src)):
        if src[index] == "{":
            depth += 1
        elif src[index] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1 : index]
    raise ValueError("unbalanced block")


def parse_palettes() -> dict[str, dict[str, str]]:
    """Read the real syntax schemes (VS Code, One Dark, GitHub) out of syntaxThemes.ts."""
    src = (ROOT / "src/editor/syntaxThemes.ts").read_text()
    out: dict[str, dict[str, str]] = {}
    for mode, name in (
        ("dark", "VSCODE_DARK"),
        ("light", "VSCODE_LIGHT"),
        ("onedark", "ONE_DARK"),
        ("github", "GITHUB_LIGHT"),
    ):
        at = src.index(f"const {name}: Palette = {{")
        block = _balanced(src, src.index("{", at))
        out[mode] = dict(re.findall(r"(\w+):\s*'([^']+)'", block))
    return out


def parse_marks() -> dict[str, dict[str, object]]:
    """Pull the language marks (24x24 paths + brand hex) out of the icon table."""
    src = (ROOT / "src/lib/languageIcons.ts").read_text()
    marks: dict[str, dict[str, object]] = {}
    for block in re.finditer(
        r"(\w+): \{\s*title: '([^']*)',\s*hex: '(#[0-9a-fA-F]{6})',\s*lift: (\w+),\s*path: '([^']+)'",
        src,
    ):
        key, title, hex_value, lift, path = block.groups()
        marks[key] = {"title": title, "hex": hex_value, "lift": lift == "true", "path": path}
    return marks


def parse_skin(name: str) -> dict[str, str]:
    """Read a [data-skin='…'] block's token overrides out of styles.css."""
    css = (ROOT / "src/styles.css").read_text()
    marker = f"[data-skin='{name}'] {{"
    if marker not in css:
        return {}
    block = _balanced(css, css.index("{", css.index(marker)))
    keys = ["bg", "bg-chrome", "bg-elevated", "surface", "surface-2", "surface-3", "border", "border-strong",
            "text", "text-dim", "muted", "accent", "accent-ink", "editor-bg", "warn", "error"]
    out: dict[str, str] = {}
    for key in keys:
        match = re.search(rf"--{key}:\s*(#[0-9a-fA-F]{{6}})", block)
        if match:
            out[key] = match.group(1)
    return out


# skin -> (theme it renders in, which parsed palette it uses, editor bg override)
SKINS = [
    ("graphite", "dark", "dark"),
    ("paper", "light", "github"),
    ("navy", "dark", "onedark"),
    ("terminal", "dark", "dark"),
]

TOKENS = parse_tokens()
PALETTES = parse_palettes()
MARKS = parse_marks()

FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_UI = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_UI_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# syntax kinds -> palette slots. The editor palette is a neutral ink ramp plus a
# single mint hue and one error red, so most kinds resolve to a grey step.
KIND_TO_TOKEN = {
    "keyword": "keyword",
    "string": "string",
    "comment": "comment",
    "number": "number",
    "operator": "punctuation",
    "func": "func",
    "type": "type",
    "fg": "fg",
}


def s(value: float) -> float:
    return value * SS


def font(path: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, int(round(size * SS)))


def color(value: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    value = value.strip()
    if value.startswith("rgba"):
        parts = [float(p) for p in value[5:-1].split(",")]
        return int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3] * 255 * alpha)
    if value.startswith("#"):
        value = value[1:]
    r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    return r, g, b, int(255 * alpha)


class Canvas:
    """Draws with real alpha compositing (PIL would otherwise punch holes)."""

    def __init__(self, size: tuple[int, int], bg: str):
        self.image = Image.new("RGBA", (int(s(size[0])), int(s(size[1]))), color(bg))
        self.w, self.h = size

    def _layer(self, paint):
        overlay = Image.new("RGBA", self.image.size, (0, 0, 0, 0))
        paint(ImageDraw.Draw(overlay))
        self.image.alpha_composite(overlay)

    def rect(self, box, fill=None, outline=None, radius=0.0, width=1.0, alpha=1.0):
        x0, y0, x1, y1 = (s(v) for v in box)
        self._layer(
            lambda d: d.rounded_rectangle(
                (x0, y0, x1, y1),
                radius=s(radius),
                fill=color(fill, alpha) if fill else None,
                outline=color(outline, alpha) if outline else None,
                width=max(1, int(s(width))),
            )
        )

    def circle(self, center, r, fill, alpha=1.0):
        box = (s(center[0] - r), s(center[1] - r), s(center[0] + r), s(center[1] + r))
        self._layer(lambda d: d.ellipse(box, fill=color(fill, alpha) if isinstance(fill, str) else fill))

    def line(self, points, fill, width=1.6, alpha=1.0):
        pts = [tuple(s(v) for v in p) for p in points]
        self._layer(lambda d: d.line(pts, fill=color(fill, alpha), width=max(1, int(s(width))), joint="curve"))

    def polygon(self, points, fill, alpha=1.0):
        pts = [tuple(s(v) for v in p) for p in points]
        self._layer(lambda d: d.polygon(pts, fill=color(fill, alpha)))

    def image_at(self, xy, path, size_px, radius=0.0):
        """Paste a PNG (the logo) at a logical position, rounded like the CSS."""
        art = Image.open(path).convert("RGBA").resize((int(s(size_px)), int(s(size_px))), Image.LANCZOS)
        if radius:
            mask = Image.new("L", art.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle(
                (0, 0, art.size[0] - 1, art.size[1] - 1), radius=s(radius), fill=255
            )
            art.putalpha(mask)
        self.image.alpha_composite(art, (int(s(xy[0])), int(s(xy[1]))))

    def text(self, xy, value, fg, size=13, bold=False, anchor="la", mono=False, alpha=1.0):
        path = (FONT_MONO_BOLD if bold else FONT_MONO) if mono else (FONT_UI_BOLD if bold else FONT_UI)
        run_font = font(path, size)
        self._layer(
            lambda d: d.text((s(xy[0]), s(xy[1])), value, font=run_font, fill=color(fg, alpha), anchor=anchor)
        )


# --------------------------------------------------------------------------- #
# real language marks (SVG path -> polygons -> PIL)
# --------------------------------------------------------------------------- #

PATH_RE = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)")
NUM_RE = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def _arc_points(x0, y0, rx, ry, rotation, large_arc, sweep, x1, y1, steps=12):
    """Endpoint-parameterised elliptical arc -> list of points."""
    import math

    if rx == 0 or ry == 0:
        return [(x1, y1)]
    phi = math.radians(rotation)
    dx, dy = (x0 - x1) / 2, (y0 - y1) / 2
    x1p = math.cos(phi) * dx + math.sin(phi) * dy
    y1p = -math.sin(phi) * dx + math.cos(phi) * dy
    rx, ry = abs(rx), abs(ry)
    lam = (x1p**2) / (rx**2) + (y1p**2) / (ry**2)
    if lam > 1:
        rx *= math.sqrt(lam)
        ry *= math.sqrt(lam)
    sign = -1 if large_arc == sweep else 1
    num = max(0.0, rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2)
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    coef = sign * math.sqrt(num / den) if den else 0.0
    cxp = coef * rx * y1p / ry
    cyp = -coef * ry * x1p / rx
    cx = math.cos(phi) * cxp - math.sin(phi) * cyp + (x0 + x1) / 2
    cy = math.sin(phi) * cxp + math.cos(phi) * cyp + (y0 + y1) / 2
    t0 = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    t1 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    delta = t1 - t0
    if sweep and delta < 0:
        delta += 2 * math.pi
    elif not sweep and delta > 0:
        delta -= 2 * math.pi
    points = []
    for step in range(1, steps + 1):
        angle = t0 + delta * step / steps
        points.append(
            (
                cx + rx * math.cos(angle) * math.cos(phi) - ry * math.sin(angle) * math.sin(phi),
                cy + rx * math.cos(angle) * math.sin(phi) + ry * math.sin(angle) * math.cos(phi),
            )
        )
    return points


def path_contours(d: str, steps: int = 8) -> list[list[tuple[float, float]]]:
    """Flatten an SVG path into closed polygons (enough for logo silhouettes)."""
    tokens = [(cmd, [float(n) for n in NUM_RE.findall(args)]) for cmd, args in PATH_RE.findall(d)]
    contours: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    x = y = start_x = start_y = 0.0
    prev_ctrl = None
    for cmd, nums in tokens:
        rel = cmd.islower()
        code = cmd.upper()
        if code == "M":
            if current:
                contours.append(current)
            x, y = nums[0] + (x if rel else 0), nums[1] + (y if rel else 0)
            start_x, start_y = x, y
            current = [(x, y)]
            for i in range(2, len(nums) - 1, 2):
                x, y = nums[i] + (x if rel else 0), nums[i + 1] + (y if rel else 0)
                current.append((x, y))
        elif code in "LHV":
            if code == "L":
                pairs = list(zip(nums[0::2], nums[1::2]))
            elif code == "H":
                pairs = [(n, 0.0) for n in nums]
            else:
                pairs = [(0.0, n) for n in nums]
            for dx, dy in pairs:
                x = dx + (x if rel else 0) if code in "LH" else x
                y = dy + (y if rel else 0) if code in "LV" else y
                current.append((x, y))
        elif code in "CSQT":
            for i in range(0, len(nums), 6 if code == "C" else 4 if code in "SQ" else 2):
                if code == "C":
                    x1, y1, x2, y2, nx, ny = nums[i : i + 6]
                    if rel:
                        x1, y1, x2, y2, nx, ny = x1 + x, y1 + y, x2 + x, y2 + y, nx + x, ny + y
                elif code in "SQ":
                    x1, y1, nx, ny = nums[i : i + 4]
                    if rel:
                        x1, y1, nx, ny = x1 + x, y1 + y, nx + x, ny + y
                    if code == "S":
                        x1, y1 = 2 * x - prev_ctrl[0], 2 * y - prev_ctrl[1] if prev_ctrl else (x, y)
                    else:
                        x1, y1 = x, y
                else:
                    nx, ny = nums[i : i + 2]
                    if rel:
                        nx, ny = nx + x, ny + y
                    x1, y1 = x, y
                ctrl_x = (x1, y1)
                for step in range(1, steps + 1):
                    t = step / steps
                    if code == "C":
                        mx = (1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t**2 * (x2 if code == "C" else x1) + t**3 * nx
                        my = (1 - t) ** 3 * y + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t**2 * (y2 if code == "C" else y1) + t**3 * ny
                    else:
                        mx = (1 - t) ** 2 * x + 2 * (1 - t) * t * x1 + t**2 * nx
                        my = (1 - t) ** 2 * y + 2 * (1 - t) * t * y1 + t**2 * ny
                    current.append((mx, my))
                prev_ctrl = (x2, y2) if code == "C" else ctrl_x
                x, y = nx, ny
        elif code == "A":
            for i in range(0, len(nums), 7):
                rx, ry, rot, large, sweep, nx, ny = nums[i : i + 7]
                if rel:
                    nx, ny = nx + x, ny + y
                current.extend(_arc_points(x, y, rx, ry, rot, int(large), int(sweep), nx, ny))
                x, y = nx, ny
        elif code == "Z":
            if current:
                current.append((start_x, start_y))
                contours.append(current)
            current = []
            x, y = start_x, start_y
    if current:
        contours.append(current)
    return contours


def draw_mark(canvas, key: str, x: float, y: float, size: float, mode: str) -> None:
    """Draw a real language mark at (x, y) sized `size`, scaled from its 24 grid.

    Contours are XOR-ed into a mask so counter-shapes (the React atom's rings,
    the C++ circle) stay open instead of filling in solid."""
    mark = MARKS[key]
    scale = size / 24.0
    fill = str(mark["hex"])
    if mark["lift"] and mode == "dark":
        fill = mix(fill, TOKENS["dark"]["text"], 0.55)
    mask = Image.new("1", canvas.image.size, 0)
    for contour in path_contours(str(mark["path"])):
        if len(contour) < 3:
            continue
        shape = Image.new("1", canvas.image.size, 0)
        points = [(s(x + px * scale), s(y + py * scale)) for px, py in contour]
        ImageDraw.Draw(shape).polygon(points, fill=1)
        mask = ImageChops.logical_xor(mask, shape)
    layer = Image.new("RGBA", canvas.image.size, color(fill))
    layer.putalpha(mask.convert("L").point(lambda v: int(v * 0.82)))
    canvas.image.alpha_composite(layer)


def mix(a: str, b: str, t: float) -> str:
    """Blend two hex colours (t=0 -> a, t=1 -> b)."""
    ca, cb = color(a), color(b)
    out = tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
    return "#%02x%02x%02x" % out


# --------------------------------------------------------------------------- #
# syntax highlighting (small, but shaped like the real token classes)
# --------------------------------------------------------------------------- #

KEYWORDS = {"import", "from", "export", "default", "const", "let", "function", "return", "if",
            "else", "type", "new", "for", "of", "await", "async", "true", "false", "null",
            "undefined", "void", "as", "interface"}

SNIPPET = """import { useMemo, useState } from 'react'
import Task from './Task'
import './styles.css'

type Item = { id: number; label: string; done: boolean }

export default function App() {
  const [items, setItems] = useState<Item[]>([
    { id: 1, label: 'Design on the bus', done: true },
    { id: 2, label: 'Ship from your phone', done: false },
  ])
  const [draft, setDraft] = useState('')

  // todo: only recompute when items change
  const remaining = useMemo(
    () => items.filter((item) => !item.done).length,
    [items],
  )

  function toggle(id: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    )
  }

  return (
    <main className="app">
      <h1>Cody tasks</h1>
      <p>{remaining} left to do</p>
      {items.map((item) => (
        <Task key={item.id} {...item} onToggle={() => toggle(item.id)} />
      ))}
    </main>
  )
}
"""

TOKEN_RE = re.compile(
    r"(?P<comment>//[^\n]*)"
    r"|(?P<string>'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")"
    r"|(?P<number>\b\d+(?:\.\d+)?\b)"
    r"|(?P<word>[A-Za-z_$][\w$]*)"
    r"|(?P<punct>[{}()[\].,;:=<>+\-*/!?&|]+)"
)

COLOR_OF = {
    "comment": "comment", "string": "string", "number": "number", "punct": "operator",
}


def tokenize(line: str) -> list[tuple[str, str]]:
    runs: list[tuple[str, str]] = []
    index = 0
    for match in TOKEN_RE.finditer(line):
        if match.start() > index:
            runs.append((line[index : match.start()], "fg"))
        text, kind = match.group(0), match.lastgroup or "fg"
        if kind == "word":
            if text in KEYWORDS:
                kind = "keyword"
            elif text[:1].isupper():
                kind = "type"
            elif line[match.end() : match.end() + 1] == "(":
                kind = "func"
            else:
                kind = "fg"
        else:
            kind = COLOR_OF.get(kind, "fg")
        runs.append((text, kind))
        index = match.end()
    if index < len(line):
        runs.append((line[index:], "fg"))
    return runs


def wrap_runs(runs: list[tuple[str, str]], cols: int) -> list[list[tuple[str, str]]]:
    """Soft-wrap token runs like `EditorView.lineWrapping`, preferring word breaks."""
    flat = ''.join(text for text, _ in runs)
    if len(flat) <= cols:
        return [runs]

    rows: list[list[tuple[str, str]]] = []
    rest = flat
    indent = '  '
    while rest:
        if len(rest) <= cols:
            rows.append(rest)
            break
        cut = rest.rfind(' ', 0, cols + 1)
        if cut < cols * 0.5:
            cut = cols
        rows.append(rest[:cut].rstrip())
        rest = indent + rest[cut:].lstrip()

    # re-apply token colours per row
    out: list[list[tuple[str, str]]] = []
    for row in rows:
        row_runs: list[tuple[str, str]] = []
        index = 0
        for match in TOKEN_RE.finditer(row):
            if match.start() > index:
                row_runs.append((row[index:match.start()], 'fg'))
            text, kind = match.group(0), match.lastgroup or 'fg'
            if kind == 'word':
                if text in KEYWORDS:
                    kind = 'keyword'
                elif text[:1].isupper():
                    kind = 'type'
                elif row[match.end():match.end() + 1] == '(':
                    kind = 'func'
                else:
                    kind = 'fg'
            else:
                kind = COLOR_OF.get(kind, 'fg')
            row_runs.append((text, kind))
            index = match.end()
        if index < len(row):
            row_runs.append((row[index:], 'fg'))
        out.append(row_runs)
    return out


# --------------------------------------------------------------------------- #
# screen
# --------------------------------------------------------------------------- #

def draw_screen(mode: str, skin: str = "graphite", scheme: str = "dark") -> Image.Image:
    tokens = {**TOKENS[mode], **parse_skin(skin)}
    palette = dict(PALETTES[scheme])
    # A skin may move the code surface off the syntax palette's own background
    # (Mono is true black, Navy is a deep blue) without touching token colours.
    if skin != "graphite" and "editor-bg" in tokens:
        palette["bg"] = tokens["editor-bg"]
    t = lambda k: tokens.get(k, TOKENS[mode].get(k, "#000000"))  # noqa: E731
    p = lambda k: palette[k]  # noqa: E731
    accent = tokens.get("accent", t("accent"))
    canvas = Canvas((W, H), t("bg-chrome"))
    c = canvas

    # ---------------- OS status bar ----------------
    c.text((20, 14), "9:41", t("text"), 12.5, bold=True)
    for i in range(4):
        c.rect((W - 79 + i * 5, 25 - i * 2.4, W - 76 + i * 5, 26), fill=t("text"), radius=0.6)
    c.rect((W - 53, 18, W - 33, 26), fill=None, outline=t("text-dim"), radius=2.5, width=1)
    c.rect((W - 51, 20, W - 39, 24), fill=t("text"), radius=1)

    # ---------------- app header (54px, chrome) ----------------
    top = 46
    HEADER_H = 54
    c.rect((0, top, W, top + HEADER_H), fill=t("bg-chrome"))
    for i in range(3):
        c.rect((15, top + 20 + i * 5, 33 if i != 1 else 27, top + 21.4 + i * 5), fill=t("text-dim"))
    c.text((36, top + 13), "~", t("muted"), 12, mono=True)
    c.text((47, top + 13), "/Cody tasks", t("text"), 13, mono=True, bold=True)
    c.text((36, top + 34), "7 files · TSX · 2m ago", t("muted"), 9.5, mono=True)
    # run, lit in accent
    c.rect((W - 82, top + 10, W - 48, top + 44), fill=t("accent"), radius=10, alpha=1.0)
    ink = t("accent-ink")
    canvas.polygon([(W - 69, top + 20), (W - 69, top + 34), (W - 58, top + 27)], fill=ink)
    # overflow
    for i in range(3):
        c.circle((W - 26, top + 21 + i * 6), 1.7, t("text-dim"))
    c.rect((0, top + HEADER_H - 1, W, top + HEADER_H), fill=t("border"))

    # ---------------- file tabs (42px, chips) ----------------
    tabs_top = top + HEADER_H
    TABS_H = 32
    c.rect((0, tabs_top, W, tabs_top + TABS_H), fill=t("bg-chrome"))
    c.rect((0, tabs_top + TABS_H - 1, W, tabs_top + TABS_H), fill=t("border"))

    tabs = [("App.tsx", "tsx", True, True), ("Task.tsx", "tsx", False, False), ("styles.css", "css", False, False)]
    x = 0.0
    for index, (name, mark_key, active, broken) in enumerate(tabs, start=1):
        width = 54 + len(name) * 6.6
        if active:
            c.rect((x, tabs_top, x + width, tabs_top + TABS_H - 1), fill=p("bg"))
            c.rect((x, tabs_top + TABS_H - 3, x + width, tabs_top + TABS_H - 1), fill=accent)
        c.text((x + 8, tabs_top + 10), str(index), accent if active else t("muted"), 9, mono=True)
        draw_mark(canvas, mark_key, x + 19, tabs_top + 9, 13, mode)
        offset = 38
        if broken:
            c.circle((x + 38, tabs_top + 16), 5.0, t("error"))
            c.text((x + 38, tabs_top + 13.5), "!", "#ffffff", 7.2, mono=True, anchor="ma", bold=True)
            offset = 47
        c.text((x + offset, tabs_top + 10), name, t("text") if active else t("muted"), 10.5)
        c.rect((x + width - 1, tabs_top, x + width, tabs_top + TABS_H), fill=t("border"))
        x += width
    c.rect((W - 30, tabs_top, W, tabs_top + TABS_H), fill=t("bg-chrome"))
    c.rect((W - 30, tabs_top, W - 29, tabs_top + TABS_H), fill=t("border"))
    c.rect((W - 22, tabs_top + 8, W - 14, tabs_top + 22), fill=None, outline=t("muted"), radius=0, width=1.2)
    c.rect((W - 12, tabs_top + 8, W - 4, tabs_top + 22), fill=None, outline=t("muted"), radius=0, width=1.2)

    # ---------------- editor ----------------
    ed_top = tabs_top + TABS_H
    RAIL_H = 88
    STATUS_H = 28
    TABBAR_H = 0
    ed_bottom = H - TABBAR_H - STATUS_H - RAIL_H
    c.rect((0, ed_top, W, ed_bottom), fill=p("bg"))

    squ = 0 if skin == "terminal" else 1
    font_size = 12.6
    line_h = 20.4
    gutter_w = 32.0
    text_x = gutter_w + 8
    caret_col = 21
    code_font = font(FONT_MONO, font_size)
    char_w = code_font.getlength("0") / SS
    cols = int((W - text_x - 16) / char_w)

    rows: list[tuple[int, int, list[tuple[str, str]], bool]] = []
    for number, line in enumerate(SNIPPET.split("\n"), start=1):
        wrapped = wrap_runs(tokenize(line), cols)
        for index, runs in enumerate(wrapped):
            rows.append((number, index, runs, index == 0))

    active_line = 14
    active_rows = [i for i, row in enumerate(rows) if row[0] == active_line]
    for row_index in active_rows:
        y = ed_top + 8 + row_index * line_h
        c.rect((0, y, W, y + line_h), fill=p("activeLine"))

    max_rows = int((ed_bottom - ed_top - 10) / line_h)
    for row_index, (number, part, runs, first) in enumerate(rows[:max_rows]):
        y = ed_top + 8 + row_index * line_h
        if first:
            is_active = number == active_line
            c.text((gutter_w - 8, y + 3.4), str(number),
                   p("gutterActive") if is_active else p("gutter"), 10.2, mono=True, anchor="ra",
                   bold=is_active)
        cx = text_x
        for text, kind in runs:
            c.text((cx, y + 1.6), text, p(KIND_TO_TOKEN.get(kind, "fg")), font_size, mono=True)
            cx += code_font.getlength(text) / SS
        if number == active_line and part == 0:
            caret_x = text_x + char_w * (caret_col - 1)
            c.rect((caret_x, y + 2.5, caret_x + 1.8, y + line_h - 2.5), fill=p("fg"), radius=0.6)

    # ---------------- status strip (28px, chrome) ----------------
    st = ed_bottom
    c.rect((0, st, W, st + STATUS_H), fill=t("bg-chrome"))
    c.rect((0, st, W, st + 1), fill=t("border"))
    ty = st + 9
    c.text((12, ty), "Ln 14, Col 21", t("text-dim"), 9.6, mono=True, bold=True)
    c.text((92, ty), "│", t("muted"), 9.6, mono=True, alpha=0.45)
    c.text((100, ty), "34L", t("muted"), 9.6, mono=True)
    c.text((126, ty), "│", t("muted"), 9.6, mono=True, alpha=0.45)
    c.text((134, ty), "tsx", t("text-dim"), 9.6, mono=True, bold=True)

    # problems chip
    chip_w = 50.0
    chip_x = W - 62 - chip_w
    c.rect((chip_x, st + 6, chip_x + chip_w, st + 22), fill=t("error"), radius=8, alpha=0.14)
    c.text((chip_x + 11, ty), "!", t("error"), 9, mono=True, anchor="ma", bold=True)
    c.text((chip_x + 17, ty), "1 error", t("error"), 8.8, mono=True)
    # save state: dot + word
    c.circle((W - 50, st + 14), 2.3, t("warn"))
    c.text((W - 43, ty), "Unsaved", t("warn"), 9.6, mono=True)

    # ---------------- keyboard rail (88px, chrome) ----------------
    rail = st + STATUS_H
    c.rect((0, rail, W, rail + RAIL_H), fill=t("bg-chrome"))
    c.rect((0, rail, W, rail + 1), fill=t("border"))

    # row 1 — tools left, dismiss right
    ax = 6.0
    groups = [["↺", "↻"], ["⇥", "⌕"], ["✦", "◍"], ["Aa", "⌘"]]
    for gi, group in enumerate(groups):
        for glyph in group:
            c.rect((ax, rail + 6, ax + 34, rail + 42), radius=10 * squ)
            c.text((ax + 17, rail + 15), glyph, t("text-dim"), 13.5, mono=True, anchor="ma")
            ax += 37
        if gi < 2:
            c.rect((ax - 1, rail + 15, ax, rail + 33), fill=t("border"))
    c.rect((W - 40, rail + 6, W - 6, rail + 42), radius=10)
    c.text((W - 23, rail + 15), "⌄", t("text-dim"), 13.5, mono=True, anchor="ma")

    # row 2 — scrolling symbol keys, Run pinned in the thumb corner
    row2 = rail + 6 + 36 + 6
    run_w = 74.0
    keys_right = W - run_w - 12
    keys = ["⇥", "{", "}", "(", ")", "[", "]", "<", ">", "=", '"', "'"]
    kx = 6.0
    for key in keys:
        if kx + 34 > keys_right:
            break
        c.rect((kx, row2, kx + 34, row2 + 34), fill=t("surface-2"), outline=t("border"), radius=8 * squ)
        c.text((kx + 17, row2 + 9.5), key, t("text-dim"), 13.5, mono=True, anchor="ma")
        kx += 39
    for i in range(10):
        c.rect((kx - 2 + i * 2.2, row2, kx + i * 2.2, row2 + 34), fill=t("bg-chrome"), alpha=0.06 * (10 - i))
    c.rect((W - run_w - 6, row2, W - 6, row2 + 34), fill=t("accent"), radius=10 * squ)
    canvas.polygon([(W - run_w + 6, row2 + 10), (W - run_w + 6, row2 + 24), (W - run_w + 17, row2 + 17)], fill=ink)
    c.text((W - run_w + 23, row2 + 8.5), "Run", ink, 12, bold=True)

    # home indicator
    if skin == "terminal":
        c.rect((W / 2 - 46, H - 7.5, W / 2 + 46, H - 3), fill=t("text-dim"), radius=2.4, alpha=0.55)
    return canvas.image


def downscale(image: Image.Image, width: int) -> Image.Image:
    return image.resize((width, int(image.height * width / image.width)), Image.LANCZOS)


def draw_drawer(mode: str, skin: str = "terminal", scheme: str = "dark") -> Image.Image:
    """The menu: the app's only navigation control, open over the editor."""
    tokens = {**TOKENS[mode], **parse_skin(skin)}
    palette = dict(PALETTES[scheme])
    if skin != "graphite" and "editor-bg" in tokens:
        palette["bg"] = tokens["editor-bg"]
    t = lambda k: tokens.get(k, TOKENS[mode].get(k, "#000000"))  # noqa: E731
    accent = tokens.get("accent", t("accent"))
    squ = 0 if skin == "terminal" else 1
    c = Canvas((W, H), t("bg-chrome"))

    # dimmed app behind the scrim
    c.rect((0, 0, W, H), fill=t("bg"))
    c.text((20, 14), "9:41", t("text"), 12.5, bold=True)
    for i in range(4):
        c.rect((W - 79 + i * 5, 25 - i * 2.4, W - 76 + i * 5, 26), fill=t("text"), radius=0.6)
    c.text((36, 59), "~/Cody tasks", t("text"), 13, mono=True, bold=True)
    c.text((36, 80), "7 files · TSX · 2m ago", t("muted"), 9.5, mono=True)
    for i in range(3):
        c.rect((15, 66 + i * 5, 33 if i != 1 else 27, 67.4 + i * 5), fill=t("text-dim"))
    for row in range(14):
        y = 130 + row * 20
        c.rect((32, y, 32 + (120 + (row * 37) % 190), y + 7), fill=t("muted"), alpha=0.20)
    c.rect((0, 0, W, H), fill="#000000", alpha=0.55)

    # the sheet itself
    DW = 300
    c.rect((0, 0, DW, H), fill=t("bg-elevated"))
    c.rect((DW - 1, 0, DW, H), fill=t("border-strong"))
    c.image_at((16, 16), MARK, 22, radius=5)
    c.text((48, 22), "~/Cody tasks", t("text-dim"), 12, mono=True)
    c.text((DW - 40, 18), "✕", t("text-dim"), 13, anchor="ma")

    def section(y, key, label, active=False, tail=None):
        if active:
            c.rect((10, y, DW - 10, y + 40), fill=t("surface-2"), radius=2 * squ)
            c.rect((10, y, 12, y + 40), fill=accent)
        c.text((18, y + 13), "[" + key + "]", accent if active else t("muted"), 10.5, mono=True)
        c.text((44, y + 11), label, t("text") if active else t("text-dim"), 14)
        if tail:
            c.circle((DW - 26, y + 20), 3, accent)
        return y + 40

    c.text((18, 68), "SECTIONS", t("muted"), 9.5, mono=True)
    y = 88
    y = section(y, "f", "Files", False, tail=True)
    y = section(y, "c", "Code", True)
    y = section(y, "r", "Run")
    y = section(y, "b", "Build")
    y = section(y, "a", "AI")

    c.text((18, y + 20), "WORKSPACE", t("muted"), 9.5, mono=True)
    y += 40
    for label in ("Switch workspace…", "Find in files…", "Settings…", "Project actions…"):
        c.text((18, y + 10), label, t("text-dim"), 13.5)
        if label == "Find in files…":
            c.text((DW - 30, y + 11), "⌘⇧F", t("muted"), 10.5, mono=True, anchor="ra")
        c.rect((18, y + 37, DW - 18, y + 38), fill=t("border"))
        y += 38

    c.rect((W / 2 - 46, H - 7.5, W / 2 + 46, H - 3), fill=t("text-dim"), radius=2.4, alpha=0.55)
    return c.image


def draw_pane(mode: str, skin: str, scheme: str, pane: str) -> Image.Image:
    """Render the Files / Run / AI screens, so a skin can be judged everywhere
    rather than just on the code surface."""
    tokens = {**TOKENS[mode], **parse_skin(skin)}
    palette = dict(PALETTES[scheme])
    if skin != "graphite" and "editor-bg" in tokens:
        palette["bg"] = tokens["editor-bg"]
    t = lambda k: tokens.get(k, TOKENS[mode].get(k, "#000000"))  # noqa: E731
    c = Canvas((W, H), t("bg-chrome"))

    # OS bar
    c.text((20, 14), "9:41", t("text"), 12.5, bold=True)
    for i in range(4):
        c.rect((W - 79 + i * 5, 25 - i * 2.4, W - 76 + i * 5, 26), fill=t("text"), radius=0.6)
    c.rect((W - 53, 18, W - 33, 26), fill=None, outline=t("text-dim"), radius=2.5, width=1)
    c.rect((W - 51, 20, W - 39, 24), fill=t("text"), radius=1)

    accent = parse_skin(skin).get("accent", tokens["accent"])
    if skin == "navy":
        # the same three-stop field the stylesheet paints
        for i in range(46):
            y = 46 + i * 16
            blend = i / 45
            base = (14 - 4 * blend, 27 - 7 * blend, 46 - 10 * blend)
            c.rect((0, y, W, y + 16), fill="#%02x%02x%02x" % tuple(int(v) for v in base))

    top = 46
    HEADER_H = 54
    c.text((36, top + 13), "~", t("muted"), 12, mono=True)
    c.text((47, top + 13), "/Cody tasks", t("text"), 13, mono=True, bold=True)
    c.text((36, top + 34), "7 files · TSX · 2m ago", t("muted"), 9.5, mono=True)
    for i in range(3):
        c.rect((15, top + 20 + i * 5, 33 if i != 1 else 27, top + 21.4 + i * 5), fill=t("text-dim"))
    c.rect((W - 82, top + 10, W - 48, top + 44), fill=accent, radius=10)
    ink = parse_skin(skin).get("accent-ink", tokens.get("accent-ink", "#04241c"))
    canvas = c
    canvas.polygon([(W - 69, top + 20), (W - 69, top + 34), (W - 58, top + 27)], fill=ink)
    for i in range(3):
        c.circle((W - 26, top + 21 + i * 6), 1.7, t("text-dim"))
    c.rect((0, top + HEADER_H - 1, W, top + HEADER_H), fill=t("border"))

    body_top = top + HEADER_H
    body_bottom = H - 10

    if pane == "files":
        # toolbar
        c.rect((0, body_top, W, body_top + 56), fill=t("bg-chrome"))
        c.rect((12, body_top + 9, W - 110, body_top + 47), fill=t("surface-2"), outline=t("border"), radius=11)
        c.text((26, body_top + 22), "⌕  Search files", t("muted"), 12.5)
        c.rect((W - 104, body_top + 9, W - 64, body_top + 47), fill=t("surface-2"), radius=11)
        c.text((W - 84, body_top + 23), "⊘", t("text-dim"), 12, mono=True, anchor="ma")
        c.rect((W - 58, body_top + 9, W - 12, body_top + 47), fill=t("surface-2"), radius=11)
        c.text((W - 35, body_top + 23), "+ New", t("text-dim"), 11.5, anchor="ma")
        c.rect((0, body_top + 55, W, body_top + 56), fill=t("border"))

        rows = [
            (0, "folder-open", "src", "6", True),
            (1, "file", "App.tsx", "", False),
            (1, "file", "Task.tsx", "", False),
            (1, "file", "styles.css", "", False),
            (0, "folder-open", "components", "3", True),
            (1, "file", "Card.tsx", "", False),
            (1, "file", "Header.tsx", "", False),
            (0, "folder", "scripts", "2", True),
            (0, "folder", "public", "1", True),
            (0, "file", "index.html", "", False),
            (0, "file", "README.md", "", False),
        ]
        y = body_top + 60
        for depth, kind, name, count, folder in rows:
            x = 12 + depth * 14
            if name == "App.tsx":
                c.rect((6, y, W - 6, y + 46), fill=accent, radius=10, alpha=0.09)
            if folder:
                c.rect((x, y + 15, x + 15, y + 28), fill=None, outline=t("text-dim"), radius=2, width=1.3)
                c.rect((x, y + 11, x + 7, y + 17), fill=None, outline=t("text-dim"), radius=1.5, width=1.3)
            else:
                c.rect((x + 2, y + 13, x + 13, y + 31), fill=None, outline=t("muted"), radius=2, width=1.2)
            name_col = t("text") if name == "App.tsx" else t("text-dim")
            c.text((x + 26, y + 16), name, name_col, 13, mono=not folder, bold=folder)
            if count:
                c.text((W - 62, y + 17), count, t("muted"), 10.5, mono=True, anchor="ra")
                c.text((W - 44, y + 14), "›", t("muted"), 12, anchor="ma")
            if name == "App.tsx":
                c.rect((W - 66, y + 12, W - 40, y + 34), fill=None, outline=t("border"), radius=8)
                c.text((W - 53, y + 17), "▶", accent, 9, anchor="ma")
            y += 46
        # footnote
        c.rect((0, body_bottom - 30, W, body_bottom), fill=t("bg-chrome"))
        c.rect((0, body_bottom - 30, W, body_bottom - 29), fill=t("border"))
        c.text((14, body_bottom - 20), "11 files · 3 folders · 5 languages", t("muted"), 10.5, mono=True)
        c.text((W - 14, body_bottom - 20), "entry: index.html", accent, 10.5, mono=True, anchor="ra")

    elif pane == "run":
        c.rect((0, body_top, W, body_top + 82), fill=t("bg-chrome"))
        c.text((14, body_top + 12), "ENTRY", t("muted"), 9.5, mono=True)
        c.rect((14, body_top + 28, W - 130, body_top + 66), fill=t("surface-2"), outline=t("border"), radius=11)
        c.text((26, body_top + 40), "src/App.tsx", t("text"), 12.5, mono=True)
        c.text((W - 152, body_top + 42), "⌄", t("text-dim"), 12, anchor="ma")
        c.rect((W - 116, body_top + 28, W - 14, body_top + 66), fill=accent, radius=11)
        c.text((W - 65, body_top + 40), "▶  Run", ink, 12.5, bold=True, anchor="ma")
        c.rect((0, body_top + 81, W, body_top + 82), fill=t("border"))

        # meta pills
        py = body_top + 94
        for label, tint in (("TSX", t("text-dim")), ("Browser", accent), ("finished", accent)):
            wpx = 26 + len(label) * 6.2
            c.rect((14 if label == "TSX" else None or 0, 0, 0, 0)) if False else None
        px = 14.0
        for label, tint in (("TSX", t("text-dim")), ("Browser", accent), ("finished", accent)):
            wpx = 20 + len(label) * 6.2
            c.rect((px, py, px + wpx, py + 22), fill=tint, radius=11, alpha=0.13)
            c.text((px + 9, py + 6), label, tint, 10, mono=True)
            px += wpx + 6

        # segmented
        c.rect((12, py + 32, W - 12, py + 72), fill=t("surface-2"), outline=t("border"), radius=11)
        c.rect((14, py + 34, (W - 12) / 2, py + 70), fill=t("surface"), radius=9)
        c.text((12 + (W - 24) / 4, py + 43), "◉ Preview", t("text"), 11.5, anchor="ma")
        c.text((W / 2 + (W - 24) / 4, py + 43), "▸ Output", t("muted"), 11.5, anchor="ma")

        # console
        cy = py + 84
        c.rect((12, cy, W - 12, body_bottom - 12), fill="#071120" if skin == "navy" else t("bg-chrome"), outline=t("border"), radius=14)
        lines = [
            ("12:04:02", "log", "Bundling 4 modules…"),
            ("12:04:02", "success", "bundle built in 214 ms"),
            ("12:04:03", "log", "Task added: Design on the bus"),
            ("12:04:03", "warn", "localStorage quota near limit"),
            ("12:04:04", "error", "TypeError: cannot read 'length' of undefined"),
            ("12:04:04", "system", "preview ready on port 5173"),
        ]
        ly = cy + 12
        colours = {"log": t("text-dim"), "success": accent, "warn": t("warn"), "error": t("error"), "system": t("muted")}
        for clock, level, text in lines:
            c.text((26, ly), clock, t("muted"), 9.5, mono=True)
            c.text((88, ly), text, colours[level], 10.5, mono=True)
            ly += 24

    elif pane == "ai":
        c.rect((0, body_top, W, body_top + 56), fill=t("bg-chrome"))
        c.rect((12, body_top + 10, 150, body_top + 46), fill=t("surface-2"), outline=t("border"), radius=11)
        c.rect((14, body_top + 12, 80, body_top + 44), fill=t("surface"), radius=9)
        c.text((47, body_top + 22), "✦ Chat", t("text"), 11.5, anchor="ma")
        c.text((112, body_top + 22), "◈ Crew", t("muted"), 11.5, anchor="ma")
        c.rect((W - 152, body_top + 12, W - 12, body_top + 44), fill=t("surface-2"), outline=t("border"), radius=11)
        c.circle((W - 138, body_top + 28), 3, accent)
        c.text((W - 128, body_top + 21), "free · 3 models", t("text-dim"), 10, mono=True)
        c.rect((0, body_top + 55, W, body_top + 56), fill=t("border"))

        ty = body_top + 70
        # user bubble
        c.rect((W - 250, ty, W - 14, ty + 40), fill=accent, radius=14, alpha=0.13)
        c.text((W - 238, ty + 12), "add a dark mode toggle to the header", t("text"), 12)
        ty += 54
        # agent block with avatar and markdown
        c.rect((14, ty, 37, ty + 23), fill=t("surface-2"), outline=t("border"), radius=7)
        c.text((25.5, ty + 7), "P", accent, 10.5, mono=True, anchor="ma")
        c.text((46, ty + 6), "Planner", t("text"), 11.5, bold=True)
        c.text((100, ty + 7), "gemini-3.6-flash", t("muted"), 9.5, mono=True)
        ty += 30
        body = [
            ("Adding a toggle that writes to localStorage.", t("text")),
            ("", t("text")),
            ("•  1 file to change", t("text")),
            ("•  App.tsx — header row", t("text-dim")),
        ]
        for text, colour in body:
            c.text((46, ty), text, colour, 12)
            ty += 21
        ty += 8
        # tool chips
        cx = 46.0
        for label in ("Patch file", "Check problems"):
            wpx = 20 + len(label) * 6
            c.rect((cx, ty, cx + wpx, ty + 22), fill=t("surface-2"), outline=t("border"), radius=7)
            c.text((cx + 8, ty + 6), "✓ " + label, t("text-dim"), 9.5, mono=True)
            cx += wpx + 6
        ty += 36
        c.rect((14, ty, 37, ty + 23), fill=t("surface-2"), outline=t("border"), radius=7)
        c.text((25.5, ty + 7), "T", accent, 10.5, mono=True, anchor="ma")
        c.text((46, ty + 4), "Tester", t("text"), 11.5, bold=True)
        c.text((46, ty + 20), "Runs clean. 0 errors, 0 warnings.", t("text-dim"), 11.5)

        # composer
        comp_top = body_bottom - 92
        c.rect((0, comp_top, W, body_bottom), fill=t("bg-chrome"))
        c.rect((0, comp_top, W, comp_top + 1), fill=t("border"))
        c.rect((12, comp_top + 12, W - 12, comp_top + 60), fill=t("surface-2"), outline=t("border"), radius=15)
        c.text((26, comp_top + 28), "Ask or ask for a change…", t("muted"), 12)
        c.rect((W - 50, comp_top + 20, W - 19, comp_top + 51), fill=accent, radius=10)
        c.text((W - 34.5, comp_top + 27), "➤", ink, 11, anchor="ma")
        c.text((14, comp_top + 70), "Planner → Coder A → Coder B → Tester · free", t("muted"), 9.5, mono=True)

    return c.image


def main_panes() -> None:
    out = ROOT / "docs" / "cody-panes.png"
    frames = [("Menu", downscale(draw_drawer("dark", "terminal", "dark"), W * SCALE))]
    for pane in ("files", "run", "ai"):
        frames.append((pane[0].upper() + pane[1:], downscale(draw_pane("dark", "navy", "onedark", pane), W * SCALE)))
    pad, gap, radius = 26, 20, 42
    col_w = frames[0][1].width
    width = pad * 2 + col_w * len(frames) + gap * (len(frames) - 1)
    height = pad * 2 + frames[0][1].height + 46
    stage = Image.new("RGBA", (width, height), (7, 10, 16, 255))
    for index, (label, frame) in enumerate(frames):
        x = pad + index * (col_w + gap)
        mask = Image.new("L", frame.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=radius, fill=255)
        stage.paste(frame, (x, pad), mask)
        ImageDraw.Draw(stage).rounded_rectangle(
            (x, pad, x + col_w - 1, pad + frame.height - 1), radius=radius, outline=(38, 52, 74, 255), width=2
        )
        ImageDraw.Draw(stage).text(
            (x + col_w / 2, pad + frame.height + 14), label,
            font=ImageFont.truetype(FONT_UI, 17), fill=(226, 231, 238, 255), anchor="ma",
        )
    stage.convert("RGB").save(out)
    print(f"wrote {out} ({stage.width}x{stage.height})")


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "docs" / "cody-skins.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    frames = []
    for skin, mode, scheme in SKINS:
        frame = downscale(draw_screen(mode, skin, scheme), W * SCALE)
        label = skin[0].upper() + skin[1:]
        frames.append((label, frame))

    pad, gap, radius = 26, 20, 42
    col_w = frames[0][1].width
    width = pad * 2 + col_w * len(frames) + gap * (len(frames) - 1)
    caption_h = 46
    height = pad * 2 + frames[0][1].height + caption_h
    stage = Image.new("RGBA", (width, height), (9, 11, 14, 255))

    for index, (label, frame) in enumerate(frames):
        x = pad + index * (col_w + gap)
        shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (x + 3, pad + 14, x + col_w + 3, pad + frame.height + 22), radius=radius, fill=(0, 0, 0, 180)
        )
        stage = Image.alpha_composite(stage, shadow.filter(ImageFilter.GaussianBlur(20)))
        mask = Image.new("L", frame.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, frame.width - 1, frame.height - 1), radius=radius, fill=255
        )
        stage.paste(frame, (x, pad), mask)
        ImageDraw.Draw(stage).rounded_rectangle(
            (x, pad, x + col_w - 1, pad + frame.height - 1), radius=radius,
            outline=(42, 48, 58, 255), width=2,
        )
        draw = ImageDraw.Draw(stage)
        draw.text(
            (x + col_w / 2, pad + frame.height + 14),
            label,
            font=ImageFont.truetype(FONT_UI, 17),
            fill=(226, 231, 238, 255),
            anchor="ma",
        )

    stage.convert("RGB").save(out)
    print(f"wrote {out} ({stage.width}x{stage.height})")
    main_panes()


if __name__ == "__main__":
    main()
