import XCTest
import SwiftData
import LyricaCore
@testable import Lyrica

@MainActor
final class PersistenceTests: XCTestCase {
    private func makeStore() throws -> (ModelContainer, LibraryStore) {
        let schema = Schema([StoredSong.self, CachedTranslation.self, RecentSearch.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return (container, LibraryStore(context: container.mainContext))
    }

    private var song: Song {
        Song(id: 42, title: "A song", artist: "An artist", album: "An album", duration: 180)
    }

    func testMetadataOnlyHistoryDoesNotCacheLyrics() throws {
        let (container, store) = try makeStore()
        let record = try store.upsert(song: song)
        XCTAssertEqual(record.song, song)
        XCTAssertNil(try store.cachedDocument(for: song))
        XCTAssertEqual(try container.mainContext.fetchCount(FetchDescriptor<StoredSong>()), 1)
    }

    func testUpsertPreservesFavoriteAndPermittedLyricsWithoutDuplicates() throws {
        let (_, store) = try makeStore()
        let document = LyricDocument(text: "First line\n\nNext verse", source: .manual)
        try store.upsert(song: song, document: document)
        try store.setFavorite(true, for: song)
        let updated = try store.upsert(song: song)
        XCTAssertTrue(updated.isFavorite)
        XCTAssertEqual(try store.cachedDocument(for: song), document)
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<StoredSong>()), 1)
    }

    func testTranslationsAreSeparatedByLanguageAndInvalidatedBySourceEdits() throws {
        let (_, store) = try makeStore()
        let original = LyricDocument(text: "Hello\n\nWorld", source: .manual)
        let spanish = ["Hola", "", "Mundo"]
        try store.cacheTranslation(spanish, for: original, targetLanguage: "es", sourceLanguage: "en")
        XCTAssertEqual(try store.translation(for: original, targetLanguage: "es", sourceLanguage: "en"), spanish)
        XCTAssertNil(try store.translation(for: original, targetLanguage: "fr", sourceLanguage: "en"))
        let edited = LyricDocument(text: "Hello\n\nEveryone", source: .manual)
        XCTAssertNil(try store.translation(for: edited, targetLanguage: "es", sourceLanguage: "en"))
        XCTAssertThrowsError(try store.cacheTranslation(["Hola"], for: original, targetLanguage: "es", sourceLanguage: "en"))
    }

    func testClearingContentPreservesFavoriteMetadata() throws {
        let (_, store) = try makeStore()
        let document = LyricDocument(text: "A line", source: .manual)
        try store.upsert(song: song, document: document)
        try store.setFavorite(true, for: song)
        try store.cacheTranslation(["Una línea"], for: document, targetLanguage: "es", sourceLanguage: "en")
        try store.clearCachedContent()
        XCTAssertTrue(try XCTUnwrap(store.storedSong(id: song.id)).isFavorite)
        XCTAssertNil(try store.cachedDocument(for: song))
        XCTAssertNil(try store.translation(for: document, targetLanguage: "es", sourceLanguage: "en"))
    }

    func testRemovingSongAlsoRemovesItsTranslation() throws {
        let (_, store) = try makeStore()
        let document = LyricDocument(text: "A line", source: .manual)
        let record = try store.upsert(song: song, document: document)
        try store.cacheTranslation(["Una línea"], for: document, targetLanguage: "es", sourceLanguage: "en")
        try store.remove(record)
        XCTAssertNil(try store.storedSong(id: song.id))
        XCTAssertNil(try store.translation(for: document, targetLanguage: "es", sourceLanguage: "en"))
    }

    func testReplacingLyricsRemovesThePreviousCachedTranslation() throws {
        let (_, store) = try makeStore()
        let original = LyricDocument(text: "First draft", source: .manual)
        try store.upsert(song: song, document: original)
        try store.cacheTranslation(["Primer borrador"], for: original, targetLanguage: "es", sourceLanguage: "en")
        let edited = LyricDocument(text: "Second draft", source: .manual)
        try store.upsert(song: song, document: edited)
        XCTAssertNil(try store.translation(for: original, targetLanguage: "es", sourceLanguage: "en"))
        XCTAssertEqual(try store.cachedDocument(for: song), edited)
    }

    func testRecentSearchesAreDeduplicatedAndBounded() throws {
        let (_, store) = try makeStore()
        try store.recordSearch("  Café  ")
        try store.recordSearch("CAFE")
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<RecentSearch>()), 1)
        for index in 0..<20 { try store.recordSearch("Song \(index)") }
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<RecentSearch>()), 12)
        try store.deleteAll()
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<RecentSearch>()), 0)
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<StoredSong>()), 0)
        XCTAssertEqual(try store.context.fetchCount(FetchDescriptor<CachedTranslation>()), 0)
    }

    func testSettingsDefaultToEnglishAndRequireCachingOptIn() throws {
        let name = "LyricaTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.defaultLanguage, "en")
        XCTAssertEqual(settings.fontSize, 18)
        XCTAssertFalse(settings.cacheLyrics)
        settings.defaultLanguage = "ar"
        settings.appearance = .dark
        settings.cacheLyrics = true
        let reloaded = AppSettings(defaults: defaults)
        XCTAssertEqual(reloaded.defaultLanguage, "ar")
        XCTAssertEqual(reloaded.appearance, .dark)
        XCTAssertTrue(reloaded.cacheLyrics)
    }
}
