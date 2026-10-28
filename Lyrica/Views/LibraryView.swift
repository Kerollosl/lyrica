import SwiftUI
import SwiftData

struct LibraryView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Query(sort: \StoredSong.lastViewed, order: .reverse) private var songs: [StoredSong]
    @State private var query = ""
    @State private var favoritesOnly = true
    @State private var error: String?

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
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: dynamicType.isAccessibilitySize ? 260 : 148), spacing: 18)], alignment: .leading, spacing: 24) {
                        ForEach(filtered) { record in
                            NavigationLink { ReaderView(song: record.song) } label: {
                                favoriteCard(record)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Remove from library", systemImage: "trash", role: .destructive) { remove(record) }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                } header: {
                    sectionHeader("Your favorites", count: filtered.count)
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
                        .swipeActions(edge: .trailing) {
                            Button("Remove", role: .destructive) { remove(record) }
                        }
                    }
                    .listRowBackground(LyricaStyle.surface)
                } header: {
                    sectionHeader("Recently viewed", count: filtered.count)
                } footer: {
                    offlineExplanation
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LyricaStyle.paper)
        .navigationTitle("Library")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Title, artist, or album")
        .alert("Storage issue", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(query.isEmpty ? (favoritesOnly ? "Keep your favorites close" : "Your listening, understood") : "No matching songs", systemImage: query.isEmpty ? (favoritesOnly ? "heart" : "clock") : "magnifyingglass")
        } description: {
            Text(query.isEmpty ? (favoritesOnly ? "Tap the heart on any song to collect it here." : "Songs you open appear here, ready to revisit.") : "Try a different title, artist, or album.")
        }
        .padding(.vertical, 28)
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title).textCase(nil).font(.subheadline.weight(.semibold)).foregroundStyle(LyricaStyle.ink)
            Spacer()
            Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(LyricaStyle.secondary)
        }
        .padding(.bottom, 6)
    }

    private func favoriteCard(_ record: StoredSong) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geometry in
                ArtworkView(url: record.song.artworkURL, size: geometry.size.width)
            }
            .aspectRatio(1, contentMode: .fit)
            .overlay(alignment: .bottomLeading) {
                if record.document != nil {
                    SavedBadge().padding(10)
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(record.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LyricaStyle.ink)
                    .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
                Text(record.artist)
                    .font(.caption)
                    .foregroundStyle(LyricaStyle.secondary)
                    .lineLimit(dynamicType.isAccessibilitySize ? nil : 1)
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
            .foregroundStyle(LyricaStyle.secondary)
            .textCase(nil)
            .padding(.top, 12)
    }

    private func remove(_ record: StoredSong) {
        do { try LibraryStore(context: context).remove(record) }
        catch { self.error = error.localizedDescription }
    }
}
