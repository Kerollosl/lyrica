import SwiftUI
import SwiftData
import LyricaCore

struct SearchView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(AppSettings.self) private var settings
    @Query(sort: \RecentSearch.searchedAt, order: .reverse) private var recent: [RecentSearch]
    @Query(sort: \StoredSong.lastViewed, order: .reverse) private var viewed: [StoredSong]
    @State private var model = SearchViewModel()
    @State private var storageError: String?
    @State private var opensExample = LaunchOptions.opensExample
    @Namespace private var transitions
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var trimmedQuery: String { model.query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isQueryEmpty: Bool { trimmedQuery.isEmpty }
    private var artworkSize: CGFloat { dynamicType.isAccessibilitySize ? 160 : 104 }

    var body: some View {
        List {
            if isQueryEmpty {
                discovery
            } else if model.isLoading {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Searching…").foregroundStyle(LyricaStyle.secondary)
                    }
                    SongLoadingRows()
                }
            } else if model.searchedTerm != trimmedQuery {
                // Typing doesn't search; Return does. That keeps every keystroke from becoming a network request.
                Section {
                    Label("Press Search on the keyboard to look up “\(trimmedQuery)”.", systemImage: "return")
                        .foregroundStyle(LyricaStyle.secondary)
                        .frame(minHeight: 44, alignment: .leading)
                }
            } else if let error = model.error {
                Section {
                    NoticeView(title: "Couldn’t search", message: error, symbol: "exclamationmark.circle")
                    Button("Try again") { Task { await model.search(immediately: true) } }
                }
            } else if model.hasSearched && model.results.isEmpty {
                ContentUnavailableView.search(text: model.searchedTerm)
                    .listRowBackground(Color.clear)
            } else if !model.results.isEmpty {
                Section {
                    ForEach(model.results) { song in
                        NavigationLink {
                            ReaderView(song: song)
                                .task {
                                    guard settings.keepHistory else { return }
                                    do { try LibraryStore(context: context).recordSearch(model.searchedTerm) }
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
        .navigationTitle("Search")
        .navigationDestination(isPresented: $opensExample) { ReaderView(song: DemoContent.song) }
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Song, artist, album, or Apple Music link")
        .autocorrectionDisabled()
        .onSubmit(of: .search) { Task { await model.search(immediately: true) } }
        .onChange(of: model.query) { _, query in
            // Clearing the field resets the screen; anything else waits for Return.
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Task { await model.search(immediately: true) } }
        }
        .alert("Storage issue", isPresented: Binding(get: { storageError != nil }, set: { if !$0 { storageError = nil } })) {
            Button("OK") { storageError = nil }
        } message: { Text(storageError ?? "") }
    }

    @ViewBuilder
    private var discovery: some View {
        Section {
            Text("Find lyrics by song, artist, or album. You can also paste an Apple Music song link.")
                .font(.body).foregroundStyle(LyricaStyle.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 8)
        }
        .listRowBackground(Color.clear)

        Section {
            NavigationLink {
                ReaderView(song: DemoContent.song)
                    .navigationTransition(.zoom(sourceID: "example", in: transitions))
            } label: {
                HStack(spacing: 16) {
                    ArtworkView(song: DemoContent.song, size: dynamicType.isAccessibilitySize ? 72 : 76)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Try an example").font(.title3.weight(.bold)).foregroundStyle(.primary)
                        Text("Read a Spanish verse with included translations.")
                            .font(.subheadline).foregroundStyle(LyricaStyle.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 10)
                .matchedTransitionSource(id: "example", in: transitions)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Opens an original bilingual example")
            }
        }
        .listRowBackground(RoundedRectangle(cornerRadius: LyricaStyle.cardRadius, style: .continuous).fill(LyricaStyle.surface))
        .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 20))

        if !viewed.isEmpty {
            Section("Recently viewed") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 20) {
                        ForEach(Array(viewed.prefix(8))) { record in
                            NavigationLink { ReaderView(song: record.song) } label: {
                                recentCard(record)
                            }
                            .buttonStyle(PressScaleStyle())
                        }
                    }
                    .padding(.vertical, 8)
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
            ArtworkView(song: record.song, size: artworkSize)
            Text(record.song.title)
                .font(.system(.subheadline)).foregroundStyle(.primary)
                .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
                .multilineTextAlignment(.leading)
            Text(record.song.artist)
                .font(.caption).foregroundStyle(LyricaStyle.secondary)
                .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
            if record.document != nil { SavedBadge() }
        }
        .frame(width: artworkSize, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open lyrics")
    }
}
