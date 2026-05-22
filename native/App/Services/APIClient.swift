import Foundation
import UIKit

/// Thin URLSession wrapper around the Vercel backend. Auto-attaches the
/// native bearer token (minted by Sign in with Apple) to every request
/// unless explicitly opted out. Supports JSON GET/POST, streaming SSE
/// for Gemini, and multipart upload for the food-photo Gemini route.
@MainActor
final class APIClient {
    static let shared = APIClient()

    /// Override via `APIClient.shared.baseURL = …` if pointing at a
    /// preview deploy or local Next dev server.
    var baseURL = URL(string: "https://life-os-carter.vercel.app")!

    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.waitsForConnectivity = true
        c.timeoutIntervalForRequest = 30
        return URLSession(configuration: c)
    }()

    enum APIError: Error, LocalizedError {
        case badStatus(Int, String?)
        case decoding(Error)
        case transport(Error)
        case unauthenticated

        var errorDescription: String? {
            switch self {
            case .badStatus(let code, let body):
                return "Server error \(code): \(body ?? "")"
            case .decoding(let e):  return "Couldn't parse response: \(e.localizedDescription)"
            case .transport(let e): return "Network error: \(e.localizedDescription)"
            case .unauthenticated:  return "Not signed in"
            }
        }
    }

    // MARK: - Request building

    private func makeRequest(
        path: String,
        method: String = "GET",
        authenticated: Bool = true
    ) -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated, let token = AuthStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    // MARK: - Plain JSON

    func get<T: Decodable>(_ path: String, as type: T.Type, authenticated: Bool = true) async throws -> T {
        var req = makeRequest(path: path, method: "GET", authenticated: authenticated)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, resp) = try await session.data(for: req)
            try validate(response: resp, data: data, authenticated: authenticated)
            return try JSONDecoder.lifeOS.decode(T.self, from: data)
        } catch let e as APIError { throw e }
          catch let e as DecodingError { throw APIError.decoding(e) }
          catch { throw APIError.transport(error) }
    }

    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        as type: T.Type,
        authenticated: Bool = true
    ) async throws -> T {
        var req = makeRequest(path: path, method: "POST", authenticated: authenticated)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder.lifeOS.encode(body)
        let (data, resp) = try await session.data(for: req)
        try validate(response: resp, data: data, authenticated: authenticated)
        return try JSONDecoder.lifeOS.decode(T.self, from: data)
    }

    func delete(_ path: String, authenticated: Bool = true) async throws {
        let req = makeRequest(path: path, method: "DELETE", authenticated: authenticated)
        let (data, resp) = try await session.data(for: req)
        try validate(response: resp, data: data, authenticated: authenticated)
    }

    // MARK: - Streaming (Server-Sent Events) — used by /api/overseer

    /// Stream a POST endpoint that emits text chunks (SSE or raw
    /// text stream). Yields each line as it arrives.
    func stream<B: Encodable>(
        _ path: String,
        body: B,
        authenticated: Bool = true
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var req = makeRequest(path: path, method: "POST", authenticated: authenticated)
                    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    req.httpBody = try JSONEncoder.lifeOS.encode(body)
                    let (bytes, resp) = try await session.bytes(for: req)
                    try validate(response: resp, data: nil, authenticated: authenticated)
                    for try await line in bytes.lines {
                        // Pass raw lines through — caller strips SSE
                        // prefixes ("data: ", etc.) if needed. The
                        // existing /api/overseer route emits plain
                        // text chunks, no SSE envelope.
                        continuation.yield(line)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Multipart upload (Gemini food photo)

    func uploadJPEG<T: Decodable>(
        _ path: String,
        image: UIImage,
        fieldName: String = "photo",
        as type: T.Type,
        authenticated: Bool = true
    ) async throws -> T {
        guard let imageData = image.jpegData(compressionQuality: 0.82) else {
            throw APIError.transport(NSError(domain: "APIClient", code: -1))
        }
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = makeRequest(path: path, method: "POST", authenticated: authenticated)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, resp) = try await URLSession.shared.upload(for: req, from: body)
        try validate(response: resp, data: data, authenticated: authenticated)
        return try JSONDecoder.lifeOS.decode(T.self, from: data)
    }

    // MARK: - Multipart upload (Gemini voice-meal / voice-journal)

    /// POSTs raw audio bytes under the `audio` field — used by the
    /// /api/voice-meal and /api/voice-journal Gemini routes which both
    /// accept multipart with that field name.
    func uploadAudio<T: Decodable>(
        _ path: String,
        audioURL: URL,
        mimeType: String = "audio/m4a",
        fieldName: String = "audio",
        as type: T.Type,
        authenticated: Bool = true
    ) async throws -> T {
        let audioData: Data
        do {
            audioData = try Data(contentsOf: audioURL)
        } catch {
            throw APIError.transport(error)
        }
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = makeRequest(path: path, method: "POST", authenticated: authenticated)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"clip.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, resp) = try await URLSession.shared.upload(for: req, from: body)
        try validate(response: resp, data: data, authenticated: authenticated)
        return try JSONDecoder.lifeOS.decode(T.self, from: data)
    }

    // MARK: - Shared

    private func validate(response: URLResponse, data: Data?, authenticated: Bool) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(-1, nil)
        }
        if http.statusCode == 401 && authenticated {
            // Stale token — wipe so the UI re-routes to the sign-in gate.
            AuthStore.shared.signOut()
            throw APIError.unauthenticated
        }
        if !(200..<300).contains(http.statusCode) {
            let bodyStr = data.flatMap { String(data: $0, encoding: .utf8) }
            throw APIError.badStatus(http.statusCode, bodyStr)
        }
    }
}

extension JSONDecoder {
    static let lifeOS: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

extension JSONEncoder {
    static let lifeOS: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
