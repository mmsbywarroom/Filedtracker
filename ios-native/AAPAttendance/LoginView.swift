import SwiftUI

struct LoginView: View {
    var onLoggedIn: () -> Void
    @State private var phone = ""
    @State private var otp = ""
    @State private var otpSent = false
    @State private var busy = false
    @State private var message = ""
    @State private var isError = false
    @State private var langTick = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                HStack {
                    Spacer()
                    Button {
                        LocaleStore.toggle()
                        langTick += 1
                    } label: {
                        Image(systemName: "globe")
                            .foregroundColor(AapTheme.textMuted)
                            .padding(8)
                    }
                }
                ZStack {
                    Circle().fill(AapTheme.yellow.opacity(0.18)).frame(width: 150, height: 150)
                    AapBrandMark(height: 72)
                }
                .padding(.top, 8)
                Text(LocaleStore.t("Aam Aadmi Party", "ਆਮ ਆਦਮੀ ਪਾਰਟੀ"))
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(AapTheme.textPrimary)
                    .multilineTextAlignment(.center)
                Text(LocaleStore.t("Field Attendance", "ਫੀਲਡ ਹਾਜ਼ਰੀ"))
                    .font(.title3.weight(.semibold))
                    .foregroundColor(AapTheme.yellow)
                    .tracking(3)
                AapAccentBar()
                AapCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(otpSent
                             ? LocaleStore.t("Enter the OTP we sent you", "ਭੇਜਿਆ OTP ਦਰਜ ਕਰੋ")
                             : LocaleStore.t("Login with your mobile number", "ਮੋਬਾਈਲ ਨੰਬਰ ਨਾਲ ਲਾਗਇਨ"))
                            .font(.title3.weight(.semibold))
                            .foregroundColor(AapTheme.textPrimary)
                        Text(otpSent
                             ? LocaleStore.t("6-digit code, valid for a few minutes.", "6-ਅੰਕਾਂ ਦਾ ਕੋਡ, ਕੁਝ ਮਿੰਟ ਲਈ ਵੈਧ।")
                             : LocaleStore.t("Use the number registered with your assembly office.", "ਅਸੈਂਬਲੀ ਆਫਿਸ ਵਿਖੇ ਰਜਿਸਟਰ ਨੰਬਰ ਵਰਤੋ।"))
                            .font(.subheadline)
                            .foregroundColor(AapTheme.textMuted)
                        field(LocaleStore.t("Mobile number (+91)", "ਮੋਬਾਈਲ ਨੰਬਰ (+91)"), text: $phone, limit: 10, disabled: otpSent || busy)
                        if otpSent {
                            field(LocaleStore.t("6-digit OTP", "6-ਅੰਕ OTP"), text: $otp, limit: 6, disabled: busy)
                        }
                        Button(action: submit) {
                            HStack {
                                if busy { ProgressView().tint(AapTheme.navy) }
                                Text(otpSent
                                     ? LocaleStore.t("Verify & login", "ਤਸਦੀਕ ਕਰੋ")
                                     : LocaleStore.t("Send OTP", "OTP ਭੇਜੋ"))
                                    .fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(AapTheme.yellow)
                            .foregroundColor(AapTheme.navy)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .disabled(busy)
                        if otpSent && !busy {
                            Button(LocaleStore.t("Change number", "ਨੰਬਰ ਬਦਲੋ")) {
                                otpSent = false
                                otp = ""
                                message = ""
                            }
                            .foregroundColor(AapTheme.blueSoft)
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
                if !message.isEmpty {
                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(isError ? AapTheme.danger : AapTheme.textMuted)
                        .multilineTextAlignment(.center)
                }
                Text(LocaleStore.t("Secure • GPS verified • Face verified", "ਸੁਰੱਖਿਅਤ • GPS • ਚਿਹਰਾ"))
                    .font(.caption)
                    .foregroundColor(AapTheme.textMuted.opacity(0.7))
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 24)
        }
        .id(langTick)
        .background(AapTheme.navyDeep.ignoresSafeArea())
    }

    private func field(_ label: String, text: Binding<String>, limit: Int, disabled: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(AapTheme.textMuted)
            TextField("", text: text)
                .keyboardType(.numberPad)
                .disabled(disabled)
                .padding(14)
                .background(AapTheme.navy.opacity(0.45))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(AapTheme.yellow.opacity(0.5), lineWidth: 1))
                .foregroundColor(AapTheme.textPrimary)
                .onChange(of: text.wrappedValue) { new in
                    let clipped = String(new.filter(\.isNumber).prefix(limit))
                    if clipped != new { text.wrappedValue = clipped }
                }
        }
    }

    private func submit() {
        if busy { return }
        isError = false
        Task {
            if !otpSent {
                guard phone.count == 10 else {
                    isError = true
                    message = "Enter a valid 10-digit mobile number."
                    return
                }
                busy = true
                message = "Sending OTP…"
                do {
                    try await ApiClient.requestOtp(phone: phone)
                    otpSent = true
                    message = "OTP sent to +91 \(phone)"
                } catch {
                    isError = true
                    message = error.localizedDescription
                }
                busy = false
            } else {
                guard otp.count == 6 else {
                    isError = true
                    message = "Enter the 6-digit OTP."
                    return
                }
                busy = true
                message = "Verifying…"
                do {
                    let res = try await ApiClient.verifyOtp(phone: phone, otp: otp)
                    let token = res.string("token") ?? ""
                    guard !token.isEmpty else { throw ApiError(statusCode: 0, message: "No session token returned.") }
                    SessionStore.save(token: token, apiBase: res.string("apiBaseUrl") ?? AppConfig.apiBase, phone: phone)
                    onLoggedIn()
                } catch {
                    isError = true
                    message = error.localizedDescription
                }
                busy = false
            }
        }
    }
}
