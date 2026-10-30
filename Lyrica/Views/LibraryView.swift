import SwiftUI
import SwiftData

struct LibraryView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Query(sort: \StoredSong.lastViewed, order: .reverse) private var songs: [StoredSong]
    @State private var query = ""
    @State private var favoritesOnly = true
    @State private var error: String?
    @State private var pendingRemoval: StoredSong?

    private var filtered: [StoredSong] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return songs.filter { record in
            (!favoritesOnly || record.isFavorite) && (term.isEmpty || [record.title, record.artist, record.album].contains { $0.localizedStandardContains(term) })
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Show songs", selection: $favoritesOnly) {
                    Text("Favorites").tag(true)
                    Text("Recently viewed").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.vertical, 4)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))

            if filtered.isEmpty {
                emptyState
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if favoritesOnly {
                Section {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: dynamicType.isAccessibilitySize ? 260 : 148), spacing: 16)], alignment: .leading, spacing: 16) {
                        ForEach(filtered) { record in
                            NavigationLink { ReaderView(song: record.song) } label: {
                                favoriteCard(record)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Remove from library", systemImage: "trash", role: .destructive) { pendingRemoval = record }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                } header: {
                    sectionHeader("Favorites", count: filtered.count)
                } footer: {
                    offlineExplanation
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(filtered) { record in
                        NavigationLink { ReaderView(song: record.song) } label: {
                            SongRow(song: record.song, offline: record.document != nil)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Remove", role: .destructive) { pendingRemoval = record }
                        }
                    }
                    .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))
                } header: {
                    sectionHeader("Recently viewed", count: filtered.count)
                } footer: {
                    offlineExplanation
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Library")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Title, artist, or album")
        .confirmationDialog("Remove this song?", isPresented: Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }), titleVisibility: .visible) {
            Button("Remove song", role: .destructive) {
                if let record = pendingRemoval { remove(record) }
                pendingRemoval = nil
            }
            Button("Cancel", role: .cancel) { pendingRemoval = nil }
        } message: {
            Text("Removes this song, its saved lyrics, and its translations from this iPhone.")
        }
        .alert("Storage issue", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(query.isEmpty ? (favoritesOnly ? "No favorites" : "No recently viewed songs") : "No matching songs", systemImage: query.isEmpty ? (favoritesOnly ? "heart" : "clock") : "magnifyingglass")
        } description: {
            Text(query.isEmpty ? (favoritesOnly ? "Tap the heart in a song to add it to Favorites." : "Songs you open will appear here.") : "Try a different title, artist, or album.")
        }
        .padding(.vertical, 28)
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
    }

    private func favoriteCard(_ record: StoredSong) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geometry in
                ArtworkView(url: record.song.artworkURL, size: geometry.size.width)
            }
            .aspectRatio(1, contentMode: .fit)
            VStack(alignment: .leading, spacing: 3) {
                Text(record.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
                Text(record.artist)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(dynamicType.isAccessibilitySize ? nil : 1)
                if record.document != nil { SavedBadge() }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open bilingual lyrics")
    }

    private var offlineExplanation: some View {
        Text("Saved badges mark lyrics available on this iPhone. Languages you’ve already translated are available offline too.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .textCase(nil)
            .padding(.top, 4)
    }

    private func remove(_ record: StoredSong) {
        do { try LibraryStore(context: context).remove(record) }
        catch { self.error = error.localizedDescription }
    }
}
