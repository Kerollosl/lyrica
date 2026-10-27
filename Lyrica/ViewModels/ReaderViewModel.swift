import Foundation
import Observation
import Translation
import LyricaCore

struct TranslationRequest: Identifiable {
    let id: UUID
    let document: LyricDocument
    let source: String?
    let target: String
}

@MainActor @Observable
final class ReaderViewModel {
    let song: Song
    private(set) var document: LyricDocument?
    private(set) var translated: [String] = []
    private(set) var isLoading = false
    private(set) var lyricsError: String?
    private(set) var translationMessage: String?
    private(set) var isTranslating = false
    private(set) var request: TranslationRequest?
    var targetLanguage = "en"
    var sourceOverride = "auto"
    var isFavorite = false
    var storageError: String?
    private let provider: any LyricsProviding
    private var generation = UUID()
    private var memoryTranslations: [String: [String]] = [:]

    init(song: Song, provider: any LyricsProviding = LRCLIBClient()) {
        self.song = song
        self.provider = provider
    }

    var sourceLanguage: String? {
        sourceOverride == "auto" ? document.flatMap { LanguageCatalog.detect($0.text) } : sourceOverride
    }

    func load(store: LibraryStore, settings: AppSettings) async {
        guard document == nil, !isLoading else { return }
        isLoading = true
        lyricsError = nil
        targetLanguage = settings.defaultLanguage
        defer { isLoading = false }
        do {
            if let stored = try store.storedSong(id: song.id) {
                isFavorite = stored.isFavorite
                document = stored.document
            }
            if document == nil { document = try await provider.lyrics(for: song) }
            try Task.checkCancellation()
            try store.upsert(song: song, document: settings.cacheLyrics ? document : nil)
        } catch is CancellationError { }
        catch {
            if document == nil { lyricsError = error.localizedDescription }
            else { storageError = error.localizedDescription }
        }
    }

    func useManual(_ text: String, store: LibraryStore, settings: AppSettings) {
        generation = UUID()
        request = nil
        let replacement = LyricDocument(text: text, source: .manual)
        guard !replacement.lines.isEmpty else { return }
        document = replacement
        translated = []
        lyricsError = nil
        do { try store.upsert(song: song, document: settings.cacheLyrics ? replacement : nil) }
        catch { storageError = error.localizedDescription }
    }

    func prepareTranslation(store: LibraryStore, settings: AppSettings) async {
        let token = UUID()
        generation = token
        request = nil
        translated = []
        translationMessage = nil
        isTranslating = false
        guard let document, !document.lines.isEmpty else { return }
        let source = sourceLanguage
        let target = targetLanguage
        let key = LibraryStore.translationKey(document: document, target: target, source: source)
        if let cached = memoryTranslations[key] { translated = cached; return }
        do {
            if let cached = try store.translation(for: document, targetLanguage: target, sourceLanguage: source) {
                translated = cached
                memoryTranslations[key] = cached
                return
            }
        } catch { storageError = error.localizedDescription }
        if let source, Locale.Language(identifier: source).languageCode == Locale.Language(identifier: target).languageCode {
            translated = document.lines
            translationMessage = "The original is already in this language."
            return
        }
        #if targetEnvironment(simulator)
        translationMessage = "Apple’s on-device translation requires a physical iPhone. Run Lyrica on your iPhone to download languages and translate."
        #else
        isTranslating = true
        translationMessage = "Checking on-device languages…"
        let availability = LanguageAvailability()
        let status: LanguageAvailability.Status
        do {
            if let source {
                status = await availability.status(from: Locale.Language(identifier: source), to: Locale.Language(identifier: target))
            } else {
                status = try await availability.status(for: document.text, to: Locale.Language(identifier: target))
            }
        } catch {
            guard generation == token else { return }
            isTranslating = false
            translationMessage = "Couldn’t detect the original language. Set it in Reader options, then retry."
            return
        }
        guard generation == token, !Task.isCancelled else { return }
        switch status {
        case .unsupported:
            isTranslating = false
            translationMessage = "This language pair isn’t supported on this device. Choose another language, or set the original language manually."
        case .supported, .installed:
            translationMessage = status == .supported ? "A free language download may be needed. Confirm Apple’s download prompt to continue." : "Translating on your iPhone…"
            request = TranslationRequest(id: token, document: document, source: source, target: target)
        @unknown default:
            isTranslating = false
            translationMessage = "Translation is unavailable for this language pair."
        }
        #endif
    }

    func translate(using session: TranslationSession, request current: TranslationRequest, store: LibraryStore, settings: AppSettings) async {
        guard generation == current.id else { return }
        do {
            try await session.prepareTranslation()
            try Task.checkCancellation()
            guard generation == current.id else { return }
            translationMessage = "Translating on your iPhone…"
            let lines = current.document.lines
            var output = Array(repeating: "", count: lines.count)
            let indices = lines.indices.filter { !lines[$0].trimmingCharacters(in: .whitespaces).isEmpty }
            // Small batches retain per-line identity and keep long songs responsive.
            for start in stride(from: 0, to: indices.count, by: 40) {
                let batch = indices[start..<min(start + 40, indices.count)].map {
                    TranslationSession.Request(sourceText: lines[$0], clientIdentifier: String($0))
                }
                let responses = try await session.translations(from: batch)
                try Task.checkCancellation()
                guard generation == current.id else { return }
                for response in responses {
                    guard let identifier = response.clientIdentifier, let index = Int(identifier), output.indices.contains(index) else {
                        throw LyricaError.invalidResponse
                    }
                    output[index] = response.targetText
                }
            }
            guard indices.allSatisfy({ !output[$0].isEmpty }) else { throw LyricaError.invalidResponse }
            guard generation == current.id else { return }
            translated = output
            let key = LibraryStore.translationKey(document: current.document, target: current.target, source: current.source)
            memoryTranslations[key] = output
            isTranslating = false
            translationMessage = nil
            if settings.cacheLyrics {
                do { try store.cacheTranslation(output, for: current.document, targetLanguage: current.target, sourceLanguage: current.source) }
                catch { storageError = error.localizedDescription }
            }
        } catch {
            guard generation == current.id else { return }
            isTranslating = false
            translationMessage = Task.isCancelled ? "Translation paused. Tap Retry to continue." : "Translation couldn’t finish. \(error.localizedDescription) Choose another language or tap Retry."
        }
    }

    func toggleFavorite(store: LibraryStore) {
        do {
            try store.setFavorite(!isFavorite, for: song)
            isFavorite.toggle()
        } catch { storageError = error.localizedDescription }
    }

    func persistCurrent(store: LibraryStore) {
        do {
            try store.upsert(song: song, document: document)
            guard let document, translated.count == document.lines.count else { return }
            try store.cacheTranslation(translated, for: document, targetLanguage: targetLanguage, sourceLanguage: sourceLanguage)
        } catch { storageError = error.localizedDescription }
    }
}
