/**
 * Runs once when the Node server starts (Docker/EC2).
 * Vercel crons do not apply here — we schedule auto punch-out in-process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const INTERVAL_MS = 15 * 60 * 1000;
  const BOOT_DELAY_MS = 20_000;

  const tick = async () => {
    try {
      const { autoPunchOutAllStale } = await import("@/lib/punchOut");
      const closed = await autoPunchOutAllStale(300);
      if (closed.length) {
        console.info(`[auto-punch-out] closed ${closed.length} stale session(s)`);
      }
    } catch (e) {
      console.error("[auto-punch-out] scheduler failed", e);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), INTERVAL_MS);
  }, BOOT_DELAY_MS);
}
