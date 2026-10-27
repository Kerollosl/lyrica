import SwiftUI
import SwiftData

struct LibraryView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \StoredSong.lastViewed, order: .reverse) private var songs: [StoredSong]
    @State private var query = ""
    @State private var favoritesOnly = false
    @State private var error: String?
    private var filtered: [StoredSong] {
        songs.filter { record in
            (!favoritesOnly || record.isFavorite) && (query.isEmpty || [record.song.title, record.song.artist, record.song.album].contains { $0.localizedStandardContains(query) })
        }
    }
    var body: some View {
        List {
            Section {
                Picker("Show songs", selection: $favoritesOnly) {
                    Text("Recently viewed").tag(false)
                    Text("Favorites").tag(true)
                }.pickerStyle(.segmented).listRowBackground(Color.clear)
            }
            if filtered.isEmpty {
                ContentUnavailableView(query.isEmpty ? (favoritesOnly ? "Keep the songs that stay with you" : "Your words, collected") : "No matching songs", systemImage: favoritesOnly ? "heart" : "books.vertical", description: Text(query.isEmpty ? "Songs you read appear here. Tap the heart in a song to save a favorite." : "Try another title, artist, or album."))
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(filtered) { record in
                        NavigationLink { ReaderView(song: record.song) } label: {
                            SongRow(song: record.song, offline: record.document != nil)
                        }
                        .swipeActions(edge: .trailing) {
                            Button("Remove", role: .destructive) { do { try LibraryStore(context: context).remove(record) } catch { self.error = error.localizedDescription } }
                        }
                    }
                } footer: { Text("The download symbol means original lyrics are saved on this iPhone. Previously translated languages are available offline too.") }
            }
        }
        .scrollContentBackground(.hidden).background(LyricaStyle.paper)
        .navigationTitle("Library")
        .searchable(text: $query, prompt: "Find a song you’ve read")
        .alert("Storage issue", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") { error = nil } } message: { Text(error ?? "") }
    }
}
