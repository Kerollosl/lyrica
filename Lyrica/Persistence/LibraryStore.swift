import CryptoKit
import Foundation
import SwiftData
import LyricaCore

/// All persistence goes through the main actor's context. Callers decide whether
/// they have permission to cache content; passing nil stores song metadata only.
@MainActor
final class LibraryStore {
    let context: ModelContext
    // ModelContext alone does not guarantee the lifetime of an in-memory store.
    // Keep its container alive for as long as this repository can access models.
    private let container: ModelContainer

    init(context: ModelContext) {
        self.context = context
        self.container = context.container
    }

    @discardableResult
    func upsert(song: Song, document: LyricDocument? = nil) throws -> StoredSong {
        let record: StoredSong
        if let existing = try storedSong(id: song.id) {
            record = existing
            record.updateMetadata(from: song)
            record.lastViewed = .now
            if let document {
                if let previous = record.document, previous.text != document.text {
                    try removeTranslations(for: previous)
                }
                record.cache(document)
            }
        } else {
            record = StoredSong(song: song, document: document)
            context.insert(record)
        }
        try context.save()
        return record
    }

    func storedSong(id: Int) throws -> StoredSong? {
        let songID = id
        var descriptor = FetchDescriptor<StoredSong>(predicate: #Predicate { $0.id == songID })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }

    func cachedDocument(for song: Song) throws -> LyricDocument? {
        try storedSong(id: song.id)?.document
    }

    func setFavorite(_ favorite: Bool, for song: Song) throws {
        let record = try upsert(song: song)
        record.isFavorite = favorite
        try context.save()
    }

    func translation(for document: LyricDocument, targetLanguage: String,
                     sourceLanguage: String?) throws -> [String]? {
        let key = Self.translationKey(document: document, target: targetLanguage, source: sourceLanguage)
        var descriptor = FetchDescriptor<CachedTranslation>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        guard let data = try context.fetch(descriptor).first?.linesData,
              let lines = try? JSONDecoder().decode([String].self, from: data),
              lines.count == document.lines.count else { return nil }
        return lines
    }

    func cacheTranslation(_ lines: [String], for document: LyricDocument,
                          targetLanguage: String, sourceLanguage: String?) throws {
        guard lines.count == document.lines.count else { throw CacheError.misalignedTranslation }
        let key = Self.translationKey(document: document, target: targetLanguage, source: sourceLanguage)
        let data = try JSONEncoder().encode(lines)
        var descriptor = FetchDescriptor<CachedTranslation>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        if let cached = try context.fetch(descriptor).first {
            cached.linesData = data
            cached.createdAt = .now
        } else {
            context.insert(CachedTranslation(key: key, contentDigest: Self.contentDigest(document), targetLanguage: targetLanguage,
                                             sourceLanguage: sourceLanguage, linesData: data))
        }
        try context.save()
    }

    func recordSearch(_ query: String) throws {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let normalized = trimmed.folding(options: [.caseInsensitive, .diacriticInsensitive],
                                          locale: Locale(identifier: "en_US_POSIX"))
        var descriptor = FetchDescriptor<RecentSearch>(predicate: #Predicate { $0.normalizedQuery == normalized })
        descriptor.fetchLimit = 1
        if let recent = try context.fetch(descriptor).first {
            recent.query = trimmed
            recent.searchedAt = .now
        } else {
            context.insert(RecentSearch(query: trimmed, normalizedQuery: normalized))
        }
        let ordered = try context.fetch(FetchDescriptor<RecentSearch>(sortBy: [SortDescriptor(\.searchedAt, order: .reverse)]))
        for old in ordered.dropFirst(12) { context.delete(old) }
        try context.save()
    }

    func remove(_ song: StoredSong) throws {
        if let document = song.document {
            try removeTranslations(for: document)
        }
        context.delete(song)
        try context.save()
    }

    func clearRecentSearches() throws {
        try context.delete(model: RecentSearch.self)
        try context.save()
    }

    func clearCachedContent() throws {
        for song in try context.fetch(FetchDescriptor<StoredSong>()) {
            song.originalText = nil
            song.originalSource = nil
        }
        try context.delete(model: CachedTranslation.self)
        try context.save()
    }

    func deleteAll() throws {
        try context.delete(model: CachedTranslation.self)
        try context.delete(model: RecentSearch.self)
        try context.delete(model: StoredSong.self)
        try context.save()
    }

    static func translationKey(document: LyricDocument, target: String, source: String?) -> String {
        // JSON avoids delimiter collisions; source text in the digest invalidates
        // stale translations when manually edited lyrics replace previous text.
        let identity = ["lyrica.translation.v1", source?.lowercased() ?? "auto", target.lowercased(), document.text]
        let bytes = (try? JSONEncoder().encode(identity)) ?? Data()
        return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }

    private static func contentDigest(_ document: LyricDocument) -> String {
        SHA256.hash(data: Data(document.text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func removeTranslations(for document: LyricDocument) throws {
        let digest = Self.contentDigest(document)
        let descriptor = FetchDescriptor<CachedTranslation>(predicate: #Predicate { $0.contentDigest == digest })
        for translation in try context.fetch(descriptor) { context.delete(translation) }
    }

    enum CacheError: LocalizedError {
        case misalignedTranslation

        var errorDescription: String? {
            "The translation could not be saved because its lines do not match the original lyrics."
        }
    }
}
