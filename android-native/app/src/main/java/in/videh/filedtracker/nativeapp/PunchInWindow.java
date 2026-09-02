package in.videh.filedtracker.nativeapp;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

public final class PunchInWindow {
    private static final int START_MIN = 5 * 60;
    private static final int END_MIN = 13 * 60;

    private PunchInWindow() {}

    public static boolean isAllowed() {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"), Locale.US);
        int minutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        return minutes >= START_MIN && minutes < END_MIN;
    }

    public static String blockedMessage() {
        return "Punch in is only allowed between 5:00 AM and 1:00 PM (IST).";
    }
}
