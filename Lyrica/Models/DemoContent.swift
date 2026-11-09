import Foundation
import LyricaCore

/// Lyrica's original bilingual example. The lyrics and translations are authored
/// for the app, so the reader can be tried immediately — including on a simulator,
/// where Apple Translation is unavailable — without retrieving commercial lyrics.
enum DemoContent {
    /// iTunes track IDs are positive, so a negative ID can never collide with a real recording.
    static let songID = -1
    static let sourceLanguage = "es"

    static let song = Song(
        id: songID,
        title: "Donde empieza el día",
        artist: "Lyrica Studio",
        album: "An original bilingual example",
        duration: 0
    )

    static let document = LyricDocument(
        text: """
        Abro la ventana al día
        y la luz me viene a encontrar.

        Cada calle guarda una historia,
        cada voz, un nuevo lugar.

        Si las palabras son un puente,
        hoy lo vamos a cruzar.
        """,
        source: .manual
    )

    static let attribution = "Original example lyrics and translations by Lyrica Studio. Fictional material, not a commercial recording."

    /// Included translations, keyed by target language.
    static let translations: [String: [String]] = [
        "en": [
            "I open the window to the day",
            "and the light comes to find me.",
            "",
            "Every street holds a story,",
            "every voice, a new place.",
            "",
            "If words are a bridge,",
            "today we will cross it.",
        ],
        "fr": [
            "J’ouvre la fenêtre sur le jour",
            "et la lumière vient me trouver.",
            "",
            "Chaque rue garde une histoire,",
            "chaque voix, un lieu nouveau.",
            "",
            "Si les mots sont un pont,",
            "aujourd’hui nous le traverserons.",
        ],
        "ar": [
            "أفتح النافذة للنهار",
            "فيأتي الضوء ليجدني.",
            "",
            "كل شارع يحمل حكاية،",
            "وكل صوت مكانًا جديدًا.",
            "",
            "إن كانت الكلمات جسرًا،",
            "فسنعبره اليوم.",
        ],
        "it": [
            "Apro la finestra al giorno",
            "e la luce viene a cercarmi.",
            "",
            "Ogni strada custodisce una storia,",
            "ogni voce, un luogo nuovo.",
            "",
            "Se le parole sono un ponte,",
            "oggi lo attraverseremo.",
        ],
        "pt": [
            "Abro a janela para o dia",
            "e a luz vem me encontrar.",
            "",
            "Cada rua guarda uma história,",
            "cada voz, um novo lugar.",
            "",
            "Se as palavras são uma ponte,",
            "hoje vamos atravessá-la.",
        ],
    ]

    static func isDemo(_ song: Song) -> Bool { song.id == songID }
}

/// Supplies the authored example without a network request.
struct DemoLyricsProvider: LyricsProviding {
    func lyrics(for song: Song) async throws -> LyricDocument { DemoContent.document }
}

/// Debug-only launch hooks used by simulator screenshot capture.
enum LaunchOptions {
    static var opensExample: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-LyricaOpenExample")
        #else
        false
        #endif
    }
}
