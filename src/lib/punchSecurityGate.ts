/** Shared client flags for VPN / Fake GPS punch gates. */
export function punchSecurityBlockFromBody(body: unknown): {
  error: string;
  code: "VPN" | "FAKE_GPS";
} | null {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  // Only block when a Fake GPS app is installed — not on leftover OS isMock alone.
  const spoofApp = b.spoofApp === true;
  const vpnActive = b.vpnActive === true || b.vpn === true;
  if (spoofApp) {
    return {
      code: "FAKE_GPS",
      error:
        "Punch blocked: Fake GPS app detected. Uninstall Fake GPS apps, then try again.",
    };
  }
  if (vpnActive) {
    return {
      code: "VPN",
      error: "Punch blocked: VPN detected. Turn off VPN / uninstall VPN apps, then try again.",
    };
  }
  return null;
}
