import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DESIGNATIONS, canManageAdmins, defaultVisibleDesignations, parseAssembliesInput } from "@/lib/hierarchy";

const LEVELS = new Set(["State", "Zone Coordinator", "ZLC", "DLC", "Cluster", "ALC"]);

function pick(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (found) return String(row[found] || "").trim();
  }
  return "";
}

function parseDesignations(raw: string, accessLevel: string) {
  if (!raw.trim()) return defaultVisibleDesignations(accessLevel);
  return raw
    .split(/[|;,]/)
    .map((d) => d.trim())
    .filter((d) => DESIGNATIONS.includes(d as (typeof DESIGNATIONS)[number]));
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json({ error: "Could not read CSV." }, { status: 400 });
  }

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = pick(row, "Name");
    const email = pick(row, "Admin ID", "Email", "Username").toLowerCase();
    const password = pick(row, "Password");
    const accessLevel = pick(row, "Admin Level", "Level", "Access Level");
    const zone = pick(row, "Zone");
    const district = pick(row, "District");
    const cluster = pick(row, "Cluster");
    const assemblyRaw = pick(row, "Assemblies", "Assembly", "Assembly Name");
    const designations = parseDesignations(pick(row, "Designations", "Can See Designations"), accessLevel);

    if (!name || !email || !password || !LEVELS.has(accessLevel)) {
      errors.push({ row: i + 2, error: "Name, Admin ID, Password and valid Admin Level are required." });
      continue;
    }
    if (password.length < 6) {
      errors.push({ row: i + 2, error: "Password must be at least 6 characters." });
      continue;
    }
    if (accessLevel !== "State" && !zone) {
      errors.push({ row: i + 2, error: "Zone is required for this level." });
      continue;
    }
    if ((accessLevel === "DLC" || accessLevel === "Cluster" || accessLevel === "ALC") && !district) {
      errors.push({ row: i + 2, error: "District is required for this level." });
      continue;
    }
    if (accessLevel === "Cluster" && !cluster) {
      errors.push({ row: i + 2, error: "Cluster is required for Cluster level." });
      continue;
    }

    let assemblies = parseAssembliesInput(assemblyRaw);
    let assemblyName = "";
    if (accessLevel === "DLC" || accessLevel === "Cluster") {
      if (!assemblies.length) {
        errors.push({
          row: i + 2,
          error: "DLC/Cluster need Assemblies column with one or more names, e.g. Bhoa|Sujanpur|Pathankot",
        });
        continue;
      }
      assemblyName = assemblies.join("|");
    } else if (accessLevel === "ALC") {
      if (!assemblies.length) {
        errors.push({ row: i + 2, error: "Assembly is required for ALC." });
        continue;
      }
      assemblyName = assemblies[0];
      assemblies = [assemblyName];
    }

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      skipped.push(email);
      continue;
    }

    try {
      await prisma.admin.create({
        data: {
          email,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          accessLevel,
          isSuper: false,
          designations: designations.length ? designations : defaultVisibleDesignations(accessLevel),
          zone: accessLevel === "State" ? "" : zone,
          district,
          assemblyName,
          assemblies,
          cluster,
        },
      });
      created.push(email);
    } catch {
      errors.push({ row: i + 2, error: "Could not create admin." });
    }
  }

  return NextResponse.json({
    created: created.length,
    skipped: skipped.length,
    errors,
  });
}
