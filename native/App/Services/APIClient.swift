import Foundation

/// Thin URLSession wrapper hitting the existing Vercel API routes.
/// Long-term we can replace these endpoints with CloudKit or on-device
/// Foundation Models, but the existing backend works as-is for free.
@MainActor
final class APIClient {
    static let shared = APIClient()

    /// Override this if you point the native app at a local Next dev
    /// server (CAP_DEV_URL equivalent).
    var baseURL = URL(string: "https://life-os-carter.vercel.app")!

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 30
        return URLSession(configuration: config)
    }()

    enum APIError: Error {
        case badStatus(Int)
        case decoding(Error)
        case transport(Error)
    }

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await session.data(for: req)
            try validate(response: response)
            return try JSONDecoder.lifeOS.decode(T.self, from: data)
        } catch let e as APIError {
            throw e
        } catch let e as DecodingError {
            throw APIError.decoding(e)
        } catch {
            throw APIError.transport(error)
        }
    }

    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        as type: T.Type
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONEncoder.lifeOS.encode(body)
        let (data, response) = try await session.data(for: req)
        try validate(response: response)
        return try JSONDecoder.lifeOS.decode(T.self, from: data)
    }

    private func validate(response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(-1)
        }
        if !(200..<300).contains(http.statusCode) {
            throw APIError.badStatus(http.statusCode)
        }
    }
}

extension JSONDecoder {
    /// Decoder configured for the Vercel API — ISO-8601 dates, lowerCamel keys.
    static let lifeOS: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        d.keyDecodingStrategy = .useDefaultKeys
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
