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
    keys = ["bg", "bg-elevated", "surface", "surface-2", "surface-3", "border", "border-strong",
            "text", "text-dim", "muted", "accent", "editor-bg", "warn", "error"]
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
    """Read the real syntax scheme (VS Code Dark+/Light+) out of syntaxThemes.ts."""
    src = (ROOT / "src/editor/syntaxThemes.ts").read_text()
    out: dict[str, dict[str, str]] = {}
    for mode, name in (("dark", "VSCODE_DARK"), ("light", "VSCODE_LIGHT")):
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

def draw_screen(mode: str) -> Image.Image:
    t = lambda k: TOKENS[mode][k]  # noqa: E731
    p = lambda k: PALETTES[mode][k]  # noqa: E731
    canvas = Canvas((W, H), t("bg"))
    c = canvas

    # ---------------- status bar ----------------
    c.text((20, 14), "9:41", t("text"), 12.5, bold=True)
    for i in range(4):
        c.rect((W - 79 + i * 5, 25 - i * 2.4, W - 76 + i * 5, 26), fill=t("text"), radius=0.6)
    c.rect((W - 53, 18, W - 33, 26), fill=None, outline=t("text-dim"), radius=2.5, width=1)
    c.rect((W - 51, 20, W - 39, 24), fill=t("text"), radius=1)

    # ---------------- app header ----------------
    top = 46
    c.rect((0, top, W, top + 52), fill=t("bg"))
    c.line([(20, top + 20), (14, top + 27), (20, top + 34)], fill=t("text-dim"), width=2)
    c.text((28, top + 11), "Cody tasks", t("text"), 15.5, bold=True)
    c.text((28, top + 31), "src/App.tsx · TypeScript JSX · saved just now", t("muted"), 10.5)
    for i in range(3):
        c.circle((W - 22, top + 20 + i * 6), 1.8, t("text-dim"))
    c.rect((0, top + 51, W, top + 52), fill=t("border"))

    # ---------------- tab strip ----------------
    tabs_top = top + 52
    c.rect((0, tabs_top, W, tabs_top + 38), fill=t("surface"))
    c.rect((0, tabs_top + 37, W, tabs_top + 38), fill=t("border"))

    tabs = [("App.tsx", "tsx", True), ("Task.tsx", "tsx", False), ("styles.css", "css", False)]
    x = 8.0
    for name, mark_key, active in tabs:
        width = 42 + len(name) * 6.6
        if active:
            c.rect((x, tabs_top + 5, x + width, tabs_top + 40), fill=p("bg"), outline=t("border"), radius=8)
            c.rect((x + 1.2, tabs_top + 35, x + width - 1.2, tabs_top + 39), fill=p("bg"))
        draw_mark(canvas, mark_key, x + 8, tabs_top + 12.6, 15, mode)
        c.text((x + 29, tabs_top + 12.5), name, t("text") if active else t("muted"), 11.5, mono=True)
        if active:
            c.circle((x + width - 12, tabs_top + 20), 2.2, t("muted"))
        x += width + 5
    c.rect((W - 39, tabs_top + 7, W - 9, tabs_top + 31), fill=t("surface-2"), radius=8)
    c.rect((W - 33, tabs_top + 14, W - 24, tabs_top + 24), fill=None, outline=t("muted"), radius=2, width=1.2)
    c.rect((W - 22, tabs_top + 14, W - 16, tabs_top + 24), fill=None, outline=t("muted"), radius=2, width=1.2)

    # ---------------- editor ----------------
    ed_top = tabs_top + 38
    RAIL_H = 5 + 34 + 4 + 36 + 6
    STATUS_H = 26
    TABBAR_H = 62
    ed_bottom = H - TABBAR_H - STATUS_H - RAIL_H
    c.rect((0, ed_top, W, ed_bottom), fill=p("bg"))

    font_size = 12.6
    line_h = 20.4
    gutter_w = 30.0
    text_x = gutter_w + 6
    caret_col = 21
    code_font = font(FONT_MONO, font_size)
    char_w = code_font.getlength("0") / SS
    cols = int((W - text_x - 16) / char_w)

    rows: list[tuple[int, int, list[tuple[str, str]], bool]] = []  # (line no, row in line, runs, first)
    for number, line in enumerate(SNIPPET.split("\n"), start=1):
        wrapped = wrap_runs(tokenize(line), cols)
        for index, runs in enumerate(wrapped):
            rows.append((number, index, runs, index == 0))

    active_line = 14
    active_rows = [i for i, row in enumerate(rows) if row[0] == active_line]
    for row_index in active_rows:
        y = ed_top + 8 + row_index * line_h
        c.rect((0, y, W, y + line_h), fill=p("activeLine"))
        c.rect((0, y, 2, y + line_h), fill=t("accent"))

    max_rows = int((ed_bottom - ed_top - 10) / line_h)
    for row_index, (number, part, runs, first) in enumerate(rows[:max_rows]):
        y = ed_top + 8 + row_index * line_h
        if first:
            is_active = number == active_line
            c.text((gutter_w - 9, y + 3.4), str(number),
                   p("gutterActive") if is_active else p("gutter"), 10.2, mono=True, anchor="ra",
                   bold=is_active)
        cx = text_x
        for text, kind in runs:
            c.text((cx, y + 1.6), text, p(KIND_TO_TOKEN.get(kind, "fg")), font_size, mono=True)
            cx += code_font.getlength(text) / SS
        if number == active_line and part == 0:
            caret_x = text_x + char_w * (caret_col - 1)
            c.rect((caret_x, y + 2.5, caret_x + 1.8, y + line_h - 2.5), fill=p("fg"), radius=0.6)

    c.rect((gutter_w, ed_top, gutter_w + 0.7, ed_bottom), fill=t("surface-3"))

    # ---------------- status strip ----------------
    st = ed_bottom
    c.rect((0, st, W, st + 26), fill=t("surface"))
    c.rect((0, st, W, st + 1), fill=t("border"))
    c.text((10, st + 7.5), "Ln 14, Col 21", t("text-dim"), 9.4, mono=True)
    c.text((95, st + 7.5), "·  34 lines", t("muted"), 9.4, mono=True)
    c.text((153, st + 7.5), "·  TSX", t("text-dim"), 9.4, mono=True)
    c.text((190, st + 7.5), "·  Spaces: 2", t("muted"), 9.4, mono=True)
    c.rect((W - 64, st + 5.5, W - 9, st + 20.5), fill=None, outline=t("border"), radius=7.5)
    c.text((W - 36.5, st + 9.4), "Saved", t("muted"), 9, mono=True, anchor="ma")

    # ---------------- keyboard rail (two rows, like the DOM) ----------------
    rail = st + 26
    rail_h = RAIL_H
    c.rect((0, rail, W, rail + rail_h), fill=t("surface-2"))
    c.rect((0, rail, W, rail + 1), fill=t("border"))

    # row 1 — actions + pinned Run
    ax = 6.0
    for glyph in ["↺", "↻", "⇥", "⌕", "Aa"]:
        c.rect((ax, rail + 5, ax + 33, rail + 39), radius=9)
        c.text((ax + 16.5, rail + 13), glyph, t("text-dim"), 14, mono=True, anchor="ma")
        ax += 37
    # ⌘ and ⌄ are pushed right of the action cluster on narrow screens
    c.rect((ax, rail + 5, ax + 33, rail + 39), radius=9)
    c.text((ax + 16.5, rail + 13), "⌘", t("text-dim"), 14, mono=True, anchor="ma")

    ink = "#ffffff" if mode == "light" else "#06251c"
    c.rect((W - 66, rail + 5, W - 6, rail + 39), fill=t("accent"), radius=10)
    canvas.polygon([(W - 54, rail + 15.5), (W - 54, rail + 28.5), (W - 43, rail + 22)], fill=ink)
    c.text((W - 38, rail + 13.5), "Run", ink, 12, bold=True)

    # row 2 — scrollable symbol keys
    keys = ["⇥", "{", "}", "(", ")", "[", "]", "<", ">", "=", '"', "'"]
    kx = 6.0
    row2 = rail + 5 + 34 + 4
    for key in keys:
        if kx + 36 > W - 6:
            break
        c.rect((kx, row2, kx + 36, row2 + 36), fill=t("surface-3"), outline=t("border"), radius=9)
        c.text((kx + 18, row2 + 9), key, t("text"), 14, mono=True, anchor="ma")
        kx += 40
    # fade the cut-off edge of the rail
    for i in range(10):
        c.rect((kx - 2 + i * 2.2, row2, kx + i * 2.2, row2 + 36), fill=t("surface-2"), alpha=0.06 * (10 - i))
    c.rect((kx + 2, row2 + 6, kx + 34, row2 + 30), fill=None, outline=t("border"), radius=8, width=1, alpha=0.5)
    c.text((kx + 18, row2 + 9), "›", t("muted"), 14, mono=True, anchor="ma")

    # ---------------- tab bar ----------------
    bar = rail + rail_h
    c.rect((0, bar, W, H), fill=t("bg"))
    c.rect((0, bar, W, bar + 1), fill=t("border"))
    items = [("files", "Files", False), ("code", "Code", True), ("run", "Run", False), ("build", "Build", False)]
    slot = W / 4
    for index, (icon, label, active) in enumerate(items):
        cx = slot * index + slot / 2
        ink_c = t("accent") if active else t("muted")
        if active:
            c.rect((cx - 13, bar, cx + 13, bar + 2.6), fill=t("accent"), radius=1.3)
        if icon == "code":
            c.line([(cx - 8, bar + 18), (cx - 3, bar + 23), (cx - 8, bar + 28)], fill=ink_c, width=1.7)
            c.line([(cx + 8, bar + 18), (cx + 3, bar + 23), (cx + 8, bar + 28)], fill=ink_c, width=1.7)
        elif icon == "files":
            c.rect((cx - 8, bar + 19, cx + 8, bar + 28), fill=None, outline=ink_c, radius=2, width=1.4)
            c.rect((cx - 4, bar + 16, cx + 4, bar + 20), fill=None, outline=ink_c, radius=1.5, width=1.4)
        elif icon == "run":
            c.line([(cx - 7, bar + 18), (cx - 2, bar + 23), (cx - 7, bar + 28)], fill=ink_c, width=1.6)
            c.line([(cx, bar + 28), (cx + 8, bar + 28)], fill=ink_c, width=1.6)
        else:
            c.text((cx, bar + 16.5), "✦", ink_c, 14, anchor="ma")
        c.text((cx, bar + 33), label, ink_c, 9.6, bold=active, anchor="ma")

    # home indicator
    c.rect((W / 2 - 46, H - 7.5, W / 2 + 46, H - 3), fill=t("text-dim"), radius=2.4, alpha=0.55)
    return canvas.image


