import SwiftUI
import SwiftData

@main
struct LyricaApp: App {
    @State private var settings = AppSettings()
    @State private var languages = LanguageCatalog()
    private let storage: Result<ModelContainer, Error> = Result {
        try ModelContainer(for: StoredSong.self, CachedTranslation.self, RecentSearch.self)
    }

    var body: some Scene {
        WindowGroup {
            switch storage {
            case .success(let container):
                RootView()
                    .modelContainer(container)
                    .environment(settings)
                    .environment(languages)
                    .preferredColorScheme(settings.appearance.colorScheme)
                    .tint(LyricaStyle.accent)
                    .task { await languages.load() }
            case .failure:
                ContentUnavailableView("Your library couldn’t open", systemImage: "externaldrive.badge.exclamationmark", description: Text("Restart Lyrica to try again. Your saved data has not been deleted."))
            }
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            Tab("Search", systemImage: "magnifyingglass") { NavigationStack { SearchView() } }
            Tab("Library", systemImage: "books.vertical") { NavigationStack { LibraryView() } }
            Tab("Settings", systemImage: "slider.horizontal.3") { NavigationStack { SettingsView() } }
        }
    }
}
