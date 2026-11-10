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

/// Shared pacing keeps rapid searches, retries and concurrent readers from flooding either API.
/// Normal use never waits: a host allows a short burst, then spaces requests only once the burst is spent.
/// After an HTTP 429 the host is left alone until its cooldown ends.
actor RequestPacer {
    static let shared = RequestPacer()

    struct Policy: Sendable {
        var minInterval: TimeInterval   // gap between two requests to the host
        var burst: Int                  // requests allowed inside `window` before spacing applies
        var window: TimeInterval
        /// Apple documents roughly 20 iTunes Search calls per minute; stay under it without a fixed 3 s gap.
        static let iTunes = Policy(minInterval: 0.25, burst: 12, window: 60)
        static let standard = Policy(minInterval: 0.4, burst: 1_000, window: 60)
        static func forHost(_ host: String) -> Policy { host == "itunes.apple.com" ? .iTunes : .standard }
    }

    private var nextRequest: [String: Date] = [:]
    private var recent: [String: [Date]] = [:]
    private var blockedUntil: [String: Date] = [:]
    /// Longest wait we will impose on the user. Beyond this the request fails fast with `rateLimited`.
    private let maxWait: TimeInterval = 15

    func wait(host: String, policy: Policy) async throws {
        while true {
            try Task.checkCancellation()
            let now = Date()
            if let until = blockedUntil[host] {
                if until > now { throw LyricaError.rateLimited }
                blockedUntil[host] = nil
            }
            var stamps = (recent[host] ?? []).filter { now.timeIntervalSince($0) < policy.window }
            recent[host] = stamps
            var delay = (nextRequest[host] ?? now).timeIntervalSince(now)
            if stamps.count >= policy.burst, let oldest = stamps.first {
                delay = max(delay, oldest.addingTimeInterval(policy.window).timeIntervalSince(now))
            }
            if delay > maxWait { throw LyricaError.rateLimited }
            if delay > 0 {
                try await Task.sleep(for: .seconds(delay))
                // Recheck after suspension: another task may have claimed the slot.
                continue
            }
            stamps.append(now)
            recent[host] = stamps
            nextRequest[host] = now.addingTimeInterval(policy.minInterval)
            return
        }
    }

    /// Called after a 429: no requests to this host until `seconds` have passed.
    func cooldown(host: String, seconds: TimeInterval) {
        blockedUntil[host] = Date().addingTimeInterval(seconds)
    }
}

struct HTTPClient: Sendable {
    let transport: any HTTPTransport
    let paced: Bool

    func get<T: Decodable & Sendable>(_ type: T.Type, url: URL, notFoundError: LyricaError = .lyricsNotFound) async throws -> T {
        for attempt in 0...1 {
            try Task.checkCancellation()
            if paced {
                let host = url.host ?? ""
                try await RequestPacer.shared.wait(host: host, policy: .forHost(host))
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
                case 429:
                    if paced { await RequestPacer.shared.cooldown(host: url.host ?? "", seconds: Self.retryAfter(response)) }
                    throw LyricaError.rateLimited
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

    /// The server's Retry-After (seconds) when it sends one, kept between 5 and 120 seconds.
    static func retryAfter(_ response: HTTPURLResponse) -> TimeInterval {
        let requested = response.value(forHTTPHeaderField: "Retry-After").flatMap { Double($0) } ?? 30
        return min(max(requested, 5), 120)
    }
}
