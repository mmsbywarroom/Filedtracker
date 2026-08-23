/**
 * Known ECI delimitation corrections applied on top of public AC GIS files.
 * Source: Delimitation Order 2008 — Qadian AC-6 includes Dhariwal (MCl).
 * Public post-2008 shapefiles incorrectly place Dhariwal inside Gurdaspur AC-4.
 *
 * Re-apply after regenerating punjab-assemblies.geojson from shapefile:
 *   python scripts/patch-qadian-dhariwal.py
 */
from shapely.geometry import shape, mapping, box, Point
from shapely.ops import unary_union
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "boundaries" / "punjab-assemblies.geojson"

def main():
    geo = json.loads(PATH.read_text(encoding="utf-8"))
    q = next(f for f in geo["features"] if f["properties"]["acName"] == "Qadian")
    g = next(f for f in geo["features"] if f["properties"]["acName"] == "Gurdaspur")
    q_poly = shape(q["geometry"])
    g_poly = shape(g["geometry"])
    dhariwal = box(75.295, 31.935, 75.355, 31.975)
    to_move = dhariwal.difference(q_poly)
    q["geometry"] = mapping(unary_union([q_poly, to_move]).buffer(0))
    g["geometry"] = mapping(g_poly.difference(dhariwal).buffer(0))
    geo["name"] = "Punjab Assembly Constituencies (post-2008) + Dhariwal->Qadian ECI correction"
    PATH.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
    p = Point(75.312766, 31.952441)
    assert p.within(shape(q["geometry"])), "user pin must be inside Qadian"
    assert not p.within(shape(g["geometry"])), "user pin must not be inside Gurdaspur"
    print("OK: Dhariwal pin is inside Qadian")

if __name__ == "__main__":
    main()
