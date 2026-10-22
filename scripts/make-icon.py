#!/usr/bin/env python3
"""Draw a small 128x128 RGBA Visor Cinema launcher icon using only stdlib."""
import math
import struct
import sys
import zlib

WIDTH = HEIGHT = 128
TARGET = sys.argv[1] if len(sys.argv) > 1 else "icon-128.png"

def inside_rounded(x, y, left, top, right, bottom, rad):
    if not (left <= x <= right and top <= y <= bottom):
        return False
    cx = max(left + rad, min(x, right - rad))
    cy = max(top + rad, min(y, bottom - rad))
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2

def inside_triangle(px, py, ax, ay, bx, by, cx, cy):
    def sign(x1, y1, x2, y2, x3, y3):
        return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
    a = sign(px, py, ax, ay, bx, by)
    b = sign(px, py, bx, by, cx, cy)
    c = sign(px, py, cx, cy, ax, ay)
    return not ((a < 0 or b < 0 or c < 0) and (a > 0 or b > 0 or c > 0))

def pixel(x, y):
    if not inside_rounded(x, y, 0, 0, 127, 127, 28):
        return (0, 0, 0, 0)
    # Deep blue rounded app square.
    base = (13 + y // 32, 26 + y // 20, 44 + y // 24, 255)
    # Cyan glasses outline.
    outer_left = inside_rounded(x, y, 15, 39, 64, 89, 13)
    inner_left = inside_rounded(x, y, 22, 46, 57, 82, 8)
    outer_right = inside_rounded(x, y, 64, 39, 113, 89, 13)
    inner_right = inside_rounded(x, y, 71, 46, 106, 82, 8)
    if (outer_left and not inner_left) or (outer_right and not inner_right):
        return (98, 219, 255, 255)
    if 57 < x < 71 and 47 < y < 54:
        return (98, 219, 255, 255)
    # Cinematic play glyph spans the center.
    if inside_triangle(x, y, 49, 46, 49, 86, 85, 66):
        return (244, 253, 255, 255)
    return base

raw = bytearray()
for y in range(HEIGHT):
    raw.append(0)
    for x in range(WIDTH):
        raw.extend(pixel(x, y))

def chunk(t, payload):
    return struct.pack(">I", len(payload)) + t + payload + struct.pack(">I", zlib.crc32(t + payload) & 0xffffffff)

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")
with open(TARGET, "wb") as f:
    f.write(png)
print("Generated", TARGET, len(png), "bytes")
