package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.util.Log;

import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Optional Standard Play Integrity for direct/sideloaded APK distribution.
 *
 * Play Console linking is NOT a production prerequisite. Missing project number,
 * Play Store install, or decode failures return "" — attendance continues.
 *
 * Server must NOT treat UNLICENSED / UNRECOGNIZED_VERSION / UNEVALUATED as fraud;
 * primary fake-GPS evidence remains LocationCompat.isMock.
 */
public final class PlayIntegrityHelper {
    private static final String TAG = "FTPlayIntegrity";

    private PlayIntegrityHelper() {}

    public static long cloudProjectNumber() {
        try {
            return BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
        } catch (Throwable t) {
            return 0L;
        }
    }

    /**
     * @param serverRequestHash exact hash returned by POST /api/attendance/security/challenge
     * @return integrity token or "" (never throws; never blocks punch)
     */
    public static String requestToken(Context ctx, String serverRequestHash) {
        long projectNumber = cloudProjectNumber();
        if (projectNumber <= 0L) {
            Log.i(TAG, "Play Integrity skipped (optional for sideload; project number unset)");
            return "";
        }
        if (serverRequestHash == null || serverRequestHash.isEmpty()) {
            Log.w(TAG, "Missing server requestHash — skipping optional integrity request");
            return "";
        }

        try {
            StandardIntegrityManager integrityManager =
                    IntegrityManagerFactory.createStandard(ctx.getApplicationContext());
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<String> tokenRef = new AtomicReference<>("");

            integrityManager
                    .prepareIntegrityToken(
                            StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                                    .setCloudProjectNumber(projectNumber)
                                    .build())
                    .addOnSuccessListener(
                            provider ->
                                    provider
                                            .request(
                                                    StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                                                            .setRequestHash(serverRequestHash)
                                                            .build())
                                            .addOnSuccessListener(
                                                    resp -> {
                                                        tokenRef.set(resp.token());
                                                        latch.countDown();
                                                    })
                                            .addOnFailureListener(
                                                    e -> {
                                                        Log.w(TAG, "token request failed (optional)", e);
                                                        latch.countDown();
                                                    }))
                    .addOnFailureListener(
                            e -> {
                                Log.w(TAG, "prepareIntegrityToken failed (optional for sideload)", e);
                                latch.countDown();
                            });

            latch.await(15, TimeUnit.SECONDS);
            return tokenRef.get() == null ? "" : tokenRef.get();
        } catch (Throwable t) {
            Log.w(TAG, "Play Integrity unavailable (sideload OK)", t);
            return "";
        }
    }
}
