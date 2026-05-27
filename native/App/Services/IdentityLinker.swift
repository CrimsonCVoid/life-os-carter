import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// Drives the Apple SIWA and Google OAuth flows from inside the app
/// AFTER the user is already signed in via the device-bound bearer.
/// On success it sends the resulting identity token to
/// `/api/auth/link-identity`, which migrates the device user's data
/// over to the identity-bound user and returns a fresh bearer JWT.
///
/// The flows are intentionally async-throwing so the caller can show
/// a single "Linking…" → success or error toast in Settings.
@MainActor
final class IdentityLinker: NSObject {
    static let shared = IdentityLinker()
    private override init() {}

    private let bundleID = "com.hbrady.lifeos"

    // MARK: - Public entry points

    enum LinkError: LocalizedError {
        case userCancelled
        case noIdentityToken
        case backendRejected(String)
        case configMissing(String)

        var errorDescription: String? {
            switch self {
            case .userCancelled:           return "Cancelled."
            case .noIdentityToken:         return "No identity token came back from the provider."
            case .backendRejected(let s):  return "Backend rejected the link: \(s)"
            case .configMissing(let s):    return "Config missing: \(s)"
            }
        }
    }

    func linkApple() async throws {
        let token = try await runAppleAuth()
        try await postLink(provider: "apple", idToken: token, bundleId: bundleID)
    }

    func linkGoogle() async throws {
        let token = try await runGoogleAuth()
        try await postLink(provider: "google", idToken: token, bundleId: nil)
    }

    // MARK: - Apple SIWA

