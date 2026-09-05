import SwiftUI

/// Fast punch/register: on-device face-api WebView (no server Matching face…).
struct FaceCaptureView: View {
    let mode: FaceMode
    var onFinished: ([String: Any], String, FaceMode) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var status = "Hold still — matching on device…"
    @State private var failed = false

    private var selfTest: Bool { mode == .check }

    var body: some View {
        AapScreenScaffold(
            title: title,
            subtitle: subtitle,
            onBack: { dismiss() }
        ) {
            if selfTest {
                Text("Camera self-test uses the native preview.")
                    .foregroundColor(AapTheme.textMuted)
                    .padding()
                // Keep a minimal self-test path without server describe.
                Button("Done") { dismiss() }
                    .padding()
            } else {
                ZStack {
                    NativeFaceWebView(
                        mode: mode,
                        onCaptured: { descriptorJson, image in
                            let payload = parsePayload(descriptorJson)
                            onFinished(payload, image, mode)
                            dismiss()
                        },
                        onCancel: {
                            failed = true
                            status = "Cancelled — try again."
                            dismiss()
                        }
                    )
                    .ignoresSafeArea(edges: .bottom)

                    if failed {
                        Text(status)
                            .font(.subheadline)
                            .foregroundColor(AapTheme.danger)
                            .padding()
                    }
                }
            }
        }
    }

    private var title: String {
        switch mode {
        case .register: return "Register face"
        case .punchIn: return "Punch in"
        case .punchOut: return "Punch out"
        case .check: return "Face check"
        }
    }

    private var subtitle: String {
        switch mode {
        case .register: return "On-device face match"
        case .punchIn, .punchOut: return "Hold still — auto punch"
        case .check: return "Camera self-test"
        }
    }

    private func parsePayload(_ json: String) -> [String: Any] {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data)
        else { return [:] }
        if let dict = obj as? [String: Any] { return dict }
        if let arr = obj as? [Any] { return ["descriptor": arr] }
        return [:]
    }
}
