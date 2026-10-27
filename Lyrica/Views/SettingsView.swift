import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LanguageCatalog.self) private var languages
    @Environment(\.modelContext) private var context
    @Query private var songs: [StoredSong]
    @Query private var translations: [CachedTranslation]
    @State private var confirmation: StorageAction?
    @State private var error: String?
    @State private var showsPermission = false
    private var store: LibraryStore { LibraryStore(context: context) }

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section("Make it yours") {
                Picker("Translate into", selection: $settings.defaultLanguage) {
                    ForEach(languages.including(settings.defaultLanguage)) { Text($0.name).tag($0.id) }
                }
                Picker("Appearance", selection: $settings.appearance) {
                    ForEach(AppSettings.Appearance.allCases) { Text($0.title).tag($0) }
                }
                LabeledContent("Lyrics text size", value: "\(Int(settings.fontSize)) pt")
                Slider(value: $settings.fontSize, in: 14...30, step: 1).accessibilityLabel("Lyrics text size")
                Text("Words worth understanding.").font(.custom("Georgia", size: settings.fontSize, relativeTo: .body)).padding(.vertical, 8)
            }
            Section {
                Toggle("Save permitted lyrics offline", isOn: Binding(get: { settings.cacheLyrics }, set: { enabled in
                    if enabled { showsPermission = true }
                    else {
                        do { try store.clearCachedContent(); settings.cacheLyrics = false }
                        catch { self.error = error.localizedDescription }
                    }
                }))
                LabeledContent("Saved originals", value: "\(songs.filter { $0.document != nil }.count)")
                LabeledContent("Cached translations", value: "\(translations.count)")
                Button("Clear lyrics and translations", role: .destructive) { confirmation = .cache }
                Button("Clear recent searches", role: .destructive) { confirmation = .searches }
                Button("Delete all local data", role: .destructive) { confirmation = .all }
            } header: { Text("On this iPhone") } footer: {
                Text("Offline caching is optional. Turning it off removes saved lyrics and translations. Favorites and viewing history remain as bookmarks. Apple’s language models are managed separately in system settings.")
            }
            Section("About Lyrica") {
                Label("No account. No subscription.", systemImage: "heart")
                Label("Translation happens on your device", systemImage: "iphone")
                Link("Song metadata · Apple iTunes", destination: URL(string: "https://www.apple.com/itunes/")!)
                Link("Lyrics · LRCLIB", destination: URL(string: "https://lrclib.net")!)
                Text("Lyrics belong to their respective rights holders. Availability varies, and access through LRCLIB does not grant permission to store or redistribute lyrics. Only paste and save material you’re permitted to use. Machine translations may be imperfect.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Search terms go to Apple. Recording metadata goes to LRCLIB. Lyrics are translated by Apple’s on-device framework; language downloads need an internet connection. Lyrica has no analytics or backend.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .alert("Enable offline lyrics?", isPresented: $showsPermission) {
            Button("Enable") { settings.cacheLyrics = true }
            Button("Cancel", role: .cancel) { }
        } message: { Text("Confirm that you’ll only cache lyrics and translations you’re permitted to keep. They stay on this iPhone and can be removed here anytime.") }
        .confirmationDialog(confirmation?.title ?? "Manage local data", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
            Button(confirmation?.button ?? "Remove", role: .destructive) { performAction() }
        } message: { Text(confirmation?.message ?? "") }
        .alert("Storage issue", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") { error = nil } } message: { Text(error ?? "") }
    }

    private func performAction() {
        do {
            switch confirmation {
            case .cache: try store.clearCachedContent()
            case .searches: try store.clearRecentSearches()
            case .all: try store.deleteAll(); settings.cacheLyrics = false
            case nil: break
            }
        } catch { self.error = error.localizedDescription }
        confirmation = nil
    }
}

private enum StorageAction {
    case cache, searches, all
    var title: String {
        switch self { case .cache: "Clear downloaded content?"; case .searches: "Clear recent searches?"; case .all: "Delete all local data?" }
    }
    var button: String { self == .all ? "Delete all data" : "Clear" }
    var message: String {
        switch self {
        case .cache: "Removes saved originals and translations. Your favorite bookmarks and viewing history remain."
        case .searches: "Removes recent search terms. Your library remains."
        case .all: "Removes favorites, viewing history, search history, lyrics, and translations. This cannot be undone."
        }
    }
}
