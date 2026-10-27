import XCTest
import SwiftData
import LyricaCore
@testable import Lyrica

private struct MissingLyrics: LyricsProviding {
    func lyrics(for song: Song) async throws -> LyricDocument { throw LyricaError.lyricsNotFound }
}

private struct UnexpectedNetworkSearch: SongSearching {
    func search(_ query: String) async throws -> [Song] { throw LyricaError.server(599) }
    func song(fromAppleMusicURL url: URL) async throws -> Song { throw LyricaError.server(599) }
}

@MainActor
final class ViewModelTests: XCTestCase {
    func testCancellationDuringDebounceDoesNotSurfaceNetworkError() async {
        let model = SearchViewModel(client: UnexpectedNetworkSearch())
        model.query = "A song"
        let task = Task { await model.search() }
        task.cancel()
        await task.value
        XCTAssertNil(model.error)
        XCTAssertFalse(model.hasSearched)
        XCTAssertFalse(model.isLoading)
    }

    func testUnavailableLyricsStillCreateMetadataHistory() async throws {
        let container = try ModelContainer(for: StoredSong.self, CachedTranslation.self, RecentSearch.self,
                                           configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let store = LibraryStore(context: container.mainContext)
        let name = "ViewModelTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let settings = AppSettings(defaults: defaults)
        let song = Song(id: 99, title: "Unavailable", artist: "Artist", album: "Album", duration: 180)
        let model = ReaderViewModel(song: song, provider: MissingLyrics())
        await model.load(store: store, settings: settings)
        XCTAssertNotNil(model.lyricsError)
        XCTAssertNil(model.document)
        XCTAssertEqual(try store.storedSong(id: song.id)?.song, song)
        model.useManual("Hola\n\nMundo", store: store, settings: settings)
        XCTAssertNil(model.lyricsError)
        XCTAssertEqual(model.document?.lines, ["Hola", "", "Mundo"])
        XCTAssertNil(try store.cachedDocument(for: song))
    }

    func testCachedTranslationBypassesNativeTranslationSession() async throws {
        let container = try ModelContainer(for: StoredSong.self, CachedTranslation.self, RecentSearch.self,
                                           configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let store = LibraryStore(context: container.mainContext)
        let name = "ViewModelTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let settings = AppSettings(defaults: defaults)
        let song = Song(id: 100, title: "Cached", artist: "Artist", album: "Album", duration: 180)
        let document = LyricDocument(text: "Hola\n\nMundo", source: .manual)
        try store.upsert(song: song, document: document)
        try store.cacheTranslation(["Hello", "", "World"], for: document, targetLanguage: "en", sourceLanguage: "es")
        let model = ReaderViewModel(song: song, provider: MissingLyrics())
        await model.load(store: store, settings: settings)
        model.sourceOverride = "es"
        await model.prepareTranslation(store: store, settings: settings)
        XCTAssertEqual(model.translated, ["Hello", "", "World"])
        XCTAssertNil(model.request)
        XCTAssertFalse(model.isTranslating)
        model.targetLanguage = "fr"
        await model.prepareTranslation(store: store, settings: settings)
        XCTAssertTrue(model.translated.isEmpty)
        model.targetLanguage = "en"
        await model.prepareTranslation(store: store, settings: settings)
        XCTAssertEqual(model.translated, ["Hello", "", "World"])
    }
}
