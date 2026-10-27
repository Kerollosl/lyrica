import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession
    private static let serviceSession: URLSession = {
        // Offline storage is an explicit app-level choice. Do not let HTTP's
        // default disk cache retain lyrics independently of that setting.
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    public init(session: URLSession? = nil) { self.session = session ?? Self.serviceSession }

    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw LyricaError.invalidResponse }
        return (data, response)
    }
}

/// Shared pacing prevents rapid searches, retries and concurrent readers from flooding either API.
actor RequestPacer {
    static let shared = RequestPacer()
    private var nextRequest: [String: Date] = [:]

    func wait(host: String, interval: TimeInterval) async throws {
        while true {
            try Task.checkCancellation()
            let now = Date()
            let delay = (nextRequest[host] ?? now).timeIntervalSince(now)
            if delay > 0 {
                try await Task.sleep(for: .seconds(delay))
                // Recheck after suspension: another task may have claimed the next slot.
                continue
            }
            nextRequest[host] = now.addingTimeInterval(interval)
            return
        }
    }
}

struct HTTPClient: Sendable {
    let transport: any HTTPTransport
    let paced: Bool

    func get<T: Decodable & Sendable>(_ type: T.Type, url: URL, notFoundError: LyricaError = .lyricsNotFound) async throws -> T {
        for attempt in 0...1 {
            try Task.checkCancellation()
            if paced {
                try await RequestPacer.shared.wait(host: url.host ?? "", interval: url.host == "itunes.apple.com" ? 3.1 : 0.4)
            }
            var request = URLRequest(url: url, timeoutInterval: 20)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Lyrica/1.0 (https://github.com/Kerollosl/lyrica)", forHTTPHeaderField: "User-Agent")
            do {
                let (data, response) = try await transport.data(for: request)
                try Task.checkCancellation()
                switch response.statusCode {
                case 200...299:
                    do { return try JSONDecoder().decode(type, from: data) }
                    catch { throw LyricaError.invalidResponse }
                case 404: throw notFoundError
                case 429: throw LyricaError.rateLimited
                case 500...599 where attempt == 0:
                    try await Task.sleep(for: .milliseconds(500))
                    continue
                default: throw LyricaError.server(response.statusCode)
                }
            } catch let error as URLError {
                if error.code == .cancelled { throw CancellationError() }
                throw LyricaError.networkUnavailable
            }
        }
        throw LyricaError.invalidResponse
    }
}
