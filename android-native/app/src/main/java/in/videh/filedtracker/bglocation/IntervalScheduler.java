package in.videh.filedtracker.bglocation;

public final class IntervalScheduler {
    private static final long INTERVAL_MS = 60L * 60L * 1000L;
    private static final long EARLY_MS = 2L * 60L * 1000L;
    private static final long LATE_MS = 20L * 60L * 1000L;
    public static final int MAX_SLOTS = 12;

    private IntervalScheduler() {}

    public static long slotDueMs(long punchInMs, int slot) {
        return punchInMs + slot * INTERVAL_MS;
    }

    public static boolean isSlotDueNow(long punchInMs, int slot, long now) {
        long due = slotDueMs(punchInMs, slot);
        return now >= due - EARLY_MS && now <= due + LATE_MS;
    }

    /** Returns first due slot not yet sent, or 0 if none. */
    public static int findDueSlot(long punchInMs, java.util.function.IntPredicate alreadySent, long now) {
        if (punchInMs <= 0) return 0;
        for (int slot = 1; slot <= MAX_SLOTS; slot++) {
            if (alreadySent.test(slot)) continue;
            if (isSlotDueNow(punchInMs, slot, now)) return slot;
        }
        return 0;
    }
}