def downscale(image: Image.Image, width: int) -> Image.Image:
    return image.resize((width, int(image.height * width / image.width)), Image.LANCZOS)


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "docs" / "cody-editor.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    frames = [downscale(draw_screen(mode), W * SCALE) for mode in ("dark", "light")]
    pad, gap, radius = 30, 28, 42
    width = pad * 2 + frames[0].width * 2 + gap
    height = pad * 2 + frames[0].height
    stage = Image.new("RGBA", (width, height), (7, 9, 13, 255))

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-300, -460, 780, 460), fill=(92, 225, 185, 24))
    gd.ellipse((width - 700, -420, width + 200, 520), fill=(139, 124, 255, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    stage = Image.alpha_composite(stage, glow)

    for index, frame in enumerate(frames):
        x = pad + index * (frame.width + gap)
        shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (x + 4, pad + 16, x + frame.width + 4, pad + frame.height + 26), radius=radius, fill=(0, 0, 0, 170)
        )
        stage = Image.alpha_composite(stage, shadow.filter(ImageFilter.GaussianBlur(22)))
        mask = Image.new("L", frame.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, frame.width - 1, frame.height - 1), radius=radius, fill=255
        )
        stage.paste(frame, (x, pad), mask)
        ImageDraw.Draw(stage).rounded_rectangle(
            (x, pad, x + frame.width - 1, pad + frame.height - 1), radius=radius,
            outline=(40, 48, 62, 255), width=2,
        )

    stage.convert("RGB").save(out)
    print(f"wrote {out} ({stage.width}x{stage.height})")


if __name__ == "__main__":
    main()
