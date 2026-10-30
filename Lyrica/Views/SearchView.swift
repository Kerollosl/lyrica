import SwiftUI
import SwiftData
import LyricaCore

struct SearchView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Query(sort: \RecentSearch.searchedAt, order: .reverse) private var recent: [RecentSearch]
    @Query(sort: \StoredSong.lastViewed, order: .reverse) private var viewed: [StoredSong]
    @State private var model = SearchViewModel()
    @State private var storageError: String?

    private var isQueryEmpty: Bool { model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var artworkSize: CGFloat { dynamicType.isAccessibilitySize ? 160 : 104 }

    var body: some View {
        List {
            if isQueryEmpty {
                discovery
            } else if model.isLoading {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Searching…").foregroundStyle(.secondary)
                    }
                    SongLoadingRows()
                }
            } else if let error = model.error {
                Section {
                    NoticeView(title: "Couldn’t search", message: error, symbol: "exclamationmark.circle")
                    Button("Try again") { Task { await model.search(immediately: true) } }
                }
            } else if model.hasSearched && model.results.isEmpty {
                ContentUnavailableView.search(text: model.query)
                    .listRowBackground(Color.clear)
            } else if !model.results.isEmpty {
                Section {
                    ForEach(model.results) { song in
                        NavigationLink {
                            ReaderView(song: song)
                                .task {
                                    do { try LibraryStore(context: context).recordSearch(model.query) }
                                    catch { storageError = error.localizedDescription }
                                }
                        } label: {
                            SongRow(song: song)
                        }
                    }
                } header: {
                    Text("\(model.results.count) \(model.results.count == 1 ? "result" : "results")")
                } footer: {
                    Text("Check the album and duration to choose the right recording.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Lyrica")
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Song, artist, album, or Apple Music link")
        .autocorrectionDisabled()
        .task(id: model.query) { await model.search() }
        .alert("Storage issue", isPresented: Binding(get: { storageError != nil }, set: { if !$0 { storageError = nil } })) {
            Button("OK") { storageError = nil }
        } message: { Text(storageError ?? "") }
    }

    @ViewBuilder
    private var discovery: some View {
        Section {
            Text("Find lyrics by song, artist, or album. You can also paste an Apple Music song link.")
                .font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 4)
        }
        .listRowBackground(Color.clear)

        if !viewed.isEmpty {
            Section("Recently viewed") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(Array(viewed.prefix(8))) { record in
                            NavigationLink { ReaderView(song: record.song) } label: {
                                recentCard(record)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .listRowBackground(Color.clear)
        }

        if !recent.isEmpty {
            Section {
                ForEach(Array(recent.prefix(5))) { item in
                    Button { model.query = item.query } label: {
                        Label(item.query, systemImage: "clock").foregroundStyle(.primary)
                            .frame(minHeight: 44, alignment: .leading)
                    }
                }
            } header: {
                HStack {
                    Text("Recent searches")
                    Spacer()
                    Button("Clear") {
                        do { try LibraryStore(context: context).clearRecentSearches() }
                        catch { storageError = error.localizedDescription }
                    }
                    .font(.subheadline).frame(minWidth: 44, minHeight: 44)
                }
            }
        }
    }

    private func recentCard(_ record: StoredSong) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ArtworkView(url: record.song.artworkURL, size: artworkSize)
            Text(record.song.title)
                .font(.system(.subheadline)).foregroundStyle(.primary)
                .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
                .multilineTextAlignment(.leading)
            Text(record.song.artist)
                .font(.caption).foregroundStyle(.secondary)
                .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
            if record.document != nil { SavedBadge() }
        }
        .frame(width: artworkSize, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open lyrics")
    }
}