    private func runAppleAuth() async throws -> String {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            let delegate = AppleAuthDelegate(continuation: continuation)
            controller.delegate = delegate
            controller.presentationContextProvider = delegate
            self.appleDelegate = delegate          // retain
            controller.performRequests()
        }
    }

    /// Kept alive while a SIWA request is in flight (delegate is weak).
    private var appleDelegate: AppleAuthDelegate?

    private final class AppleAuthDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
        let continuation: CheckedContinuation<String, Error>
        init(continuation: CheckedContinuation<String, Error>) {
            self.continuation = continuation
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization auth: ASAuthorization) {
            guard
                let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                let data = cred.identityToken,
                let token = String(data: data, encoding: .utf8)
            else {
                continuation.resume(throwing: LinkError.noIdentityToken)
                return
            }
            continuation.resume(returning: token)
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            // ASAuthorizationError.canceled = 1001
            let nsError = error as NSError
            if nsError.domain == ASAuthorizationError.errorDomain && nsError.code == ASAuthorizationError.canceled.rawValue {
                continuation.resume(throwing: LinkError.userCancelled)
            } else {
                continuation.resume(throwing: error)
            }
        }

        func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            // Find the active key window.
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }

    // MARK: - Google OAuth (ASWebAuthenticationSession — no SDK)

    /// Google iOS OAuth client ID. Set this to the *iOS*-type client ID
    /// you created in Google Cloud Console → APIs & Services → Credentials.
    /// The reverse-DNS form is also used as the callback URL scheme.
    private var googleClientID: String? {
        // Read from Info.plist so the project file is the source of truth
        // rather than hardcoding a secret-ish identifier in source.
        Bundle.main.object(forInfoDictionaryKey: "GOOGLE_IOS_CLIENT_ID") as? String
    }

    private func runGoogleAuth() async throws -> String {
        guard let clientID = googleClientID, !clientID.isEmpty else {
            throw LinkError.configMissing("GOOGLE_IOS_CLIENT_ID Info.plist key")
        }
        // Google iOS OAuth uses the reversed client ID as the URL scheme.
        let parts = clientID.split(separator: ".").map(String.init).reversed()
        let reversed = parts.joined(separator: ".")
        let callbackScheme = reversed
        let redirectURI = "\(reversed):/oauth2redirect"

        // iOS-type OAuth clients only support the authorization-code +
        // PKCE flow; requesting `response_type=id_token` (implicit) from
        // one returns `unsupported_response_type`. So we run the code
        // dance, then exchange the code for tokens. Installed-app clients
        // are public — the /token call carries no client_secret. The
        // resulting id_token is audienced to this iOS client ID, which is
        // exactly what the backend's verifyGoogleIdToken audience check
        // wants.
        let verifier = Self.randomCodeVerifier()
        let challenge = Self.codeChallenge(for: verifier)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id",            value: clientID),
            URLQueryItem(name: "response_type",         value: "code"),
            URLQueryItem(name: "scope",                 value: "openid email profile"),
            URLQueryItem(name: "redirect_uri",          value: redirectURI),
            URLQueryItem(name: "code_challenge",        value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "prompt",                value: "select_account"),
        ]

        let code: String = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            let session = ASWebAuthenticationSession(
                url: components.url!,
                callbackURLScheme: callbackScheme
            ) { callback, error in
                if let error {
                    let ns = error as NSError
                    if ns.domain == ASWebAuthenticationSessionError.errorDomain
                        && ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        continuation.resume(throwing: LinkError.userCancelled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                // Authorization-code flow returns `code` in the query string.
                guard
                    let callback,
                    let comps = URLComponents(url: callback, resolvingAgainstBaseURL: false),
                    let code = comps.queryItems?.first(where: { $0.name == "code" })?.value,
                    !code.isEmpty
                else {
                    continuation.resume(throwing: LinkError.noIdentityToken)
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = GooglePresentationProvider.shared
            session.prefersEphemeralWebBrowserSession = false
            if !session.start() {
                continuation.resume(throwing: LinkError.configMissing("ASWebAuthenticationSession failed to start"))
            }
            self.googleSession = session
        }

        return try await Self.exchangeCodeForIdToken(
            code: code,
            verifier: verifier,
            clientID: clientID,
            redirectURI: redirectURI
        )
    }

    /// Exchanges a PKCE authorization code for Google tokens and returns
    /// the `id_token`. No client_secret — iOS OAuth clients are public.
    private static func exchangeCodeForIdToken(
        code: String,
        verifier: String,
        clientID: String,
        redirectURI: String
    ) async throws -> String {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "client_id",     value: clientID),
            URLQueryItem(name: "code",          value: code),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "grant_type",    value: "authorization_code"),
            URLQueryItem(name: "redirect_uri",  value: redirectURI),
        ]
        req.httpBody = form.percentEncodedQuery?.data(using: .utf8)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw LinkError.backendRejected("Google token exchange failed: \(body)")
        }
        struct TokenResponse: Decodable { let idToken: String?
            enum CodingKeys: String, CodingKey { case idToken = "id_token" }
        }
        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        guard let idToken = decoded.idToken, !idToken.isEmpty else {
            throw LinkError.noIdentityToken
        }
        return idToken
    }

    // MARK: - PKCE

    private static func randomCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64URLEncode(Data(bytes))
    }

    private static func codeChallenge(for verifier: String) -> String {
        let hash = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncode(Data(hash))
    }

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private var googleSession: ASWebAuthenticationSession?

    private final class GooglePresentationProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
        static let shared = GooglePresentationProvider()
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }

    // MARK: - Backend POST

    private func postLink(provider: String, idToken: String, bundleId: String?) async throws {
        struct Body: Encodable {
            let provider: String
            let idToken: String
            let bundleId: String?
        }
        struct Resp: Decodable {
            let token: String
            let userId: String
            let merged: Bool?
        }
        do {
            let resp: Resp = try await APIClient.shared.post(
                "/api/auth/link-identity",
                body: Body(provider: provider, idToken: idToken, bundleId: bundleId),
                as: Resp.self
            )
            // Replace the cached bearer + userId so subsequent requests
            // are scoped to the new identity user. AuthStore exposes a
            // setter so this stays the only place that mutates the
            // Keychain.
            AuthStore.shared.adopt(token: resp.token, userId: resp.userId)
            Haptics.success()
        } catch let APIClient.APIError.badStatus(_, body) {
            throw LinkError.backendRejected(body ?? "unknown")
        } catch {
            throw error
        }
    }
}
