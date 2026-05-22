import Foundation
import Observation

/// Owns the per-device bearer token. There's no user-visible sign-in
/// flow — the first launch generates a stable device UUID, stores it in
/// the Keychain, and exchanges it at `/api/auth/device-mint` for a
/// long-lived JWT. Every subsequent launch reuses whatever's cached.
///
/// The bearer JWT is identical in shape to the one the SIWA flow used
/// to mint, so every existing `/api/data/*` route works unchanged via
/// the bearer-token path in `getCurrentUser()`.
@MainActor
@Observable
final class AuthStore {
    static let shared = AuthStore()

    private let tokenKey    = "auth_token"
    private let userIDKey   = "user_id"
    private let deviceIDKey = "device_id"

    var token: String?
    var userID: String?
    /// True once we have a bearer token cached (either restored from
    /// Keychain or freshly minted). The app UI doesn't gate on this
    /// anymore — every screen renders immediately and any sync calls
    /// that fire before mint completes will retry on the next attempt.
    var isReady: Bool { token != nil }

    private init() {
        token  = Keychain.get(tokenKey)
        userID = Keychain.get(userIDKey)
    }

    /// Call once at app launch. If a bearer token is already cached the
    /// call returns immediately. Otherwise it mints one against the
    /// per-device UUID and stores both in the Keychain. Safe to invoke
    /// repeatedly — concurrent calls are coalesced.
    func ensureSignedIn() async {
        if token != nil { return }
        if let inflight = inflightTask {
            _ = await inflight.value
            return
        }
        let task = Task { await mintDeviceBoundToken() }
        inflightTask = task
        _ = await task.value
        inflightTask = nil
    }

    func signOut() {
        Keychain.delete(tokenKey)
        Keychain.delete(userIDKey)
        token = nil
        userID = nil
    }

    // MARK: - Private

    private var inflightTask: Task<Void, Never>?

    private func mintDeviceBoundToken() async {
        let deviceId = stableDeviceID()
        struct Body: Encodable { let deviceId: String }
        struct Resp: Decodable { let token: String; let userId: String }
        do {
            let resp: Resp = try await APIClient.shared.post(
                "/api/auth/device-mint",
                body: Body(deviceId: deviceId),
                as: Resp.self,
                authenticated: false
            )
            Keychain.set(resp.token,  forKey: tokenKey)
            Keychain.set(resp.userId, forKey: userIDKey)
            token  = resp.token
            userID = resp.userId
        } catch {
            // Stays nil; next call to ensureSignedIn() retries. Pending
            // syncs will keep their `needsSync = true` flag and drain
            // on the next foreground.
            print("[AuthStore] device-mint failed: \(error)")
        }
    }

    /// Read the stable device UUID from the Keychain, generating one
    /// the first time. We keep it in the Keychain rather than
    /// UserDefaults so deleting the app doesn't clear it — the user's
    /// data stays bound to the same backend `users` row across
    /// reinstalls.
    private func stableDeviceID() -> String {
        if let cached = Keychain.get(deviceIDKey) { return cached }
        let fresh = UUID().uuidString.lowercased()
        Keychain.set(fresh, forKey: deviceIDKey)
        return fresh
    }
}
