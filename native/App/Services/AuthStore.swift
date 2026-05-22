import Foundation
import Observation
import AuthenticationServices

/// Owns the native bearer token + user ID. Inject via @Environment so
/// every screen (and APIClient) can see auth state. Sign-in happens
/// inside `mint(...)`; sign-out clears the Keychain + resets state.
@MainActor
@Observable
final class AuthStore {
    static let shared = AuthStore()

    private let tokenKey  = "auth_token"
    private let userIDKey = "user_id"

    var token: String?
    var userID: String?
    var isSignedIn: Bool { token != nil }

    private init() {
        token  = Keychain.get(tokenKey)
        userID = Keychain.get(userIDKey)
    }

    /// Exchange an Apple identityToken for a long-lived bearer JWT from
    /// our backend, then persist it. On success the store flips to
    /// `isSignedIn == true` which the root view observes to dismiss
    /// the sign-in gate.
    func mint(appleIdentityToken: String, bundleID: String) async throws {
        struct Body: Encodable { let identityToken: String; let bundleId: String }
        struct Resp: Decodable { let token: String; let userId: String }

        let resp: Resp = try await APIClient.shared.post(
            "/api/auth/native-mint",
            body: Body(identityToken: appleIdentityToken, bundleId: bundleID),
            as: Resp.self,
            authenticated: false
        )
        Keychain.set(resp.token,  forKey: tokenKey)
        Keychain.set(resp.userId, forKey: userIDKey)
        token  = resp.token
        userID = resp.userId
    }

    func signOut() {
        Keychain.delete(tokenKey)
        Keychain.delete(userIDKey)
        token = nil
        userID = nil
    }
}
