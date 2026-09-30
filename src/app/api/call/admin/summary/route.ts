import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_CENTER_SITE_NAMES, callCenterSiteName } from "@/lib/callCenterGeofence";
import { CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES, REDIAL_CALL_STATUSES } from "@/lib/callList";

type SiteName = (typeof CALL_CENTER_SITE_NAMES)[number];

type CallerStat = {
  name: string;
  phone: string;
  assigned: number;
  dialed: number;
  fresh: number;
  connected: number;
  complete: number;
  notConnected: number;
  redial: number;
};

function emptyCaller(): Omit<CallerStat, "name" | "phone"> {
  return { assigned: 0, dialed: 0, fresh: 0, connected: 0, complete: 0, notConnected: 0, redial: 0 };
}

function add(target: Omit<CallerStat, "name" | "phone">, row: Omit<CallerStat, "name" | "phone">) {
  target.assigned += row.assigned;
  target.dialed += row.dialed;
  target.fresh += row.fresh;
  target.connected += row.connected;
  target.complete += row.complete;
  target.notConnected += row.notConnected;
  target.redial += row.redial;
}

export async function GET() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connected = Prisma.join([...CONNECTED_CALL_STATUSES]);
  const notConnected = Prisma.join([...NOT_CONNECTED_CALL_STATUSES]);
  const redial = Prisma.join([...REDIAL_CALL_STATUSES]);

  const people = await prisma.$queryRaw<
    Array<{
      name: string;
      phone: string;
      sectorAllotted: string;
      assigned: number;
      dialed: number;
      complete: number;
      connected: number;
      notConnected: number;
      redial: number;
    }>
  >`
    SELECT u.name, u.phone, u."sectorAllotted",
      COUNT(c.id)::int AS assigned,
      COUNT(c.id) FILTER (WHERE COALESCE(r.status, '') <> '')::int AS dialed,
      COUNT(c.id) FILTER (WHERE r.status = 'call_complete')::int AS complete,
      COUNT(c.id) FILTER (WHERE r.status IN (${connected}))::int AS connected,
      COUNT(c.id) FILTER (WHERE r.status IN (${notConnected}))::int AS "notConnected",
      COUNT(c.id) FILTER (WHERE r.status IN (${redial}))::int AS redial
    FROM "User" u
    LEFT JOIN "CallContact" c ON c."assigneePhone" = u.phone
    LEFT JOIN LATERAL (
      SELECT status FROM "CallPortalResponse"
      WHERE "contactId" = c.id
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) r ON true
    WHERE u.designation = 'Call Center'
    GROUP BY u.name, u.phone, u."sectorAllotted"
    ORDER BY u.name ASC
  `;

  const sites = CALL_CENTER_SITE_NAMES.map((name) => ({
    name,
    callers: 0,
    ...emptyCaller(),
    users: [] as CallerStat[],
  }));
  const byName = new Map<SiteName, (typeof sites)[number]>(sites.map((site) => [site.name, site]));

  for (const person of people) {
    const siteName = callCenterSiteName(person.sectorAllotted);
    if (!siteName) continue;
    const site = byName.get(siteName);
    if (!site) continue;
    const stats: CallerStat = {
      name: person.name,
      phone: person.phone,
      assigned: Number(person.assigned || 0),
      dialed: Number(person.dialed || 0),
      fresh: Math.max(0, Number(person.assigned || 0) - Number(person.dialed || 0)),
      connected: Number(person.connected || 0),
      complete: Number(person.complete || 0),
      notConnected: Number(person.notConnected || 0),
      redial: Number(person.redial || 0),
    };
    site.callers += 1;
    site.users.push(stats);
    add(site, stats);
  }

  return NextResponse.json({ sites });
}
