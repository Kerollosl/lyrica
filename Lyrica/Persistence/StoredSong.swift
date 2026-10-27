import Foundation
import SwiftData
import LyricaCore

/// Metadata is kept independently from lyric content so cache removal preserves the library.
@Model
final class StoredSong {
    @Attribute(.unique) var id: Int
    var title: String
    var artist: String
    var album: String
    var duration: TimeInterval
    var artworkURLString: String?
    var appleMusicURLString: String?
    var originalText: String?
    var originalSource: String?
    var isFavorite: Bool
    var lastViewed: Date

    init(song: Song, document: LyricDocument? = nil, isFavorite: Bool = false, lastViewed: Date = .now) {
        id = song.id
        title = song.title
        artist = song.artist
        album = song.album
        duration = song.duration
        artworkURLString = song.artworkURL?.absoluteString
        appleMusicURLString = song.appleMusicURL?.absoluteString
        originalText = document?.text
        originalSource = document.map { $0.source == .manual ? "manual" : "lrclib" }
        self.isFavorite = isFavorite
        self.lastViewed = lastViewed
    }

    var song: Song {
        Song(id: id, title: title, artist: artist, album: album, duration: duration,
             artworkURL: artworkURLString.flatMap(URL.init(string:)),
             appleMusicURL: appleMusicURLString.flatMap(URL.init(string:)))
    }

    var document: LyricDocument? {
        guard let originalText else { return nil }
        return LyricDocument(text: originalText, source: originalSource == "manual" ? .manual : .lrclib)
    }

    func updateMetadata(from song: Song) {
        title = song.title
        artist = song.artist
        album = song.album
        duration = song.duration
        artworkURLString = song.artworkURL?.absoluteString
        appleMusicURLString = song.appleMusicURL?.absoluteString
    }

    func cache(_ document: LyricDocument) {
        originalText = document.text
        originalSource = document.source == .manual ? "manual" : "lrclib"
    }
}
