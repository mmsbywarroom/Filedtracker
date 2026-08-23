#!/usr/bin/env python3
"""
Apply ECI-verified municipal town corrections to punjab-assemblies.geojson.

Only patches where Wikipedia/OSM town centers fall in the wrong AC vs
Delimitation Order 2008. Re-run after regenerating GeoJSON from shapefile.
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Point, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / "data" / "boundaries" / "punjab-assemblies.geojson"

# (expected_ac, min_lng, min_lat, max_lng, max_lat, label, verify_lat, verify_lng)
PATCHES = [
    # Already applied earlier; keep idempotent
    ("Qadian", 75.295, 31.935, 75.355, 31.975, "Dhariwal MCl", 31.952441, 75.312766),
    # Qadian town itself wrongly inside Batala in public GIS
    ("Qadian", 75.350, 31.800, 75.410, 31.845, "Qadian MCl", 31.8176, 75.3764),
    # Kahnuwan area (ECI: Qadian) — approx town
    ("Qadian", 75.420, 31.870, 75.490, 31.930, "Kahnuwan", 31.9000, 75.4500),
    # Rampura Phul MCl wrongly in Maur
    ("Rampura Phul", 75.210, 30.240, 75.280, 30.300, "Rampura Phul MCl", 30.2680, 75.2410),
    # Patiala city core (wards 8–35) wrongly tagged Patiala Rural
    ("Patiala", 76.360, 30.310, 76.420, 30.360, "Patiala city core", 30.3398, 76.3869),
    # Sanaur MCl → Sanour AC
    ("Sanour", 76.430, 30.280, 76.490, 30.330, "Sanaur MCl", 30.3015, 76.4570),
    # Nihal Singhwala town
    ("Nihal Singhwala", 75.100, 30.560, 75.180, 30.620, "Nihal Singhwala", 30.5900, 75.1400),
    # Khadoor Sahib town
    ("Khadoor Sahib", 75.070, 31.400, 75.140, 31.455, "Khadoor Sahib", 31.4240, 75.0990),
]


def apply_patch(geo: dict, expected: str, bbox: tuple[float, float, float, float]) -> None:
    patch = box(*bbox)
    target = next(f for f in geo["features"] if f["properties"]["acName"] == expected)
    t_poly = shape(target["geometry"])
    target["geometry"] = mapping(unary_union([t_poly, patch.difference(t_poly)]).buffer(0))
    for f in geo["features"]:
        name = f["properties"]["acName"]
        if name == expected:
            continue
        poly = shape(f["geometry"])
        if poly.intersects(patch):
            f["geometry"] = mapping(poly.difference(patch).buffer(0))


def main() -> None:
    geo = json.loads(GEO_PATH.read_text(encoding="utf-8"))
    for expected, min_lng, min_lat, max_lng, max_lat, label, vlat, vlng in PATCHES:
        apply_patch(geo, expected, (min_lng, min_lat, max_lng, max_lat))
        pt = Point(vlng, vlat)
        ok = any(
            (pt.within(shape(f["geometry"])) or shape(f["geometry"]).covers(pt))
            and f["properties"]["acName"] == expected
            for f in geo["features"]
        )
        print(("OK" if ok else "FAIL"), label, "->", expected)
        if not ok:
            raise SystemExit(f"Patch failed for {label}")

    geo["name"] = "Punjab Assembly Constituencies (post-2008) + ECI municipal corrections"
    GEO_PATH.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
    print("Saved", GEO_PATH)


if __name__ == "__main__":
    main()
