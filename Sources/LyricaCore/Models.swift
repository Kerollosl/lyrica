import Foundation

public struct Song: Identifiable, Codable, Hashable, Sendable {
    public let id: Int
    public let title: String
    public let artist: String
    public let album: String
    public let duration: TimeInterval
    public let artworkURL: URL?
    public let appleMusicURL: URL?

    public init(id: Int, title: String, artist: String, album: String, duration: TimeInterval,
                artworkURL: URL? = nil, appleMusicURL: URL? = nil) {
        self.id = id
        self.title = title
        self.artist = artist
        self.album = album
        self.duration = duration
        self.artworkURL = artworkURL
        self.appleMusicURL = appleMusicURL
    }
}

public enum LyricSource: String, Codable, Hashable, Sendable {
    case lrclib, manual
}

public struct LyricDocument: Codable, Hashable, Sendable {
    public let text: String
    public let source: LyricSource

    public init(text: String, source: LyricSource) {
        self.text = LyricsText.clean(text)
        self.source = source
    }

    public var lines: [String] { text.isEmpty ? [] : text.components(separatedBy: "\n") }
    public var attribution: String {
        switch source {
        case .lrclib: "Lyrics provided by LRCLIB. Rights belong to their respective owners."
        case .manual: "Lyrics supplied by you. Rights belong to their respective owners."
        }
    }
}

public enum LyricsText {
    /// Removes LRC timing/metadata without discarding verse boundaries or lyrics in brackets.
    public static func clean(_ input: String) -> String {
        let normalized = input.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let metadata = #"^\s*\[(?:ar|ti|al|by|offset|re|ve|length):[^\]]*\]\s*$"#
        let timestamps = #"\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]"#
        let wordTimestamps = #"<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>"#
        return normalized.components(separatedBy: "\n").compactMap { line -> String? in
            if line.range(of: metadata, options: [.regularExpression, .caseInsensitive]) != nil {
                return nil
            }
            return line.replacingOccurrences(of: timestamps, with: "", options: .regularExpression)
                .replacingOccurrences(of: wordTimestamps, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
        }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// A conservative comparison: punctuation, case and diacritics do not identify a recording.
    /// Version words (live, remix, acoustic…) remain significant.
    public static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }.joined(separator: " ")
    }
}

public enum LyricaError: Error, LocalizedError, Equatable, Sendable {
    case invalidAppleMusicURL
    case songNotFound
    case lyricsNotFound
    case instrumental
    case ambiguousLyrics
    case rateLimited
    case networkUnavailable
    case invalidResponse
    case server(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidAppleMusicURL:
            "Paste an Apple Music song link. For an album link, choose Share Song in Apple Music."
        case .songNotFound:
            "This song isn’t available in the linked Apple Music storefront. Try searching by title and artist."
        case .lyricsNotFound:
            "We couldn’t find lyrics for this recording. You can paste lyrics you’re permitted to use."
        case .instrumental:
            "This recording is listed as instrumental. If that’s incorrect, you can paste your own lyrics."
        case .ambiguousLyrics:
            "Several recordings have similar lyrics matches. To avoid showing the wrong words, paste lyrics for this version."
        case .rateLimited:
            "The lyrics or song service is busy. Wait a minute, then try again."
        case .networkUnavailable:
            "Couldn’t connect. Check your connection or open a song in your library for offline reading."
        case .invalidResponse:
            "The service returned an unexpected response. Please try again."
        case .server:
            "The service is temporarily unavailable. Please try again later."
        }
    }
}
