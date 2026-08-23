#!/usr/bin/env python3
"""
Verify Punjab AC GeoJSON against ECI 2008 municipal towns.
For each known town→expected AC, geocode (cached) and point-in-polygon.
Writes data/boundaries/assembly-audit.json and applies patches when --fix.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import Point, shape, mapping, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / "data" / "boundaries" / "punjab-assemblies.geojson"
CACHE_PATH = ROOT / "data" / "boundaries" / "town-geocode-cache.json"
AUDIT_PATH = ROOT / "data" / "boundaries" / "assembly-audit.json"

# ECI 2008: landmark towns / MCls that should fall in a specific AC.
# Format: (town_query_for_geocode, expected_ac_name_in_geojson, patch_box_optional)
# patch box: (min_lng, min_lat, max_lng, max_lat) used only when fixing
TOWNS = [
    # Gurdaspur district — critical known error
    ("Dhariwal, Gurdaspur, Punjab, India", "Qadian", (75.295, 31.935, 75.355, 31.975)),
    ("Qadian, Gurdaspur, Punjab, India", "Qadian", None),
    ("Gurdaspur, Punjab, India", "Gurdaspur", None),
    ("Dinanagar, Gurdaspur, Punjab, India", "Dina Nagar", None),
    ("Pathankot, Punjab, India", "Pathankot", None),
    ("Sujanpur, Pathankot, Punjab, India", "Sujanpur", None),
    ("Batala, Punjab, India", "Batala", None),
    ("Sri Hargobindpur, Punjab, India", "Sri Hargobindpur", None),
    ("Fatehgarh Churian, Punjab, India", "Fatehgarh Churian", None),
    ("Dera Baba Nanak, Punjab, India", "Dera Baba Nanak", None),
    ("Kalanaur, Gurdaspur, Punjab, India", "Dera Baba Nanak", None),
    # Amritsar
    ("Ajnala, Amritsar, Punjab, India", "Ajnala", None),
    ("Majitha, Amritsar, Punjab, India", "Majitha", None),
    ("Jandiala Guru, Amritsar, Punjab, India", "Jandiala", None),
    ("Tarn Taran, Punjab, India", "Tarn Taran", None),
    ("Patti, Tarn Taran, Punjab, India", "Patti", None),
    ("Khemkaran, Punjab, India", "Khem Karan", None),
    ("Rayya, Amritsar, Punjab, India", "Baba Bakala", None),
    # Kapurthala / Jalandhar / Hoshiarpur
    ("Kapurthala, Punjab, India", "Kapurthala", None),
    ("Phagwara, Punjab, India", "Phagwara", None),
    ("Phillaur, Punjab, India", "Phillaur", None),
    ("Nakodar, Punjab, India", "Nakodar", None),
    ("Nurmahal, Punjab, India", "Nakodar", None),
    ("Kartarpur, Jalandhar, Punjab, India", "Kartarpur", None),
    ("Adampur, Jalandhar, Punjab, India", "Adampur", None),
    ("Mukerian, Punjab, India", "Mukerian", None),
    ("Dasuya, Punjab, India", "Dasuya", None),
    ("Hoshiarpur, Punjab, India", "Hoshiarpur", None),
    ("Garhshankar, Punjab, India", "Garhshankar", None),
    ("Nawanshahr, Punjab, India", "Nawan Shahr", None),
    ("Banga, Nawanshahr, Punjab, India", "Banga", None),
    ("Balachaur, Punjab, India", "Balachaur", None),
    # Rupnagar / Mohali
    ("Anandpur Sahib, Punjab, India", "Anandpur Sahib", None),
    ("Nangal, Rupnagar, Punjab, India", "Anandpur Sahib", None),
    ("Rupnagar, Punjab, India", "Rupnagar", None),
    ("Morinda, Punjab, India", "Chamkaur Sahib", None),
    ("Kharar, Punjab, India", "Kharar", None),
    ("Kurali, Punjab, India", "Kharar", None),
    ("Mohali, Punjab, India", "S.A.S.Nagar", None),
    # Ludhiana / Moga / Firozpur
    ("Khanna, Punjab, India", "Khanna", None),
    ("Samrala, Punjab, India", "Samrala", None),
    ("Sahnewal, Punjab, India", "Sahnewal", None),
    ("Jagraon, Punjab, India", "Jagraon", None),
    ("Moga, Punjab, India", "Moga", None),
    ("Dharamkot, Punjab, India", "Dharamkot", None),
    ("Zira, Punjab, India", "Zira", None),
    ("Firozpur, Punjab, India", "Firozpur City", None),
    ("Talwandi Bhai, Punjab, India", "Firozpur Rural", None),
    ("Jalalabad, Fazilka, Punjab, India", "Jalalabad", None),
    ("Fazilka, Punjab, India", "Fazilka", None),
    ("Abohar, Punjab, India", "Abohar", None),
    # Malwa
    ("Gidderbaha, Punjab, India", "Gidderbaha", None),
    ("Malout, Punjab, India", "Malout", None),
    ("Sri Muktsar Sahib, Punjab, India", "Muktsar", None),
    ("Faridkot, Punjab, India", "Faridkot", None),
    ("Kotkapura, Punjab, India", "Kotkapura", None),
    ("Rampura Phul, Punjab, India", "Rampura Phul", None),
    ("Bathinda, Punjab, India", "Bathinda Urban", None),
    ("Maur, Bathinda, Punjab, India", "Maur", None),
    ("Mansa, Punjab, India", "Mansa", None),
    ("Sunam, Punjab, India", "Sunam", None),
    ("Barnala, Punjab, India", "Barnala", None),
    ("Malerkotla, Punjab, India", "Malerkotla", None),
    ("Dhuri, Punjab, India", "Dhuri", None),
    ("Sangrur, Punjab, India", "Sangrur", None),
    ("Nabha, Punjab, India", "Nabha", None),
    ("Rajpura, Punjab, India", "Rajpura", None),
    ("Banur, Punjab, India", "Rajpura", None),
    ("Dera Bassi, Punjab, India", "Dera Bassi", None),
    ("Patiala, Punjab, India", "Patiala", None),
    ("Samana, Punjab, India", "Samana", None),
    ("Sanaur, Patiala, Punjab, India", "Sanour", None),
]


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def geocode(query: str, cache: dict) -> tuple[float, float] | None:
    if query in cache and cache[query]:
        c = cache[query]
        return float(c["lat"]), float(c["lng"])
    url = (
        "https://nominatim.openstreetmap.org/search?"
        + urllib.parse.urlencode({"q": query, "format": "json", "limit": 1, "countrycodes": "in"})
    )
    req = urllib.request.Request(url, headers={"User-Agent": "FiledTracking-geofence-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print("geocode fail", query, e)
        cache[query] = None
        return None
    time.sleep(1.1)  # Nominatim rate limit
    if not data:
        cache[query] = None
        return None
    lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
    cache[query] = {"lat": lat, "lng": lng, "display": data[0].get("display_name")}
    return lat, lng


def find_containing(features, lng: float, lat: float) -> list[str]:
    pt = Point(lng, lat)
    hits = []
    for f in features:
        if pt.within(shape(f["geometry"])) or shape(f["geometry"]).covers(pt):
            hits.append(f["properties"]["acName"])
    return hits


def apply_patch(geo: dict, expected: str, wrong_hits: list[str], bbox: tuple[float, float, float, float]) -> None:
    """Move bbox area into expected AC; subtract from wrong ACs that currently contain it."""
    target = next(f for f in geo["features"] if f["properties"]["acName"] == expected)
    patch = box(*bbox)
    t_poly = shape(target["geometry"])
    to_add = patch.difference(t_poly)
    target["geometry"] = mapping(unary_union([t_poly, to_add]).buffer(0))
    for name in set(wrong_hits):
        if name == expected:
            continue
        feat = next((f for f in geo["features"] if f["properties"]["acName"] == name), None)
        if not feat:
            continue
        feat["geometry"] = mapping(shape(feat["geometry"]).difference(patch).buffer(0))
    # verify
    mid = Point((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
    assert mid.within(shape(target["geometry"])) or shape(target["geometry"]).covers(mid)


def main(fix: bool = False):
    geo = json.loads(GEO_PATH.read_text(encoding="utf-8"))
    features = geo["features"]
    cache = load_cache()
    rows = []
    mismatches = []

    for query, expected, bbox in TOWNS:
        coords = geocode(query, cache)
        if not coords:
            rows.append({"town": query, "expected": expected, "status": "NO_GEOCODE"})
            continue
        lat, lng = coords
        hits = find_containing(features, lng, lat)
        ok = expected in hits and (len(hits) == 1 or expected == hits[0])
        # Accept if expected is among hits (prefer exact)
        status = "OK" if expected in hits else "MISMATCH"
        if status == "MISMATCH" and not hits:
            status = "OUTSIDE_ALL"
        row = {
            "town": query.split(",")[0],
            "query": query,
            "expected": expected,
            "lat": lat,
            "lng": lng,
            "hits": hits,
            "status": status,
            "has_patch_box": bool(bbox),
        }
        rows.append(row)
        if status != "OK":
            mismatches.append(row)
            print(f"{status}: {row['town']} expected={expected} hits={hits} @ {lat:.5f},{lng:.5f}")

    save_cache(cache)

    fixed = []
    if fix:
        # Reload geo fresh for patches
        geo = json.loads(GEO_PATH.read_text(encoding="utf-8"))
        for query, expected, bbox in TOWNS:
            coords = geocode(query, cache)
            if not coords:
                continue
            lat, lng = coords
            hits = find_containing(geo["features"], lng, lat)
            if expected in hits:
                continue
            if not bbox:
                # auto box ~2.2km around town
                dlat, dlng = 0.02, 0.022
                bbox = (lng - dlng, lat - dlat, lng + dlng, lat + dlat)
            print(f"FIX: moving area into {expected} for {query.split(',')[0]}")
            apply_patch(geo, expected, hits, bbox)
            fixed.append({"town": query.split(",")[0], "expected": expected, "from": hits, "bbox": bbox})
        geo["name"] = "Punjab Assembly Constituencies (post-2008) + ECI municipal town corrections"
        GEO_PATH.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
        # re-check fixed towns
        geo2 = json.loads(GEO_PATH.read_text(encoding="utf-8"))
        for item in fixed:
            # find coords from rows
            r = next(x for x in rows if x["town"] == item["town"])
            hits = find_containing(geo2["features"], r["lng"], r["lat"])
            print(f"  after: {item['town']} → {hits}")

    AUDIT_PATH.write_text(
        json.dumps(
            {
                "checked": len(rows),
                "ok": sum(1 for r in rows if r["status"] == "OK"),
                "mismatch": sum(1 for r in rows if r["status"] != "OK"),
                "fixed": fixed,
                "rows": rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nChecked {len(rows)} | OK {sum(1 for r in rows if r['status']=='OK')} | bad {sum(1 for r in rows if r['status']!='OK')}")
    print("Wrote", AUDIT_PATH)


if __name__ == "__main__":
    import sys

    main(fix="--fix" in sys.argv)
