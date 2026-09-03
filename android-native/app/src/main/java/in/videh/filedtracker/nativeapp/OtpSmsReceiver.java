package in.videh.filedtracker.nativeapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads the login OTP from the incoming SMS — no per-message Allow popup. */
public class OtpSmsReceiver extends BroadcastReceiver {
    private static final Pattern SIX_DIGITS = Pattern.compile("\\b(\\d{6})\\b");

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }
        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null) return;
        StringBuilder body = new StringBuilder();
        for (SmsMessage msg : messages) {
            if (msg != null && msg.getMessageBody() != null) {
                body.append(msg.getMessageBody());
            }
        }
        Matcher m = SIX_DIGITS.matcher(body.toString());
        if (m.find()) {
            OtpSmsBus.INSTANCE.offer(m.group(1));
        }
    }
}
