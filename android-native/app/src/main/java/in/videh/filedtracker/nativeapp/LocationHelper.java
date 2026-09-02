package in.videh.filedtracker.nativeapp;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Location;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

public final class LocationHelper {
    public static final int REQ_LOCATION = 2001;
    public static final int REQ_BACKGROUND = 2002;
    public static final int REQ_NOTIFICATIONS = 2003;

    public interface Callback {
        void onResult(Location loc);

        void onError(String message);
    }

    private LocationHelper() {}

    public static boolean hasFineLocation(Activity activity) {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public static void requestLocationPermissions(Activity activity) {
        ActivityCompat.requestPermissions(
                activity,
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                },
                REQ_LOCATION
        );
    }

    public static void requestBackgroundLocation(Activity activity) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                    REQ_BACKGROUND
            );
        }
    }

    public static void requestNotifications(Activity activity) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQ_NOTIFICATIONS
            );
        }
    }

    public static void getCurrentLocation(Activity activity, Callback cb) {
        if (!hasFineLocation(activity)) {
            cb.onError("Location permission required.");
            return;
        }
        FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(activity);
        CancellationTokenSource cts = new CancellationTokenSource();
        fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                .addOnSuccessListener(loc -> {
                    if (loc != null) cb.onResult(loc);
                    else cb.onError("Could not get GPS location. Try again outdoors.");
                })
                .addOnFailureListener(e -> cb.onError(e.getMessage() != null ? e.getMessage() : "GPS failed"));
    }
}
