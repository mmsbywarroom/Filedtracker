package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LoginActivity extends AppCompatActivity {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TextView statusText;
    private View otpLayout;
    private Button verifyBtn;
    private String pendingPhone = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        statusText = findViewById(R.id.statusText);
        otpLayout = findViewById(R.id.otpLayout);
        verifyBtn = findViewById(R.id.verifyBtn);
        Button sendOtpBtn = findViewById(R.id.sendOtpBtn);

        sendOtpBtn.setOnClickListener(v -> {
            String phone = ((com.google.android.material.textfield.TextInputEditText) findViewById(R.id.phoneInput))
                    .getText().toString().trim();
            if (phone.length() != 10) {
                statusText.setText("Enter a valid 10-digit mobile number.");
                return;
            }
            pendingPhone = phone;
            sendOtpBtn.setEnabled(false);
            statusText.setText("Sending OTP…");
            io.execute(() -> {
                try {
                    ApiClient.requestOtp(phone);
                    runOnUiThread(() -> {
                        sendOtpBtn.setEnabled(true);
                        statusText.setText("OTP sent to +91 " + phone);
                        otpLayout.setVisibility(View.VISIBLE);
                        verifyBtn.setVisibility(View.VISIBLE);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        sendOtpBtn.setEnabled(true);
                        statusText.setText(e.getMessage() != null ? e.getMessage() : "Could not send OTP");
                    });
                }
            });
        });

        verifyBtn.setOnClickListener(v -> {
            String otp = ((com.google.android.material.textfield.TextInputEditText) findViewById(R.id.otpInput))
                    .getText().toString().trim();
            if (otp.length() != 6) {
                statusText.setText("Enter the 6-digit OTP.");
                return;
            }
            verifyBtn.setEnabled(false);
            statusText.setText("Verifying…");
            io.execute(() -> {
                try {
                    JSONObject res = ApiClient.verifyOtp(pendingPhone, otp);
                    String token = res.optString("token", "");
                    String apiBase = res.optString("apiBaseUrl", AppConfig.API_BASE);
                    if (token.isEmpty()) throw new ApiClient.ApiError(401, "No session token returned.");
                    SessionStore.save(LoginActivity.this, token, apiBase, pendingPhone, "");
                    runOnUiThread(() -> {
                        startActivity(new Intent(this, DashboardActivity.class));
                        finish();
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        verifyBtn.setEnabled(true);
                        statusText.setText(e.getMessage() != null ? e.getMessage() : "Verification failed");
                    });
                }
            });
        });
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }
}
