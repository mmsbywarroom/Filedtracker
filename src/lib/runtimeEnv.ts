export function runtimeEnv(name: string) {
  const env = process.env as Record<string, string | undefined>;
  return env[name] || "";
}

export function googleMapsKey() {
  return runtimeEnv(["GOOGLE", "MAPS", "API", "KEY"].join("_"));
}
