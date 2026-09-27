import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_OUTCOMES, CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES } from "@/lib/callList";

const connected = new Set<string>(CONNECTED_CALL_STATUSES);
const notConnected = new Set<string>(NOT_CONNECTED_CALL_STATUSES);

type Bucket = {
  zone: string;
  district: string;
  halka: string;
  total: number;
  dialed: number;
  notAttempted: number;
  connected: number;
  callComplete: number;
  notConnected: number;
  byStatus: Record<string, number>;
  coming: number;
  notComing: number;
  othersYes: number;
  othersNo: number;
};

function blankBucket(zone: string, district: string, halka: string): Bucket {
  return {
    zone,
    district,
    halka,
    total: 0,
    dialed: 0,
    notAttempted: 0,
    connected: 0,
    callComplete: 0,
    notConnected: 0,
    byStatus: Object.fromEntries(CALL_OUTCOMES.map((o) => [o.value, 0])),
    coming: 0,
    notComing: 0,
    othersYes: 0,
    othersNo: 0,
  };
}

function add(bucket: Bucket, status: string, attending: string, companions: string) {
  bucket.total += 1;
  if (!status) {
    bucket.notAttempted += 1;
    return;
  }
  bucket.dialed += 1;
  if (bucket.byStatus[status] != null) bucket.byStatus[status] += 1;
  if (status === "call_complete") bucket.callComplete += 1;
  if (connected.has(status)) bucket.connected += 1;
  if (notConnected.has(status)) bucket.notConnected += 1;
  if (attending === "coming") bucket.coming += 1;
  if (attending === "not_coming") bucket.notComing += 1;
  const people = Number(companions);
  if (Number.isFinite(people) && people > 0) bucket.othersYes += people;
}

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await prisma.callContact.findMany({
    select: {
      zone: true,
      district: true,
      halka: true,
      outcomes: {
        select: { status: true, attending: true, companions: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  const groups = new Map<string, Bucket>();
  const total = blankBucket("Total", "", "");
  for (const contact of contacts) {
    const zone = contact.zone.trim() || "Not set";
    const district = contact.district.trim() || "Not set";
    const halka = contact.halka.trim() || "Not set";
    const key = `${zone}\u0000${district}\u0000${halka}`;
    const bucket = groups.get(key) || blankBucket(zone, district, halka);
    const latest = contact.outcomes[0];
    add(bucket, latest?.status || "", latest?.attending || "", latest?.companions || "");
    add(total, latest?.status || "", latest?.attending || "", latest?.companions || "");
    groups.set(key, bucket);
  }

  const rows = [...groups.values()].sort((a, b) =>
    a.zone.localeCompare(b.zone) || a.district.localeCompare(b.district) || a.halka.localeCompare(b.halka)
  );

  return NextResponse.json({
    statuses: CALL_OUTCOMES,
    total,
    rows,
  });
}
