import SwiftUI
import AuthenticationServices

/// Initial sign-in gate. Shown until `AuthStore.shared.isSignedIn`
/// flips true (which happens after the Apple identity token has been
/// exchanged for our backend's bearer JWT via /api/auth/native-mint).
struct SignInView: View {
    @Environment(AuthStore.self) private var auth
    @State private var error: String?
    @State private var working = false

    /// Match the bundle ID Apple included in the identityToken audience
    /// claim — must equal the iOS app's PRODUCT_BUNDLE_IDENTIFIER.
    private let bundleID = "com.hbrady.lifeos"

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [LifeOSColor.base, Color(hex: 0x0A0A12)],
                startPoint: .top, endPoint: .bottom
            ).ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()
                heroBlock
                Spacer()
                appleButton
                if let error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.danger)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                Text("By continuing you agree to sync workouts + health data with your Life OS account.")
                    .font(.system(size: 10))
                    .foregroundStyle(LifeOSColor.fg3)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, 24)
        }
        .preferredColorScheme(.dark)
    }

    private var heroBlock: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(LifeOSColor.accent.opacity(0.4))
                    .blur(radius: 32).scaleEffect(0.7)
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.Metric.peak],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
            }
            .frame(width: 110, height: 110)

            VStack(spacing: 6) {
                Text("Life OS")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(.white)
                Text("Your day, glanceable.")
                    .font(.system(size: 14))
                    .foregroundStyle(LifeOSColor.fg2)
            }
        }
    }

    private var appleButton: some View {
        SignInWithAppleButton(.signIn,
            onRequest: { req in req.requestedScopes = [.fullName, .email] },
            onCompletion: handleResult
        )
        .signInWithAppleButtonStyle(.white)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .opacity(working ? 0.6 : 1)
        .disabled(working)
        .overlay {
            if working {
                ProgressView().tint(.black)
            }
        }
    }

    private func handleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let err):
            error = err.localizedDescription
        case .success(let authResult):
            guard
                let cred = authResult.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = cred.identityToken,
                let token = String(data: tokenData, encoding: .utf8)
            else {
                error = "Couldn't read Apple identity token"
                return
            }
            working = true
            error = nil
            Task {
                do {
                    try await auth.mint(appleIdentityToken: token, bundleID: bundleID)
                    Haptics.success()
                } catch {
                    self.error = error.localizedDescription
                    Haptics.error()
                }
                working = false
            }
        }
    }
}
