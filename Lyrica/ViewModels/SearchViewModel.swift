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
    private let client: any SongSearching
    private var generation = UUID()

    init(client: any SongSearching = ITunesClient()) { self.client = client }

    func search(immediately: Bool = false) async {
        let request = UUID()
        generation = request
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        results = []
        error = nil
        hasSearched = false
        guard !term.isEmpty else { isLoading = false; return }
        isLoading = true
        defer { if generation == request { isLoading = false } }
        do {
            if !immediately { try await Task.sleep(for: .milliseconds(350)) }
            try Task.checkCancellation()
            let songs: [Song]
            if term.lowercased().hasPrefix("https://") || term.lowercased().hasPrefix("http://") {
                guard let url = URL(string: term) else { throw LyricaError.invalidAppleMusicURL }
                songs = [try await client.song(fromAppleMusicURL: url)]
            } else { songs = try await client.search(term) }
            try Task.checkCancellation()
            guard generation == request else { return }
            results = songs
            hasSearched = true
        } catch is CancellationError { }
        catch {
            guard generation == request, !Task.isCancelled else { return }
            self.error = error.localizedDescription
            hasSearched = true
        }
    }
}
