import Foundation

public protocol LyricsProviding: Sendable {
    func lyrics(for song: Song) async throws -> LyricDocument
}

public struct LRCLIBClient: LyricsProviding {
    private let client: HTTPClient

    public init(transport: any HTTPTransport = URLSessionTransport(), paced: Bool = true) {
        client = HTTPClient(transport: transport, paced: paced)
    }

    public func lyrics(for song: Song) async throws -> LyricDocument {
        var items = [URLQueryItem(name: "track_name", value: song.title),
                     URLQueryItem(name: "artist_name", value: song.artist),
                     URLQueryItem(name: "album_name", value: song.album)]
        if song.duration > 0 {
            items.append(URLQueryItem(name: "duration", value: String(Int(song.duration.rounded()))))
        }
        do {
            let exact = try await client.get(LRCLIBRecord.self, url: url(path: "get", items: items))
            if LyricsMatcher.score(exact, for: song) != nil {
                return try exact.document()
            }
        } catch LyricaError.lyricsNotFound {
            // A missing exact recording is expected; search conservatively using its metadata.
        }
        let candidates = try await client.get([LRCLIBRecord].self, url: url(path: "search", items: [
            URLQueryItem(name: "track_name", value: song.title),
            URLQueryItem(name: "artist_name", value: song.artist)
        ]))
        return try LyricsMatcher.best(candidates, for: song).document()
    }

    private func url(path: String, items: [URLQueryItem]) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "lrclib.net"
        components.path = "/api/\(path)"
        components.queryItems = items
        return components.url!
    }
}

struct LRCLIBRecord: Decodable, Sendable {
    let id: Int
    let trackName: String
    let artistName: String
    let albumName: String?
    let duration: Double?
    let instrumental: Bool
    let plainLyrics: String?
    let syncedLyrics: String?

    func document() throws -> LyricDocument {
        guard !instrumental else { throw LyricaError.instrumental }
        for text in [plainLyrics, syncedLyrics].compactMap({ $0 }) {
            let document = LyricDocument(text: text, source: .lrclib)
            if !document.text.isEmpty { return document }
        }
        throw LyricaError.lyricsNotFound
    }
}

enum LyricsMatcher {
    static func score(_ candidate: LRCLIBRecord, for song: Song) -> Double? {
        guard LyricsText.normalized(candidate.trackName) == LyricsText.normalized(song.title),
              LyricsText.normalized(candidate.artistName) == LyricsText.normalized(song.artist) else { return nil }
        let albumMatches = !song.album.isEmpty && LyricsText.normalized(candidate.albumName ?? "") == LyricsText.normalized(song.album)
        let duration = candidate.duration ?? 0
        if duration > 0 && song.duration > 0 {
            let difference = abs(duration - song.duration)
            guard difference <= 5 else { return nil }
            return 1 + (albumMatches ? 0.3 : 0) + (5 - difference) * 0.04
        }
        // Without duration, an exact album is the remaining recording identifier.
        return albumMatches ? 1.1 : nil
    }

    static func best(_ candidates: [LRCLIBRecord], for song: Song) throws -> LRCLIBRecord {
        let ranked = candidates.compactMap { record -> (LRCLIBRecord, Double)? in
            guard let score = score(record, for: song) else { return nil }
            return (record, score)
        }.sorted { $0.1 > $1.1 }
        guard let winner = ranked.first else { throw LyricaError.lyricsNotFound }
        for alternative in ranked.dropFirst() where winner.1 - alternative.1 < 0.08 {
            // Reissued duplicates with identical text are safe; conflicting words are not.
            let firstText = try? winner.0.document().text
            let otherText = try? alternative.0.document().text
            if firstText != otherText || winner.0.instrumental != alternative.0.instrumental {
                throw LyricaError.ambiguousLyrics
            }
        }
        return winner.0
    }
}
