import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { decodeCsvBytes, importCallCsv } from "@/lib/callCsv";

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  const text = decodeCsvBytes(Buffer.from(await file.arrayBuffer()));
  const result = await importCallCsv(text);
  if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
