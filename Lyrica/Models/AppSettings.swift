import Foundation
import Observation
import SwiftUI

/// Where the privacy policy and support pages live. Placeholders until the real pages are hosted:
/// replace both before submitting to the App Store (see docs/STORE-CHECKLIST.md).
enum AppLinks {
    static let privacyPolicy = URL(string: "https://example.com/TODO_PRIVACY_URL")!
    static let support = URL(string: "https://example.com/TODO_SUPPORT_URL")!
}

@MainActor
@Observable
final class AppSettings {
    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
        var colorScheme: ColorScheme? {
            switch self {
            case .system: nil
            case .light: .light
            case .dark: .dark
            }
        }
    }

    @ObservationIgnored private let defaults: UserDefaults

    var defaultLanguage: String {
        didSet { defaults.set(defaultLanguage, forKey: "defaultLanguage") }
    }
    var fontSize: Double {
        didSet { defaults.set(fontSize, forKey: "fontSize") }
    }
    var appearance: Appearance {
        didSet { defaults.set(appearance.rawValue, forKey: "appearance") }
    }
    /// Off until the user explicitly confirms they may store this material.
    var cacheLyrics: Bool {
        didSet { defaults.set(cacheLyrics, forKey: "cacheLyrics") }
    }
    /// Study mode: translations stay hidden until a line is tapped.
    var hideTranslations: Bool {
        didSet { defaults.set(hideTranslations, forKey: "hideTranslations") }
    }
    /// Remember recent searches and recently viewed songs. Favorites and songs saved offline are separate choices.
    var keepHistory: Bool {
        didSet { defaults.set(keepHistory, forKey: "keepHistory") }
    }
    /// Favoriting offers offline storage once; afterwards a favorite is simply a bookmark.
    var offeredOfflineStorage: Bool {
        didSet { defaults.set(offeredOfflineStorage, forKey: "offeredOfflineStorage") }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaultLanguage = defaults.string(forKey: "defaultLanguage") ?? "en"
        let storedSize = defaults.object(forKey: "fontSize") as? Double ?? 18
        fontSize = min(max(storedSize, 14), 30)
        appearance = Appearance(rawValue: defaults.string(forKey: "appearance") ?? "system") ?? .system
        cacheLyrics = defaults.bool(forKey: "cacheLyrics")
        hideTranslations = defaults.bool(forKey: "hideTranslations")
        offeredOfflineStorage = defaults.bool(forKey: "offeredOfflineStorage")
        keepHistory = defaults.object(forKey: "keepHistory") as? Bool ?? true
    }
}
