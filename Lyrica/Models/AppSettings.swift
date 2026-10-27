import Foundation
import Observation
import SwiftUI

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

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaultLanguage = defaults.string(forKey: "defaultLanguage") ?? "en"
        let storedSize = defaults.object(forKey: "fontSize") as? Double ?? 18
        fontSize = min(max(storedSize, 14), 30)
        appearance = Appearance(rawValue: defaults.string(forKey: "appearance") ?? "system") ?? .system
        cacheLyrics = defaults.bool(forKey: "cacheLyrics")
    }
}
