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

    private var recentCardWidth: CGFloat { dynamicType.isAccessibilitySize ? 220 : 136 }
    private var isQueryEmpty: Bool { model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 26) {
                if isQueryEmpty {
                    discovery
                } else if model.isLoading {
                    HStack(spacing: 10) {
                        ProgressView().tint(LyricaStyle.accent)
                        Text("Finding your song…").font(.subheadline).foregroundStyle(LyricaStyle.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    SongLoadingRows()
                } else if let error = model.error {
                    NoticeView(title: "Search couldn’t finish", message: error, symbol: "magnifyingglass")
                    Button("Try again") { Task { await model.search(immediately: true) } }
                        .buttonStyle(LyricaPrimaryButtonStyle())
                } else if model.hasSearched && model.results.isEmpty {
                    ContentUnavailableView.search(text: model.query)
                        .frame(maxWidth: .infinity).padding(.top, 30)
                } else if !model.results.isEmpty {
                    results
                }
            }
            .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(LyricaStyle.paper)
        .navigationTitle("Lyrica")
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Song, artist, album, or Apple Music link")
        .autocorrectionDisabled()
        .task(id: model.query) { await model.search() }
        .alert("Storage issue", isPresented: Binding(get: { storageError != nil }, set: { if !$0 { storageError = nil } })) {
            Button("OK") { storageError = nil }
        } message: { Text(storageError ?? "") }
    }

    private var discovery: some View {
        Group {
            VStack(alignment: .leading, spacing: 10) {
                Text("Understand every line.")
                    .font(.title.weight(.bold)).tracking(-0.5).foregroundStyle(LyricaStyle.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Find a song. Read the original and its translation, together.")
                    .font(.subheadline).foregroundStyle(LyricaStyle.secondary).lineSpacing(3)
            }
            .padding(.top, 2)

            if !viewed.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    SectionHeading(title: "Pick up where you left off")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 16) {
                            ForEach(Array(viewed.prefix(8))) { record in
                                NavigationLink { ReaderView(song: record.song) } label: {
                                    recentCard(record)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.bottom, 4)
                    }
                    .contentMargins(.trailing, 1)
                }
            }

            if !recent.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionHeading(title: "Recent searches")
                        Button("Clear") {
                            do { try LibraryStore(context: context).clearRecentSearches() }
                            catch { storageError = error.localizedDescription }
                        }
                        .font(.subheadline.weight(.medium)).frame(minWidth: 44, minHeight: 44)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(recent.prefix(5))) { item in
                            Button { model.query = item.query } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "clock").foregroundStyle(LyricaStyle.secondary)
                                    Text(item.query).foregroundStyle(LyricaStyle.ink).multilineTextAlignment(.leading)
                                    Spacer(minLength: 8)
                                    Image(systemName: "arrow.up.left").font(.caption.weight(.semibold)).foregroundStyle(LyricaStyle.secondary)
                                }
                                .font(.subheadline).padding(.horizontal, 16).frame(minHeight: 52)
                                .padding(.vertical, 4).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if item.id != recent.prefix(5).last?.id { Divider().padding(.leading, 48) }
                        }
                    }
                    .background(LyricaStyle.surface, in: RoundedRectangle(cornerRadius: 18))
                }
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "link").font(.title3).foregroundStyle(LyricaStyle.accent).frame(width: 28)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Have an Apple Music link?").font(.subheadline.weight(.semibold)).foregroundStyle(LyricaStyle.ink)
                        Text("Paste a song link into search to find the exact recording.")
                            .font(.footnote).foregroundStyle(LyricaStyle.secondary).lineSpacing(2)
                    }
                }
                Divider()
                Label("Free to use. No account needed.", systemImage: "lock.shield")
                    .font(.caption).foregroundStyle(LyricaStyle.secondary)
            }
            .padding(18)
            .background(LyricaStyle.surface, in: RoundedRectangle(cornerRadius: 20))
        }
    }

    private var results: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeading(title: "Choose your recording", subtitle: "\(model.results.count) \(model.results.count == 1 ? "result" : "results") · Check the album and duration.")
            LazyVStack(spacing: 0) {
                ForEach(model.results) { song in
                    NavigationLink {
                        ReaderView(song: song)
                            .task {
                                do { try LibraryStore(context: context).recordSearch(model.query) }
                                catch { storageError = error.localizedDescription }
                            }
                    } label: {
                        HStack(spacing: 8) {
                            SongRow(song: song)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(LyricaStyle.secondary)
                        }
                        .padding(.horizontal, 14).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if song.id != model.results.last?.id { Divider().padding(.leading, 86) }
                }
            }
            .background(LyricaStyle.surface, in: RoundedRectangle(cornerRadius: 20))
            Text("Live versions, remixes, and re-recordings may have different lyrics.")
                .font(.caption).foregroundStyle(LyricaStyle.secondary)
        }
    }

    private func recentCard(_ record: StoredSong) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ArtworkView(url: record.song.artworkURL, size: recentCardWidth)
            VStack(alignment: .leading, spacing: 4) {
                Text(record.song.title).font(.subheadline.weight(.semibold)).foregroundStyle(LyricaStyle.ink)
                    .lineLimit(dynamicType.isAccessibilitySize ? nil : 2).multilineTextAlignment(.leading)
                Text(record.song.artist).font(.caption).foregroundStyle(LyricaStyle.secondary).lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
                if record.document != nil { SavedBadge().padding(.top, 3) }
            }
        }
        .frame(width: recentCardWidth, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open lyrics")
    }
}
