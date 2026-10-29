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
    @ScaledMetric(relativeTo: .body) private var scaledTextSize: CGFloat = 18

    private var store: LibraryStore { LibraryStore(context: context) }

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Picker(selection: $settings.defaultLanguage) {
                    ForEach(languages.including(settings.defaultLanguage)) { Text($0.name).tag($0.id) }
                } label: {
                    Text("Translate into")
                }
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Lyrics text size")
                        Spacer()
                        Text("\(Int(settings.fontSize)) pt").monospacedDigit().foregroundStyle(.secondary)
                    }
                    Slider(value: $settings.fontSize, in: 14...30, step: 1)
                        .accessibilityLabel("Lyrics text size")
                        .accessibilityValue("\(Int(settings.fontSize)) points")
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Lyrics text preview")
                            .font(.system(size: scaledTextSize * settings.fontSize / 18))
                            .foregroundStyle(.primary)
                        Text("A preview of your reading size")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                }
                .padding(.vertical, 6)
            } header: {
                Text("Reading")
            } footer: {
                Text("Your language and text size apply whenever you open a song. Text also follows your iPhone’s accessibility settings.")
            }
            .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))

            Section("Appearance") {
                Picker(selection: $settings.appearance) {
                    ForEach(AppSettings.Appearance.allCases) { Text($0.title).tag($0) }
                } label: {
                    Text("Color theme")
                }
            }
            .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))

            Section {
                Toggle(isOn: Binding(get: { settings.cacheLyrics }, set: setOfflineCaching)) {
                    Text("Save permitted lyrics offline")
                }
                LabeledContent {
                    Text("\(songs.filter { $0.document != nil }.count)").monospacedDigit()
                } label: {
                    Text("Saved originals")
                }
                LabeledContent {
                    Text("\(translations.count)").monospacedDigit()
                } label: {
                    Text("Cached translations")
                }
                Button("Clear lyrics and translations", role: .destructive) { confirmation = .cache }
                    .frame(minHeight: 44)
                Button("Clear recent searches", role: .destructive) { confirmation = .searches }
                    .frame(minHeight: 44)
                Button("Delete all local data", role: .destructive) { confirmation = .all }
                    .frame(minHeight: 44)
            } header: {
                Text("Storage")
            } footer: {
                Text("Offline saving is optional. Turning it off removes saved lyrics and translations, while favorite bookmarks and viewing history stay. Apple’s language downloads are managed separately in system settings.")
            }
            .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))

            Section("About") {
                Label("No account or subscription", systemImage: "person.crop.circle")
                Label("On-device translation", systemImage: "iphone")
                Link(destination: URL(string: "https://www.apple.com/itunes/")!) {
                    externalLinkLabel("Song metadata · Apple iTunes")
                }
                Link(destination: URL(string: "https://lrclib.net")!) {
                    externalLinkLabel("Lyrics · LRCLIB")
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("Lyrics belong to their respective rights holders. Availability varies, and access through LRCLIB does not grant permission to store or redistribute lyrics. Only paste and save material you’re permitted to use. Machine translations may be imperfect.")
                    Text("Search terms go to Apple. Recording metadata goes to LRCLIB. Lyrics are translated by Apple’s on-device framework; language downloads need an internet connection. Lyrica has no analytics or backend.")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.vertical, 5)
            }
            .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))
        }
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Settings")
        .alert("Enable offline lyrics?", isPresented: $showsPermission) {
            Button("Enable") { settings.cacheLyrics = true }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Confirm that you’ll only cache lyrics and translations you’re permitted to keep. They stay on this iPhone and can be removed here anytime.")
        }
        .confirmationDialog(confirmation?.title ?? "Manage local data", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
            Button(confirmation?.button ?? "Remove", role: .destructive) { performAction() }
        } message: {
            Text(confirmation?.message ?? "")
        }
        .alert("Storage issue", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private func externalLinkLabel(_ title: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Image(systemName: "arrow.up.right").font(.caption.weight(.semibold))
        }
        .frame(minHeight: 44)
    }

    private func setOfflineCaching(_ enabled: Bool) {
        if enabled {
            showsPermission = true
        } else {
            do {
                try store.clearCachedContent()
                settings.cacheLyrics = false
            } catch { self.error = error.localizedDescription }
        }
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
        switch self {
        case .cache: "Clear downloaded content?"
        case .searches: "Clear recent searches?"
        case .all: "Delete all local data?"
        }
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
