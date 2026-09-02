export type ClientSource = "web" | "capacitor" | "native";

export function parseClientSource(req: Request): ClientSource {
  const h = req.headers.get("x-client-source")?.toLowerCase().trim();
  if (h === "native") return "native";
  if (h === "capacitor") return "capacitor";
  return "web";
}

export function clientSourceLabel(source: string | null | undefined): string {
  if (source === "native") return "Native app";
  if (source === "capacitor") return "Mobile app";
  if (source === "web") return "Web";
  return "—";
}
