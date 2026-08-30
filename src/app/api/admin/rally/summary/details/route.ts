import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { remainingEtaSeconds, formatEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";

type Metric = "users" | "uniqueVehicles" | "started" | "pending" | "reached" | "m30" | "h1" | "h2" | "h2_5" | "over" | "heads";
type GroupBy = "zone" | "district" | "ac" | "vehicle";

function matchGroup(u: { zone: string; district: string; acName: string; vehicleNo: string }, groupBy?: string, groupValue?: string) {
  if (!groupBy || !groupValue) return true;
  if (groupBy === "zone") return u.zone === groupValue;
  if (groupBy === "district") return u.district === groupValue;
  if (groupBy === "ac") return u.acName === groupValue;
  if (groupBy === "vehicle") return (u.vehicleNo || "No vehicle") === groupValue;
  return true;
}

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const metric = (q.get("metric") || "users") as Metric;
  const groupBy = (q.get("groupBy") || "") as GroupBy | "";
  const groupValue = q.get("groupValue") || "";

  const rally = await prisma.rally.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  if (!rally) return NextResponse.json({ rows: [] });

  const users = await prisma.rallyUser.findMany({
    where: { rallyId: rally.id },
    include: { checkins: { where: { rallyId: rally.id }, orderBy: { startedAt: "desc" }, take: 1 } },
  });

  const rows = [];
  for (const u of users) {
    if (!matchGroup(u, groupBy || undefined, groupValue || undefined)) continue;
    const c = u.checkins[0];
    const remaining = c ? remainingEtaSeconds(c.startedAt, c.etaSeconds, c.reachedAt) : null;
    const reached = c ? Boolean(c.reachedAt) || c.distanceMeters <= RALLY_REACHED_METERS || remaining! <= 0 : false;
    let bucket: string | null = null;
    if (c && !reached && remaining != null) {
      if (remaining <= 30 * 60) bucket = "m30";
      else if (remaining <= 60 * 60) bucket = "h1";
      else if (remaining <= 120 * 60) bucket = "h2";
      else if (remaining <= 150 * 60) bucket = "h2_5";
      else bucket = "over";
    }

    const keep =
      metric === "users" ||
      (metric === "heads" && Boolean(c)) ||
      (metric === "uniqueVehicles" && Boolean(u.vehicleNo.trim())) ||
      (metric === "started" && Boolean(c)) ||
      (metric === "pending" && Boolean(c) && !reached) ||
      (metric === "reached" && reached) ||
      (metric === "m30" && bucket === "m30") ||
      (metric === "h1" && bucket === "h1") ||
      (metric === "h2" && bucket === "h2") ||
      (metric === "h2_5" && bucket === "h2_5") ||
      (metric === "over" && bucket === "over");
    if (!keep) continue;

    rows.push({
      id: u.id,
      name: u.name,
      phone: u.phone,
      zone: u.zone,
      district: u.district,
      acName: u.acName,
      villageWard: u.villageWard,
      vehicleNo: u.vehicleNo,
      vehicleType: u.vehicleType,
      pocName: u.pocName,
      pocNumber: u.pocNumber,
      headCount: c?.headCount ?? 0,
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
      etaLabel: c ? formatEta(c.etaSeconds) : "—",
      remainingLabel: c ? (reached ? "Reached" : formatEta(remaining || 0)) : "Not started",
      started: Boolean(c),
      reached,
    });
  }

  return NextResponse.json({ rows, metric, groupBy, groupValue });
}
