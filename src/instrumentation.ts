/**
 * Runs once when the Node server starts (Docker/EC2).
 * Keep batches small so DB pool is not exhausted (dashboard /api/me must stay fast).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
    console.error("[security] CRON_SECRET is not set — /api/cron/auto-punch-out will reject all requests");
  }

  const INTERVAL_MS = 15 * 60 * 1000;
  const BOOT_DELAY_MS = 45_000;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { autoPunchOutAllStale } = await import("@/lib/punchOut");
      // Small batches — cron / next tick will continue
      const closed = await autoPunchOutAllStale(40);
      if (closed.length) {
        console.info(`[auto-punch-out] closed ${closed.length} stale session(s)`);
      }
    } catch (e) {
      console.error("[auto-punch-out] scheduler failed", e);
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), INTERVAL_MS);
  }, BOOT_DELAY_MS);
}
