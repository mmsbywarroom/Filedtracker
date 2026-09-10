/** Shared client flags for VPN / Fake GPS punch gates. */
export function punchSecurityBlockFromBody(body: unknown): {
  error: string;
  code: "VPN" | "FAKE_GPS";
} | null {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const isMock = b.isMock === true || b.mockLocation === true;
  const spoofApp = b.spoofApp === true;
  const vpnActive = b.vpnActive === true || b.vpn === true;
  if (isMock || spoofApp) {
    return {
      code: "FAKE_GPS",
      error: "Punch blocked: Fake GPS / mock location detected. Turn it off, then try again.",
    };
  }
  if (vpnActive) {
    return {
      code: "VPN",
      error: "Punch blocked: VPN detected. Turn off VPN, then try again.",
    };
  }
  return null;
}
