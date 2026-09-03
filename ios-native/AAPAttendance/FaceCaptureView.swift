import AVFoundation
import SwiftUI
import UIKit
import Vision

struct FaceCaptureView: View {
    let mode: FaceMode
    var onFinished: ([String: Any], String, FaceMode) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var faceCount = 0
    @State private var goodHits = 0
    @State private var status = "Point the front camera at your face."
    @State private var busy = false
    @State private var autoFired = false
    @State private var hasCamera = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    @State private var captureTick = 0

    private var selfTest: Bool { mode == .check }
    private var autoPunch: Bool { !selfTest }
    private var needHits: Int { mode == .register ? 4 : 2 }
    private var locked: Bool { faceCount == 1 }
    private var frameColor: Color {
        if busy { return AapTheme.yellow }
        if locked { return AapTheme.success }
        return AapTheme.textMuted.opacity(0.45)
    }

    var body: some View {
        AapScreenScaffold(
            title: title,
            subtitle: subtitle,
            onBack: { dismiss() }
        ) {
            VStack(spacing: 12) {
                ZStack {
                    CameraPreview(
                        isBusy: busy,
                        captureTick: captureTick,
                        onFaces: { count in
                            faceCount = count
                            if count == 1 { goodHits += 1 } else { goodHits = 0 }
                        },
                        onJpeg: { data in
                            handleJpeg(data)
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(frameColor, lineWidth: 5)
                }
                .aspectRatio(3 / 4, contentMode: .fit)
                .padding(.horizontal, 20)

                Text(busy && autoPunch ? "Hold still — matching…" : status)
                    .font(.subheadline)
                    .foregroundColor(AapTheme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                if selfTest {
                    Button {
                        captureTick += 1
                    } label: {
                        Text("Capture")
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(AapTheme.yellow)
                            .foregroundColor(AapTheme.navy)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(busy || !hasCamera)
                    .padding(.horizontal, 20)
                }
                Spacer(minLength: 8)
            }
        }
        .onAppear {
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async {
                    hasCamera = ok
                    if !ok { status = "Camera permission is required for face capture." }
                }
            }
        }
        .onChange(of: goodHits) { hits in
            guard autoPunch, hasCamera, !busy, !autoFired, hits >= needHits else { return }
            autoFired = true
            captureTick += 1
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
        case .register: return "Hold still — auto capture"
        case .punchIn, .punchOut: return "Hold still — auto punch"
        case .check: return "Camera self-test"
        }
    }

    private func handleJpeg(_ data: Data) {
        let dataUrl = "data:image/jpeg;base64," + data.base64EncodedString()
        if selfTest {
            busy = false
            autoFired = false
            status = "Camera and face detection are working (\(dataUrl.count) chars encoded)."
            return
        }
        busy = true
        status = "Matching face…"
        Task {
            do {
                let payload = try await ApiClient.describeFace(imageDataUrl: dataUrl)
                if payload.doubles("descriptor").isEmpty {
                    throw ApiError(statusCode: 0, message: "No face found in the photo. Try again.")
                }
                onFinished(payload, dataUrl, mode)
                dismiss()
            } catch {
                status = error.localizedDescription
                autoFired = false
                goodHits = 0
                busy = false
            }
        }
    }
}

private struct CameraPreview: UIViewRepresentable {
    var isBusy: Bool
    var captureTick: Int
    var onFaces: (Int) -> Void
    var onJpeg: (Data) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFaces: onFaces, onJpeg: onJpeg) }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        context.coordinator.attach(to: view)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        context.coordinator.onFaces = onFaces
        context.coordinator.onJpeg = onJpeg
        context.coordinator.busy = isBusy
        if captureTick != context.coordinator.lastTick {
            context.coordinator.lastTick = captureTick
            if captureTick > 0 { context.coordinator.captureStill() }
        }
    }

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class Coordinator: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
        var onFaces: (Int) -> Void
        var onJpeg: (Data) -> Void
        var busy = false
        var lastTick = 0
        private let session = AVCaptureSession()
        private let queue = DispatchQueue(label: "aap.face.camera")
        private var lastBuffer: CVPixelBuffer?
        private var lastCount = -1

        init(onFaces: @escaping (Int) -> Void, onJpeg: @escaping (Data) -> Void) {
            self.onFaces = onFaces
            self.onJpeg = onJpeg
        }

        func attach(to view: PreviewView) {
            session.sessionPreset = .medium
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input)
            else { return }
            session.addInput(input)
            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(output) { session.addOutput(output) }
            if let conn = output.connection(with: .video) {
                conn.videoOrientation = .portrait
                if conn.isVideoMirroringSupported { conn.isVideoMirrored = true }
            }
            view.previewLayer.session = session
            view.previewLayer.videoGravity = .resizeAspectFill
            queue.async { self.session.startRunning() }
        }

        func stop() {
            queue.async { self.session.stopRunning() }
        }

        func captureStill() {
            queue.async {
                guard let buffer = self.lastBuffer else { return }
                let ci = CIImage(cvPixelBuffer: buffer)
                let ctx = CIContext()
                guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return }
                let image = UIImage(cgImage: cg)
                guard let data = image.jpegData(compressionQuality: 0.72) else { return }
                DispatchQueue.main.async { self.onJpeg(data) }
            }
        }

        func captureOutput(
            _ output: AVCaptureOutput,
            didOutput sampleBuffer: CMSampleBuffer,
            from connection: AVCaptureConnection
        ) {
            guard !busy, let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
            lastBuffer = pixel
            let handler = VNImageRequestHandler(cvPixelBuffer: pixel, orientation: .leftMirrored, options: [:])
            let request = VNDetectFaceRectanglesRequest()
            try? handler.perform([request])
            let count = request.results?.count ?? 0
            if count != lastCount {
                lastCount = count
            }
            DispatchQueue.main.async { self.onFaces(count) }
        }
    }
}

final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
