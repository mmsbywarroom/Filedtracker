import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { remainingEtaSeconds, RALLY_REACHED_METERS, isRallyNoMove } from "@/lib/rallyGeo";
import { resolveRally, rallyDateYmd } from "@/lib/rallies";

type Bucket = "m30" | "h1" | "h2" | "h2_5" | "over";

function bucket(remaining: number, reached: boolean): Bucket | "reached" | "not_started" {
  if (reached) return "reached";
  if (remaining <= 0) return "reached";
  if (remaining <= 30 * 60) return "m30";
  if (remaining <= 60 * 60) return "h1";
  if (remaining <= 120 * 60) return "h2";
  if (remaining <= 150 * 60) return "h2_5";
  return "over";
}

function emptyCounts() {
  return { users: 0, started: 0, pending: 0, reached: 0, noMove: 0, m30: 0, h1: 0, h2: 0, h2_5: 0, over: 0, uniqueVehicles: 0, heads: 0 };
}

type Agg = ReturnType<typeof emptyCounts> & { key: string; veh: Set<string> };

function bump(map: Map<string, Agg>, key: string) {
  const k = key.trim() || "—";
  if (!map.has(k)) map.set(k, { key: k, ...emptyCounts(), veh: new Set() });
  return map.get(k)!;
}

export async function GET(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rallyId = new URL(req.url).searchParams.get("rallyId");
  const rally = await resolveRally(rallyId);
  if (!rally) {
    return NextResponse.json({
      rally: null,
      totals: { ...emptyCounts(), totalVehicles: 0 },
      byZone: [],
      byDistrict: [],
      byAc: [],
      byVehicle: [],
    });
  }

  const users = await prisma.rallyUser.findMany({
    where: { rallyId: rally.id },
    include: { checkins: { where: { rallyId: rally.id }, orderBy: { startedAt: "desc" }, take: 1 } },
  });

  const totals = emptyCounts();
  const vehicles = new Set<string>();
  const groups = {
    zone: new Map<string, Agg>(),
    district: new Map<string, Agg>(),
    ac: new Map<string, Agg>(),
    vehicle: new Map<string, Agg>(),
  };

  for (const u of users) {
    totals.users += 1;
    if (u.vehicleNo.trim()) vehicles.add(u.vehicleNo.trim().toUpperCase());
    const z = bump(groups.zone, u.zone);
    const d = bump(groups.district, u.district);
    const a = bump(groups.ac, u.acName);
    const v = bump(groups.vehicle, u.vehicleNo || "No vehicle");
    z.users += 1;
    d.users += 1;
    a.users += 1;
    v.users += 1;
    const plate = u.vehicleNo.trim().toUpperCase();
    if (plate) {
      vehicles.add(plate);
      z.veh.add(plate);
      d.veh.add(plate);
      a.veh.add(plate);
      v.veh.add(plate);
    }

    const c = u.checkins[0];
    const targets = [totals, z, d, a, v];
    if (!c) continue;
    const remaining = remainingEtaSeconds(c.startedAt, c.etaSeconds, c.reachedAt);
    const reached = Boolean(c.reachedAt) || c.distanceMeters <= RALLY_REACHED_METERS || remaining <= 0;
    const noMove = isRallyNoMove(c);
    const b = bucket(remaining, reached);
    for (const t of targets) {
      t.started += 1;
      t.heads += c.headCount || 0;
      if (noMove) t.noMove += 1;
      if (reached || b === "reached") t.reached += 1;
      else {
        t.pending += 1;
        if (b === "m30") t.m30 += 1;
        else if (b === "h1") t.h1 += 1;
        else if (b === "h2") t.h2 += 1;
        else if (b === "h2_5") t.h2_5 += 1;
        else t.over += 1;
      }
    }
  }

  totals.uniqueVehicles = vehicles.size;
  function serialize(map: Map<string, Agg>) {
    return [...Array.from(map.values())]
      .map(({ veh, ...row }) => ({ ...row, uniqueVehicles: veh.size }))
      .sort((x, y) => y.started - x.started);
  }

  return NextResponse.json({
    rally: { id: rally.id, name: rally.name, scheduledDate: rallyDateYmd(rally.scheduledDate) },
    totals: { ...totals, totalVehicles: totals.users },
    byZone: serialize(groups.zone),
    byDistrict: serialize(groups.district),
    byAc: serialize(groups.ac),
    byVehicle: serialize(groups.vehicle),
  });
}
