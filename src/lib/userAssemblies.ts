import { parseAssembliesInput } from "@/lib/hierarchy";

export function normalizeUserAssemblies(
  designation: string,
  assemblyName: string,
  assembliesInput?: string[] | string | null
): { assemblyName: string; assemblies: string[] } {
  const primary = String(assemblyName || "").trim();
  if (designation !== "ALC") {
    return { assemblyName: primary, assemblies: [] };
  }
  let list: string[] = [];
  if (Array.isArray(assembliesInput)) {
    list = assembliesInput.map((a) => String(a || "").trim()).filter(Boolean);
  } else if (typeof assembliesInput === "string" && assembliesInput.trim()) {
    list = parseAssembliesInput(assembliesInput);
  }
  if (!list.length && primary) list = [primary];
  list = Array.from(new Set(list));
  return {
    assemblyName: list[0] || primary,
    assemblies: list,
  };
}
