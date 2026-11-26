"""Trace the FILA20 logo (og image, black on white) into AE-ready paths.

Writes logo.json: {w, h, parts: [{name, paths: [{v, i, o, closed}]}], ring: {cx, cy, r, stroke}}
in logo units (px of the 4x-upscaled crop), origin at the logo's centre.
"""
import json, sys
import numpy as np
from PIL import Image
import potrace

SRC = "/Users/ale/styles/fila20/extract/imagery/01-og-image-fila20_social_media_logo.jpg"
UP = 4
im = Image.open(SRC).convert("L")
bw = np.array(im) < 128
ys, xs = np.where(bw)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
crop = im.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4))
crop = crop.resize((crop.width * UP, crop.height * UP), Image.LANCZOS)
arr = np.array(crop) < 128
H, W = arr.shape
bm = potrace.Bitmap(arr)
plist = bm.trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.2)

cx0, cy0 = W / 2, H / 2
def P(p): return [round(p.x - cx0, 2), round(p.y - cy0, 2)]

paths = []
for curve in plist:
    v, ins, outs = [], [], []
    start = curve.start_point
    pts = []  # (vertex, in_tangent_abs, out_tangent_abs) built segment by segment
    cur = start
    segs = list(curve.segments)
    # each segment ends at end_point; corner: cur -> c -> end (straight lines)
    verts = []  # list of dict(v, i, o) absolute
    verts.append({"v": P(cur), "i": P(cur), "o": P(cur)})
    for s in segs:
        if s.is_corner:
            verts[-1]["o"] = verts[-1]["v"]
            verts.append({"v": P(s.c), "i": P(s.c), "o": P(s.c)})
            verts.append({"v": P(s.end_point), "i": P(s.end_point), "o": P(s.end_point)})
        else:
            verts[-1]["o"] = P(s.c1)
            verts.append({"v": P(s.end_point), "i": P(s.c2), "o": P(s.end_point)})
    # closed: last vertex == first
    last = verts.pop()
    verts[0]["i"] = last["i"]
    rel = {"v": [], "i": [], "o": []}
    for q in verts:
        rel["v"].append(q["v"])
        rel["i"].append([round(q["i"][0] - q["v"][0], 2), round(q["i"][1] - q["v"][1], 2)])
        rel["o"].append([round(q["o"][0] - q["v"][0], 2), round(q["o"][1] - q["v"][1], 2)])
    xs_ = [p[0] for p in rel["v"]]; ys_ = [p[1] for p in rel["v"]]
    paths.append({"bbox": [min(xs_), min(ys_), max(xs_), max(ys_)], **rel})

# drop the crop-border contour, then: ring = the two biggest; holes attach to the shape whose bbox contains them
def area(q): b = q["bbox"]; return (b[2] - b[0]) * (b[3] - b[1])
def inside(a, b): return a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3]
paths = [q for q in paths if not (q["bbox"][2] - q["bbox"][0] > 0.95 * W)]
paths.sort(key=area, reverse=True)
ring_o, ring_i, rest = paths[0], paths[1], paths[2:]
shapes = []
for q in sorted(rest, key=area, reverse=True):
    host = next((sh for sh in shapes if inside(q["bbox"], sh["paths"][0]["bbox"])), None)
    if host: host["paths"].append(q)
    else: shapes.append({"paths": [q], "cx": (q["bbox"][0] + q["bbox"][2]) / 2})
digits_and_letters = sorted(shapes, key=lambda sh: sh["cx"])
rb_o, rb_i = ring_o["bbox"], ring_i["bbox"]
ro = (rb_o[2] - rb_o[0] + rb_o[3] - rb_o[1]) / 4
ri = (rb_i[2] - rb_i[0] + rb_i[3] - rb_i[1]) / 4
ringd = {"cx": round((rb_o[0] + rb_o[2]) / 2, 2), "cy": round((rb_o[1] + rb_o[3]) / 2, 2),
         "r": round((ro + ri) / 2, 2), "stroke": round(ro - ri, 2)}
names = ["F", "I", "L", "A", "2", "0"]
out = {"w": W, "h": H, "ring": ringd, "parts": []}
for n, part in zip(names, digits_and_letters):
    out["parts"].append({"name": n, "paths": [{k: q[k] for k in ("v", "i", "o")} for q in part["paths"]]})
print(len(plist), "contours;", [p["name"] + ":" + str(len(p["paths"])) for p in out["parts"]], "ring", ringd, "size", W, H, file=sys.stderr)
json.dump(out, open("/Users/ale/styles/fila20/logo/logo.json", "w"))
