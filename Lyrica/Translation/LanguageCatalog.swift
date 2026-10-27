import Foundation
import Observation
@preconcurrency import Translation
import NaturalLanguage

struct ReaderLanguage: Identifiable, Hashable {
    let id: String
    var name: String { Locale.current.localizedString(forIdentifier: id) ?? id }
    var isRTL: Bool { Locale.Language(identifier: id).characterDirection == .rightToLeft }
}

@MainActor @Observable
final class LanguageCatalog {
    // These options remain visible so unsupported devices can explain the limitation.
    var languages = ["en", "es", "fr", "ar", "it", "pt", "de", "ja", "ko", "zh-Hans"].map { ReaderLanguage(id: $0) }
    func load() async {
        let supported = await LanguageAvailability().supportedLanguages
        guard !supported.isEmpty else { return }
        let identifiers = Set(supported.map { $0.minimalIdentifier })
        languages = identifiers.map { ReaderLanguage(id: $0) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    func including(_ code: String) -> [ReaderLanguage] {
        languages.contains(where: { $0.id == code }) ? languages : [ReaderLanguage(id: code)] + languages
    }
    static func detect(_ text: String) -> String? {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(String(text.prefix(12000)))
        guard let language = recognizer.dominantLanguage,
              (recognizer.languageHypotheses(withMaximum: 1)[language] ?? 0) >= 0.55 else { return nil }
        return language.rawValue
    }
}
