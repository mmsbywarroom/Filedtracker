import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCallForm } from "@/lib/callFormStore";
import { CANONICAL_HALKAS, canonicalCallHalka } from "@/lib/assemblyHalkaCodes";
import { halkaReportPredicates } from "@/lib/halkaReportMatch";

export async function GET() {
  const session = await getCallAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await loadCallForm();
  const { coordinatorLabel, villageLabel, connected, notConnected, coordinatorYes, coordinatorNo, villageYes, villageNo } =
    halkaReportPredicates(form);

  const rows = await prisma.$queryRaw<
    Array<{
      zone: string;
      halka: string;
      total: number;
      dialed: number;
      notAttempted: number;
      connected: number;
      complete: number;
      notConnected: number;
      coordinatorYes: number;
      coordinatorNo: number;
      villageYes: number;
      villageNo: number;
    }>
  >`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") "contactId", status, answers
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT
      c.zone,
      c.halka,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE btrim(COALESCE(l.status, '')) <> '')::int AS dialed,
      COUNT(*) FILTER (WHERE btrim(COALESCE(l.status, '')) = '')::int AS "notAttempted",
      COUNT(*) FILTER (WHERE l.status IN (${connected}))::int AS connected,
      COUNT(*) FILTER (WHERE l.status = 'call_complete')::int AS complete,
      COUNT(*) FILTER (WHERE l.status IN (${notConnected}))::int AS "notConnected",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes})::int AS "coordinatorYes",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorNo})::int AS "coordinatorNo",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes} AND ${villageYes})::int AS "villageYes",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes} AND ${villageNo})::int AS "villageNo"
    FROM "CallContact" c
    LEFT JOIN latest l ON l."contactId" = c.id
    GROUP BY c.zone, c.halka
    ORDER BY c.zone ASC, c.halka ASC
  `;

  type Counts = Omit<(typeof rows)[number], "zone" | "halka">;
  const empty = (): Counts => ({
    total: 0,
    dialed: 0,
    notAttempted: 0,
    connected: 0,
    complete: 0,
    notConnected: 0,
    coordinatorYes: 0,
    coordinatorNo: 0,
    villageYes: 0,
    villageNo: 0,
  });
  const byHalka = new Map<string, Counts>();
  const unlisted = new Map<string, { zone: string; halka: string; counts: Counts }>();
  for (const row of rows) {
    const canonical = canonicalCallHalka(row.halka);
    const bucket = canonical
      ? byHalka.get(canonical.halka) || empty()
      : unlisted.get(`${row.zone}\n${row.halka}`)?.counts || empty();
    bucket.total += Number(row.total || 0);
    bucket.dialed += Number(row.dialed || 0);
    bucket.notAttempted += Number(row.notAttempted || 0);
    bucket.connected += Number(row.connected || 0);
    bucket.complete += Number(row.complete || 0);
    bucket.notConnected += Number(row.notConnected || 0);
    bucket.coordinatorYes += Number(row.coordinatorYes || 0);
    bucket.coordinatorNo += Number(row.coordinatorNo || 0);
    bucket.villageYes += Number(row.villageYes || 0);
    bucket.villageNo += Number(row.villageNo || 0);
    if (canonical) byHalka.set(canonical.halka, bucket);
    else unlisted.set(`${row.zone}\n${row.halka}`, { zone: row.zone || "Unlisted", halka: row.halka || "No halka", counts: bucket });
  }

  const listed = CANONICAL_HALKAS.map((item) => ({
    zone: item.zone,
    halka: item.halka,
    raw: false,
    ...(byHalka.get(item.halka) || empty()),
  }));
  const extra = Array.from(unlisted.values())
    .filter((item) => item.counts.total > 0)
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.halka.localeCompare(b.halka))
    .map((item) => ({ zone: item.zone, halka: item.halka, raw: true, ...item.counts }));

  return NextResponse.json({
    coordinatorLabel,
    villageLabel,
    rows: [...listed, ...extra],
  });
}
