import SwiftUI
import LyricaCore

// Warm paper and ink, with semantic text colors for both appearances.
enum LyricaStyle {
    static let accent = Color("AccentColor")
    static let paper = Color("Paper")
}

struct ArtworkView: View {
    let url: URL?
    var size: CGFloat = 60
    var body: some View {
        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: {
            ZStack {
                LyricaStyle.accent.opacity(0.1)
                Image(systemName: "music.note").font(.system(size: size * 0.3)).foregroundStyle(LyricaStyle.accent)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.16))
        .accessibilityHidden(true)
    }
}

struct SongRow: View {
    let song: Song
    var offline = false
    var body: some View {
        HStack(spacing: 14) {
            ArtworkView(url: song.artworkURL)
            VStack(alignment: .leading, spacing: 4) {
                Text(song.title).font(.headline).foregroundStyle(.primary)
                Text(song.artist).font(.subheadline).foregroundStyle(.secondary)
                Text(song.album).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            if offline { Image(systemName: "arrow.down.circle.fill").foregroundStyle(LyricaStyle.accent).accessibilityLabel("Available offline") }
            else { Text(Duration.seconds(song.duration).formatted(.time(pattern: .minuteSecond))).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
        }
        .padding(.vertical, 5)
    }
}

struct NoticeView: View {
    let title: String
    let message: String
    var symbol = "info.circle"
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol).foregroundStyle(LyricaStyle.accent)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(message).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LyricaStyle.accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
    }
}
