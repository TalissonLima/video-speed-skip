#!/usr/bin/env python3
"""Generate the PNG icons (stdlib only). Dev tool, not shipped in the extension."""
import struct, zlib, pathlib

SS = 4  # supersampling

def tri(p, a, b, c):
    def s(p1, p2, p3): return (p1[0]-p3[0])*(p2[1]-p3[1]) - (p2[0]-p3[0])*(p1[1]-p3[1])
    d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

def in_round_rect(x, y, r=0.22):
    cx, cy = min(max(x, r), 1 - r), min(max(y, r), 1 - r)
    return (x-cx)**2 + (y-cy)**2 <= r*r

def white(x, y):
    p = (x, y)
    return (tri(p, (.20, .28), (.20, .72), (.46, .5)) or
            tri(p, (.44, .28), (.44, .72), (.70, .5)) or
            (.74 <= x <= .81 and .28 <= y <= .72))

def pixel(x, y):
    if not in_round_rect(x, y): return (0, 0, 0, 0)
    if white(x, y): return (255, 255, 255, 255)
    t = (x + y) / 2  # indigo -> violet
    return (int(99 + (168-99)*t), int(102 + (85-102)*t), int(241 + (247-241)*t), 255)

def render(size):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(SS):
                for si in range(SS):
                    r, g, b, a = pixel((i + (si+.5)/SS)/size, (j + (sj+.5)/SS)/size)
                    acc[0] += r*a; acc[1] += g*a; acc[2] += b*a; acc[3] += a
            n = SS*SS
            a = acc[3] / n
            row += bytes([int(acc[k]/acc[3]) if acc[3] else 0 for k in range(3)] + [int(a)])
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "src" / "icons"
out.mkdir(parents=True, exist_ok=True)
for s in (16, 32, 48, 128):
    (out / f"icon-{s}.png").write_bytes(render(s))
    print("wrote", f"icon-{s}.png")

# Store-only icon (Opera Add-ons asks for 64x64). It is not part of the package, so it lives with the store assets.
promo = root / "docs" / "store" / "promo"
promo.mkdir(parents=True, exist_ok=True)
(promo / "icon-64x64.png").write_bytes(render(64))
print("wrote docs/store/promo/icon-64x64.png")
