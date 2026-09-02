package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.location.Location;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import in.videh.filedtracker.bglocation.FieldLocationService;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DashboardActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_PUNCH_IN = "punch_in";
    public static final String MODE_PUNCH_OUT = "punch_out";
    public static final String MODE_REGISTER = "register";

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextView userName;
    private TextView userMeta;
    private TextView sessionStatus;
    private TextView gpsText;
    private TextView messageText;
    private Button registerFaceBtn;
    private Button punchInBtn;
    private Button punchOutBtn;

    private boolean faceRegistered = false;
    private JSONObject openSession = null;
    private String pendingMode = "";

    private final ActivityResultLauncher<Intent> faceLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (result.getResultCode() != RESULT_OK || result.getData() == null) {
                    messageText.setText("Face capture cancelled.");
                    return;
                }
                Intent data = result.getData();
                String payload = data.getStringExtra(FaceCaptureActivity.EXTRA_DESCRIPTOR_JSON);
                String image = data.getStringExtra(FaceCaptureActivity.EXTRA_IMAGE);
                String mode = data.getStringExtra(FaceCaptureActivity.EXTRA_MODE);
                if (payload == null || image == null || mode == null) {
                    messageText.setText("Face data missing.");
                    return;
                }
                if (MODE_REGISTER.equals(mode)) {
                    registerFace(payload, image);
                } else if (MODE_PUNCH_IN.equals(mode)) {
                    punchWithFace(true, payload, image);
                } else if (MODE_PUNCH_OUT.equals(mode)) {
                    punchWithFace(false, payload, image);
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_dashboard);

        userName = findViewById(R.id.userName);
        userMeta = findViewById(R.id.userMeta);
        sessionStatus = findViewById(R.id.sessionStatus);
        gpsText = findViewById(R.id.gpsText);
        messageText = findViewById(R.id.messageText);
        registerFaceBtn = findViewById(R.id.registerFaceBtn);
        punchInBtn = findViewById(R.id.punchInBtn);
        punchOutBtn = findViewById(R.id.punchOutBtn);

        findViewById(R.id.logoutBtn).setOnClickListener(v -> logout());
        findViewById(R.id.langBtn).setOnClickListener(v -> toggleLang());
        findViewById(R.id.mapBtn).setOnClickListener(v -> openWeb("/native-map", getString(R.string.live_map)));
        findViewById(R.id.footprintsBtn).setOnClickListener(v -> openWeb("/dashboard/footprints", getString(R.string.footprints)));
        findViewById(R.id.leaveBtn).setOnClickListener(v -> openWeb("/dashboard/leave", getString(R.string.leave_request)));

        registerFaceBtn.setOnClickListener(v -> openFace(MODE_REGISTER));
        punchInBtn.setOnClickListener(v -> {
            pendingMode = MODE_PUNCH_IN;
            ensureLocationThenFace(MODE_PUNCH_IN);
        });
        punchOutBtn.setOnClickListener(v -> {
            pendingMode = MODE_PUNCH_OUT;
            ensureLocationThenFace(MODE_PUNCH_OUT);
        });

        LocationHelper.requestNotifications(this);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        messageText.setText("");
        io.execute(() -> {
            try {
                ApiClient api = new ApiClient(this);
                JSONObject me = api.getMe();
                JSONObject user = me.optJSONObject("user");
                if (user == null) {
                    runOnUiThread(this::logout);
                    return;
                }
                JSONObject att = api.getAttendance();
                JSONObject open = att.optJSONObject("open");
                runOnUiThread(() -> bind(user, open));
            } catch (Exception e) {
                runOnUiThread(() -> messageText.setText(e.getMessage() != null ? e.getMessage() : "Could not load dashboard"));
            }
        });
    }

    private void bind(JSONObject user, JSONObject open) {
        faceRegistered = !user.isNull("faceRegisteredAt") && user.opt("faceRegisteredAt") != null;
        openSession = open;
        userName.setText(user.optString("name", ""));
        userMeta.setText(user.optString("sectorAllotted", "") + " · " + user.optString("assemblyName", ""));

        registerFaceBtn.setVisibility(faceRegistered ? View.GONE : View.VISIBLE);
        if (open != null) {
            sessionStatus.setText(R.string.punched_in);
            punchInBtn.setVisibility(View.GONE);
            punchOutBtn.setVisibility(View.VISIBLE);
            gpsText.setText("Background GPS active — allow Always location for 30-min tracking.");
        } else {
            sessionStatus.setText(R.string.not_punched_in);
            punchInBtn.setVisibility(faceRegistered ? View.VISIBLE : View.GONE);
            punchOutBtn.setVisibility(View.GONE);
            gpsText.setText("");
        }
    }

    private void ensureLocationThenFace(String mode) {
        if (SecurityHelper.isVpnActive(this)) {
            messageText.setText(R.string.vpn_blocked);
            return;
        }
        if (SecurityHelper.hasKnownMockGpsApp(this)) {
            messageText.setText(R.string.mock_gps_blocked);
            return;
        }
        if (!LocationHelper.hasFineLocation(this)) {
            LocationHelper.requestLocationPermissions(this);
            pendingMode = mode;
            messageText.setText("Allow location, then tap punch again.");
            return;
        }
        messageText.setText("Getting GPS…");
        LocationHelper.getCurrentLocation(this, new LocationHelper.Callback() {
            @Override
            public void onResult(Location loc) {
                try {
                    SecurityHelper.assertSecureForPunch(DashboardActivity.this, loc);
                } catch (SecurityException e) {
                    messageText.setText(e.getMessage());
                    return;
                }
                gpsText.setText(String.format("GPS: %.6f, %.6f (±%.0fm)", loc.getLatitude(), loc.getLongitude(), loc.getAccuracy()));
                openFace(mode);
            }

            @Override
            public void onError(String message) {
                messageText.setText(message);
            }
        });
    }

    private void openFace(String mode) {
        Intent i = new Intent(this, FaceCaptureActivity.class);
        i.putExtra(FaceCaptureActivity.EXTRA_MODE, mode);
        faceLauncher.launch(i);
    }

    private void registerFace(String payloadJson, String image) {
        messageText.setText("Saving face…");
        io.execute(() -> {
            try {
                JSONArray descriptor;
                JSONArray samples;
                if (payloadJson.trim().startsWith("{")) {
                    JSONObject payload = new JSONObject(payloadJson);
                    descriptor = payload.getJSONArray("descriptor");
                    samples = payload.getJSONArray("samples");
                } else {
                    descriptor = new JSONArray(payloadJson);
                    samples = new JSONArray().put(descriptor);
                }
                new ApiClient(this).registerFace(descriptor, samples, image, false);
                runOnUiThread(() -> {
                    messageText.setText("Face registered.");
                    refresh();
                });
            } catch (Exception e) {
                runOnUiThread(() -> messageText.setText(e.getMessage() != null ? e.getMessage() : "Face register failed"));
            }
        });
    }

    private void punchWithFace(boolean punchIn, String descriptorJson, String image) {
        messageText.setText(punchIn ? "Punching in…" : "Punching out…");
        io.execute(() -> {
            try {
                LocationHelper.getCurrentLocation(DashboardActivity.this, new LocationHelper.Callback() {
                    @Override
                    public void onResult(Location loc) {
                        io.execute(() -> {
                            try {
                                SecurityHelper.assertSecureForPunch(DashboardActivity.this, loc);
                                JSONArray descriptor = new JSONArray(descriptorJson);
                                ApiClient api = new ApiClient(DashboardActivity.this);
                                JSONObject res;
                                if (punchIn) {
                                    res = api.punchIn(loc.getLatitude(), loc.getLongitude(), (double) loc.getAccuracy(), descriptor, image);
                                    JSONObject att = res.optJSONObject("attendance");
                                    String punchInAt = att != null ? att.optString("punchInAt", "") : "";
                                    if (!punchInAt.isEmpty()) {
                                        FieldLocationService.start(
                                                DashboardActivity.this,
                                                SessionStore.apiBase(DashboardActivity.this),
                                                SessionStore.token(DashboardActivity.this),
                                                punchInAt
                                        );
                                        runOnUiThread(() -> LocationHelper.requestBackgroundLocation(DashboardActivity.this));
                                    }
                                } else {
                                    res = api.punchOut(loc.getLatitude(), loc.getLongitude(), (double) loc.getAccuracy(), descriptor, image);
                                    FieldLocationService.stop(DashboardActivity.this);
                                }
                                runOnUiThread(() -> {
                                    messageText.setText(punchIn ? "Punched in." : "Punched out.");
                                    refresh();
                                });
                            } catch (Exception e) {
                                runOnUiThread(() -> messageText.setText(e.getMessage() != null ? e.getMessage() : "Punch failed"));
                            }
                        });
                    }

                    @Override
                    public void onError(String message) {
                        runOnUiThread(() -> messageText.setText(message));
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> messageText.setText(e.getMessage() != null ? e.getMessage() : "Punch failed"));
            }
        });
    }

    private void openWeb(String path, String title) {
        Intent i = new Intent(this, WebShellActivity.class);
        i.putExtra(WebShellActivity.EXTRA_PATH, path);
        i.putExtra(WebShellActivity.EXTRA_TITLE, title);
        startActivity(i);
    }

    private void toggleLang() {
        String next = "pa".equals(LocaleHelper.currentLang(this)) ? "en" : "pa";
        LocaleHelper.setLanguage(this, next);
        recreate();
    }

    private void logout() {
        FieldLocationService.stop(this);
        SessionStore.clear(this);
        startActivity(new Intent(this, LoginActivity.class));
        finish();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LocationHelper.REQ_LOCATION && pendingMode != null && !pendingMode.isEmpty()) {
            if (LocationHelper.hasFineLocation(this)) {
                ensureLocationThenFace(pendingMode);
            }
        }
    }

    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }
}
