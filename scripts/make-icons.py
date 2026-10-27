#!/usr/bin/env python3
"""Render Cody's PNG app icons without any external image libraries.

Draws the same mark as public/icon.svg: a rounded dark tile with a mint/violet
chevron pair and a mint dot, then encodes the result as a PNG (zlib + struct).
"""
import math
import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / 'public'
SS = 3  # supersampling factor


def lerp(a, b, t):
    return a + (b - a) * t


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def rounded_rect_alpha(x, y, w, h, size, radius):
    """Coverage of a rounded rect centred in a size x size canvas."""
    cx, cy = size / 2, size / 2
    dx = abs(x - cx) - (w / 2 - radius)
    dy = abs(y - cy) - (h / 2 - radius)
    if dx < 0 and dy < 0:
        return 1.0
    outside = math.hypot(max(dx, 0), max(dy, 0))
    return max(0.0, min(1.0, radius - outside + 0.5))


def segment_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length2 = vx * vx + vy * vy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def draw(size):
    """Return RGBA float buffer at `size` with the icon drawn."""
    scale = size / 512 * SS
    px_size = int(size * SS)
    buf = [[(0.0, 0.0, 0.0, 0.0)] * px_size for _ in range(px_size)]

    bg_top = hex_rgb('#171b22')
    bg_bottom = hex_rgb('#0b0d10')
    mint = hex_rgb('#5ce1b9')
    violet = hex_rgb('#8b7cff')
    gold = hex_rgb('#ffd166')

    def unit(v):
        return v * scale

    # chevrons
    left = [(unit(196), unit(172)), (unit(112), unit(256)), (unit(196), unit(340))]
    right = [(unit(316), unit(172)), (unit(400), unit(256)), (unit(316), unit(340))]
    stroke = unit(34) / 2
    dot_center = (unit(256), unit(256))
    dot_radius = unit(22)

    for y in range(px_size):
        for x in range(px_size):
            pxf = x + 0.5
            pyf = y + 0.5
            # tile
            tile_a = rounded_rect_alpha(pxf, pyf, unit(512), unit(512), px_size, unit(112))
            if tile_a <= 0:
                continue
            t = (pxf + pyf) / (2 * px_size)
            color = mix(bg_top, bg_bottom, t)
            alpha = tile_a

            # chevron coverage
            a_left = stroke - min(
                segment_distance(pxf, pyf, *left[0], *left[1]),
                segment_distance(pxf, pyf, *left[1], *left[2]),
            )
            a_right = stroke - min(
                segment_distance(pxf, pyf, *right[0], *right[1]),
                segment_distance(pxf, pyf, *right[1], *right[2]),
            )
            chevron_cov = max(0.0, min(1.0, a_left + 0.5), min(1.0, a_right + 0.5))
            if chevron_cov > 0:
                grad = (pxf + pyf) / (2 * px_size)
                accent = mix(violet, mint, grad * 1.1)
                accent = mix(accent, gold, max(0.0, grad - 0.65) * 2.2)
                color = mix(color, accent, chevron_cov)

            dot_cov = max(0.0, min(1.0, dot_radius - math.hypot(pxf - dot_center[0], pyf - dot_center[1]) + 0.5))
            if dot_cov > 0:
                color = mix(color, mint, dot_cov)

            buf[y][x] = (color[0], color[1], color[2], alpha)
    return buf, px_size


def downsample(buf, px_size, out_size):
    factor = px_size // out_size
    rows = []
    for y in range(out_size):
        row = bytearray()
        for x in range(out_size):
            r = g = b = a = 0.0
            for sy in range(factor):
                for sx in range(factor):
                    pr, pg, pb, pa = buf[y * factor + sy][x * factor + sx]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            n = factor * factor
            if a > 0:
                row += bytes((int(r / a), int(g / a), int(b / a), int(a / n * 255)))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        payload = tag + data
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)


def make(name, size):
    buf, px_size = draw(size)
    rows = downsample(buf, px_size, size)
    write_png(PUBLIC / name, rows, size)
    print('wrote', PUBLIC / name)


if __name__ == '__main__':
    make('icon-192.png', 192)
    make('icon-512.png', 512)
    make('icon-maskable-512.png', 512)
