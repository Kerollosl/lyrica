import SwiftUI
import SwiftData
import LyricaCore

struct SearchView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \RecentSearch.searchedAt, order: .reverse) private var recent: [RecentSearch]
    @State private var model = SearchViewModel()
    @State private var storageError: String?

    var body: some View {
        List {
            if model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 16) {
                        Image(systemName: "character.book.closed").font(.largeTitle).foregroundStyle(LyricaStyle.accent)
                        Text("Every lyric.\nA little closer.").font(.system(.largeTitle, design: .serif).weight(.medium))
                        Text("Find a song. Discover its meaning in your language.").foregroundStyle(.secondary)
                    }.padding(.vertical, 20)
                }.listRowBackground(Color.clear)
                if !recent.isEmpty {
                    Section {
                        ForEach(Array(recent.prefix(10))) { item in
                            Button { model.query = item.query } label: {
                                Label(item.query, systemImage: "clock").foregroundStyle(.primary)
                            }
                        }
                    } header: {
                        HStack {
                            Text("Recent searches")
                            Spacer()
                            Button("Clear") { do { try LibraryStore(context: context).clearRecentSearches() } catch { storageError = error.localizedDescription } }
                        }
                    }
                }
                Section {
                    Label("Paste an Apple Music song link in search", systemImage: "link").font(.footnote).foregroundStyle(.secondary)
                    Label("Free. Private. No account needed.", systemImage: "lock.shield").font(.footnote).foregroundStyle(.secondary)
                }.listRowBackground(Color.clear)
            } else if model.isLoading {
                HStack { ProgressView(); Text("Finding your song…").foregroundStyle(.secondary) }.listRowBackground(Color.clear)
            } else if let error = model.error {
                NoticeView(title: "Search couldn’t finish", message: error, symbol: "wifi.exclamationmark").listRowBackground(Color.clear)
                Button("Try again") { Task { await model.search(immediately: true) } }
            } else if model.hasSearched && model.results.isEmpty {
                ContentUnavailableView.search(text: model.query).listRowBackground(Color.clear)
            } else if !model.results.isEmpty {
                Section {
                    ForEach(model.results) { song in
                        NavigationLink {
                            ReaderView(song: song)
                                .task { do { try LibraryStore(context: context).recordSearch(model.query) } catch { storageError = error.localizedDescription } }
                        } label: { SongRow(song: song) }
                    }
                } header: { Text("Choose your recording") } footer: { Text("Check the album and duration for live versions, remixes, and re-recordings.") }
            }
        }
        .scrollContentBackground(.hidden)
        .background(LyricaStyle.paper)
        .navigationTitle("Lyrica")
        .searchable(text: $model.query, prompt: "Song, artist, album, or Apple Music link")
        .autocorrectionDisabled()
        .task(id: model.query) { await model.search() }
        .alert("Storage issue", isPresented: Binding(get: { storageError != nil }, set: { if !$0 { storageError = nil } })) { Button("OK") { storageError = nil } } message: { Text(storageError ?? "") }
    }
}
