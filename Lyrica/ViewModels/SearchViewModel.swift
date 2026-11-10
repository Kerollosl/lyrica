import Foundation
import Observation
import LyricaCore

@MainActor @Observable
final class SearchViewModel {
    var query = ""
    private(set) var results: [Song] = []
    private(set) var isLoading = false
    private(set) var error: String?
    private(set) var hasSearched = false
    /// The term the current results belong to (the text field may have moved on since).
    private(set) var searchedTerm = ""
    private let client: any SongSearching
    private var generation = UUID()
    /// Results by normalized term for this session, so repeating a search (or coming back to one) costs no request.
    private var cache: [String: (songs: [Song], at: Date)] = [:]
    private let cacheLifetime: TimeInterval = 600
    private let cacheLimit = 20

    init(client: any SongSearching = ITunesClient()) { self.client = client }

    /// Searches the trimmed query. The view calls this when the user submits, or when the field is cleared.
    /// `immediately` is kept for callers that retry; it skips the short settle delay.
    func search(immediately: Bool = false) async {
        let request = UUID()
        generation = request
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else {
            results = []
            error = nil
            hasSearched = false
            isLoading = false
            searchedTerm = ""
            return
        }
        defer { if generation == request { isLoading = false } }
        do {
            if !immediately { try await Task.sleep(for: .milliseconds(150)) }
            try Task.checkCancellation()
            guard generation == request else { return }
            let key = Self.cacheKey(term)
            if let hit = cache[key], Date().timeIntervalSince(hit.at) < cacheLifetime {
                results = hit.songs
                error = nil
                hasSearched = true
                searchedTerm = term
                return
            }
            results = []
            error = nil
            hasSearched = false
            isLoading = true
            let songs: [Song]
            if term.lowercased().hasPrefix("https://") || term.lowercased().hasPrefix("http://") {
                guard let url = URL(string: term) else { throw LyricaError.invalidAppleMusicURL }
                songs = [try await client.song(fromAppleMusicURL: url)]
            } else { songs = try await client.search(term) }
            try Task.checkCancellation()
            guard generation == request else { return }
            remember(songs, for: key)
            results = songs
            searchedTerm = term
            hasSearched = true
        } catch is CancellationError { }
        catch {
            guard generation == request, !Task.isCancelled else { return }
            self.error = error.localizedDescription
            searchedTerm = term
            hasSearched = true
        }
    }

    /// Case, accents and extra spaces don't change what a search means.
    static func cacheKey(_ term: String) -> String {
        term.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    private func remember(_ songs: [Song], for key: String) {
        cache[key] = (songs, Date())
        if cache.count > cacheLimit, let oldest = cache.min(by: { $0.value.at < $1.value.at })?.key { cache[oldest] = nil }
    }
}
