package in.videh.filedtracker.nativeapp;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

public final class PunchInWindow {
    private static final int START_MIN = 5 * 60;
    private static final int END_MIN = 13 * 60;
    /** Same as server: unrestricted punch any time. */
    private static final String UNRESTRICTED_PHONE = "9625692122";

    private PunchInWindow() {}

    public static boolean isUnrestrictedPhone(String phone) {
        if (phone == null) return false;
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
        return UNRESTRICTED_PHONE.equals(digits);
    }

    public static boolean isAllowed() {
        return isAllowedForPhone(null);
    }

    public static boolean isAllowedForPhone(String phone) {
        if (isUnrestrictedPhone(phone)) return true;
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"), Locale.US);
        int minutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        return minutes >= START_MIN && minutes < END_MIN;
    }

    public static String blockedMessage() {
        return "Punch in is only allowed between 5:00 AM and 1:00 PM (IST).";
    }
}
