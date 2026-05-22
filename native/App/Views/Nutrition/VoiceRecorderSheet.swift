import SwiftUI
import AVFoundation

/// Press-and-hold voice recorder. Records to a temp .m4a, ships the
/// file to `/api/voice-meal`, and routes the parsed payload to the
/// review sheet. Auto-stops at 30s for safety.
///
/// Visual state machine:
///   .idle      → big mic button, "Hold to record" hint
///   .recording → red ring, elapsed timer, "Release to send"
///   .uploading → spinner, "Asking Gemini…"
///   .error(s)  → red toast with reason + Try again button
struct VoiceRecorderSheet: View {
    var onResult: (MealCapturePayload) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var state: RecorderState = .idle
    @State private var elapsed: TimeInterval = 0
    @State private var recorder: AVAudioRecorder?
    @State private var clipURL: URL?
    @State private var pollTimer: Timer?

    enum RecorderState: Equatable {
        case idle
        case recording
        case uploading
        case error(String)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Top close
            HStack {
                Spacer()
                Button { stopAndDismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg2)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(LifeOSColor.elevated))
                }
                .padding(.trailing, 16)
                .padding(.top, 12)
            }

            Spacer()

            VStack(spacing: 20) {
                Text("Voice log")
                    .font(.system(size: 11, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                Text(promptText)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                micButton

                Group {
                    switch state {
                    case .recording:
                        Text(formattedElapsed)
                            .font(.system(size: 36, weight: .bold, design: .rounded).monospacedDigit())
                            .foregroundStyle(LifeOSColor.danger)
                    case .uploading:
                        HStack(spacing: 10) {
                            ProgressView().tint(LifeOSColor.accent)
                            Text("Analyzing…")
                                .font(.system(size: 14))
                                .foregroundStyle(LifeOSColor.fg2)
                        }
                    case .error(let msg):
                        VStack(spacing: 6) {
                            Text(msg)
                                .font(.system(size: 13))
                                .foregroundStyle(LifeOSColor.danger)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                            Button("Try again") {
                                state = .idle
                            }
                            .foregroundStyle(LifeOSColor.accent)
                        }
                    case .idle:
                        Text("Hold the mic and describe what you ate.")
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .frame(height: 60)
            }

            Spacer()
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .onDisappear { teardown() }
    }

    private var promptText: String {
        switch state {
        case .idle:      return "What did you eat?"
        case .recording: return "Recording…"
        case .uploading: return "Estimating macros…"
        case .error:     return "Something went wrong"
        }
    }

    private var formattedElapsed: String {
        let s = Int(elapsed)
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    // MARK: - Mic button

    private var micButton: some View {
        let isRecording = state == .recording
        return ZStack {
            Circle()
                .stroke(
                    isRecording ? LifeOSColor.danger : LifeOSColor.accent,
                    lineWidth: 3
                )
                .frame(width: 132, height: 132)
                .opacity(isRecording ? 0.6 : 1)
            Circle()
                .fill(
                    isRecording
                        ? LifeOSColor.danger
                        : LifeOSColor.accent
                )
                .frame(width: 108, height: 108)
                .shadow(color: (isRecording ? LifeOSColor.danger : LifeOSColor.accent).opacity(0.5), radius: 18)
            Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(.white)
        }
        .scaleEffect(isRecording ? 1.05 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isRecording)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if case .idle = state, recorder == nil {
                        startRecording()
                    }
                }
                .onEnded { _ in
                    if case .recording = state {
                        stopAndUpload()
                    }
                }
        )
    }

    // MARK: - Recording

    private func startRecording() {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meal-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 22_050,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let rec = try AVAudioRecorder(url: url, settings: settings)
            rec.prepareToRecord()
            rec.record(forDuration: 30)
            self.recorder = rec
            self.clipURL = url
            self.elapsed = 0
            self.state = .recording
            Haptics.tap()
            pollTimer?.invalidate()
            pollTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                Task { @MainActor in
                    if let r = self.recorder, r.isRecording {
                        self.elapsed = r.currentTime
                    } else if case .recording = self.state {
                        // Auto-stopped at 30s.
                        self.stopAndUpload()
                    }
                }
            }
        } catch {
            self.state = .error("Couldn't start recording: \(error.localizedDescription)")
        }
    }

    private func stopAndUpload() {
        pollTimer?.invalidate()
        pollTimer = nil
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])

        guard let url = clipURL, FileManager.default.fileExists(atPath: url.path),
              let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? Int, size > 1024 else {
            state = .error("That clip was too short. Hold the mic a bit longer.")
            return
        }
        state = .uploading
        Haptics.tick()
        Task {
            do {
                let payload: MealCapturePayload = try await APIClient.shared.uploadAudio(
                    "/api/voice-meal",
                    audioURL: url,
                    as: MealCapturePayload.self
                )
                onResult(payload)
                dismiss()
            } catch {
                state = .error("Upload failed: \(error.localizedDescription)")
            }
        }
    }

    private func stopAndDismiss() {
        pollTimer?.invalidate()
        pollTimer = nil
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        dismiss()
    }

    private func teardown() {
        pollTimer?.invalidate()
        pollTimer = nil
        recorder?.stop()
        recorder = nil
    }
}
