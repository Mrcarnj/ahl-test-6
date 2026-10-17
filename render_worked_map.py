"""Render assets/images/worked-map.png, the US + Canada outline behind the
Profile "Where I've Worked" map.

Albers equal-area conic on a sphere. The app places pins with the same math
(src/lib/workedMap.ts), so after a re-render copy the printed JSON into
MAP_META there.

Input is Natural Earth 1:50m, downloaded into GEO_DIR:
  ne_50m_admin_1_states_provinces_lakes.geojson -> admin1.geojson
  ne_50m_lakes.geojson                          -> lakes.geojson
from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson

  python3 render_worked_map.py GEO_DIR assets/images/worked-map.png meta.json 3600 57.5

The last two arguments are the image width and the latitude the north edge is
cropped at (the arctic would squash the rest; every AHL city is below 52N).
Requires Pillow.
"""
import json, math, sys
from PIL import Image, ImageDraw

geo_dir, out_png, out_meta = sys.argv[1], sys.argv[2], sys.argv[3]
WIDTH = int(sys.argv[4]) if len(sys.argv) > 4 else 3000
SS = 3  # supersample factor

LON0, LAT0, LAT1, LAT2 = -96.0, 40.0, 30.0, 60.0
# Projected bounding box (lon/lat corners only seed it; we crop in x/y).
CROP = dict(north_lat=float(sys.argv[5]) if len(sys.argv) > 5 else 62.0)

r = math.radians
n = (math.sin(r(LAT1)) + math.sin(r(LAT2))) / 2
C = math.cos(r(LAT1)) ** 2 + 2 * n * math.sin(r(LAT1))
rho0 = math.sqrt(C - 2 * n * math.sin(r(LAT0))) / n

def proj(lon, lat):
    rho = math.sqrt(C - 2 * n * math.sin(r(lat))) / n
    th = n * r(lon - LON0)
    return rho * math.sin(th), -(rho0 - rho * math.cos(th))  # y down

feats = json.load(open(f"{geo_dir}/admin1.geojson"))["features"]
feats = [f for f in feats if f["properties"]["adm0_a3"] in ("USA", "CAN")
         and f["properties"].get("postal") != "HI"]
lakes = json.load(open(f"{geo_dir}/lakes.geojson"))["features"]

def rings(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    return [ring for poly in geom["coordinates"] for ring in poly]

# Bounds: x from the whole set, y cropped at north_lat along the central meridian
# (Alaska/arctic tips are clipped by the image edge).
xs, ys = [], []
for f in feats:
    for ring in rings(f["geometry"]):
        for lon, lat in ring:
            if lat <= CROP["north_lat"] and lon > -140:
                x, y = proj(lon, lat); xs.append(x); ys.append(y)
pad = 0.01
minx, maxx = min(xs) - pad, max(xs) + pad
miny, maxy = min(ys) - pad, max(ys) + pad
# north edge: crop
miny = proj(LON0, CROP["north_lat"])[1]
scale = WIDTH / (maxx - minx)
HEIGHT = round((maxy - miny) * scale)

W, H = WIDTH * SS, HEIGHT * SS
img = Image.new("RGB", (W, H), (0, 0, 0))
d = ImageDraw.Draw(img)

def px(lon, lat):
    x, y = proj(lon, lat)
    return ((x - minx) * scale * SS, (y - miny) * scale * SS)

FILL = (28, 28, 31)
BORDER = (92, 92, 100)
d_lw = max(1, round(1.1 * SS * WIDTH / 2400))  # same look at any WIDTH
for f in feats:
    for ring in rings(f["geometry"]):
        d.polygon([px(*p) for p in ring], fill=FILL)
# Great Lakes etc. back to background
for f in lakes:
    if f["properties"].get("scalerank", 9) > 2:
        continue
    for ring in rings(f["geometry"]):
        pts = [px(*p) for p in ring]
        d.polygon(pts, fill=(0, 0, 0))
for f in feats:
    for ring in rings(f["geometry"]):
        pts = [px(*p) for p in ring]
        d.line(pts + [pts[0]], fill=BORDER, width=d_lw, joint="curve")

img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
img = img.quantize(colors=32)
img.save(out_png, optimize=True)
json.dump(dict(lon0=LON0, lat0=LAT0, lat1=LAT1, lat2=LAT2, minX=minx, minY=miny,
               maxX=maxx, maxY=maxy, width=WIDTH, height=HEIGHT), open(out_meta, "w"), indent=2)
print(WIDTH, HEIGHT)
