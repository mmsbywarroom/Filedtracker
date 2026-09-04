package in.videh.filedtracker.bglocation;

/** 30-minute FLAG snapshots from punch-in until punch-out (native / iOS only). */
public final class IntervalScheduler {
    private static final long INTERVAL_MS = 30L * 60L * 1000L;
    private static final long EARLY_MS = 2L * 60L * 1000L;
    /** Match server: allow Doze / OEM delay almost until the next slot. */
    private static final long LATE_MS = 25L * 60L * 1000L;
    public static final int MAX_SLOTS = 24;

    private IntervalScheduler() {}

    public static long slotDueMs(long punchInMs, int slot) {
        return punchInMs + slot * INTERVAL_MS;
    }

    public static boolean isSlotDueNow(long punchInMs, int slot, long now) {
        long due = slotDueMs(punchInMs, slot);
        return now >= due - EARLY_MS && now <= due + LATE_MS;
    }

    public static boolean isSlotMissed(long punchInMs, int slot, long now) {
        return now > slotDueMs(punchInMs, slot) + LATE_MS;
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

    /** Next unsent slot due time (for AlarmManager), or 0 if none left. */
    public static long nextAlarmAtMs(long punchInMs, java.util.function.IntPredicate alreadySent, long now) {
        if (punchInMs <= 0) return 0L;
        for (int slot = 1; slot <= MAX_SLOTS; slot++) {
            if (alreadySent.test(slot)) continue;
            if (isSlotMissed(punchInMs, slot, now)) continue;
            long due = slotDueMs(punchInMs, slot);
            // Wake 1 minute before due so we are inside the early window.
            long fireAt = due - 60_000L;
            if (fireAt < now) {
                if (isSlotDueNow(punchInMs, slot, now)) return now + 3_000L;
                continue;
            }
            return fireAt;
        }
        return 0L;
    }
}
