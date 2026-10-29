import SwiftUI
import LyricaCore

/// Shared semantic surfaces keep the reader and library consistent in both appearances.
enum LyricaStyle {
    static let accent = Color("AccentColor")
    static let paper = Color(uiColor: .systemBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let ink = Color.primary
    static let secondary = Color.secondary
    static let stroke = Color(uiColor: .separator)
    static let accentInk = Color("AccentInk")
}

struct ArtworkView: View {
    let url: URL?
    var size: CGFloat = 60

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                ZStack {
                    Color(uiColor: .secondarySystemFill)
                    Image(systemName: "music.note")
                        .font(.system(size: size * 0.28))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
    }
}

struct SongRow: View {
    let song: Song
    var offline = false
    @Environment(\.dynamicTypeSize) private var dynamicType

    var body: some View {
        HStack(spacing: 14) {
            ArtworkView(url: song.artworkURL, size: dynamicType.isAccessibilitySize ? 64 : 58)
            VStack(alignment: .leading, spacing: 5) {
                Text(song.title).font(.body).foregroundStyle(LyricaStyle.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(song.artist).font(.subheadline).foregroundStyle(LyricaStyle.secondary)
                Text(song.album).font(.caption).foregroundStyle(LyricaStyle.secondary).lineLimit(2)
                if offline && dynamicType.isAccessibilitySize { SavedBadge() }
            }
            Spacer(minLength: 2)
            if !dynamicType.isAccessibilitySize {
                if offline {
                    Image(systemName: "arrow.down.circle.fill")
                        .foregroundStyle(LyricaStyle.accent)
                        .accessibilityLabel("Lyrics saved offline")
                } else {
                    Text(Duration.seconds(song.duration).formatted(.time(pattern: .minuteSecond)))
                        .font(.caption.monospacedDigit()).foregroundStyle(LyricaStyle.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 60)
        .accessibilityElement(children: .combine)
    }
}

struct SavedBadge: View {
    var body: some View {
        Label("Saved offline", systemImage: "arrow.down.circle.fill")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .accessibilityLabel("Lyrics saved offline")
    }
}

struct SectionHeading: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.headline).foregroundStyle(LyricaStyle.ink)
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(LyricaStyle.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

struct NoticeView: View {
    let title: String
    let message: String
    var symbol = "info.circle"

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).font(.body).foregroundStyle(.secondary)
                .frame(width: 22).padding(.top, 1).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(LyricaStyle.ink)
                Text(message).font(.footnote).foregroundStyle(LyricaStyle.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SongLoadingRows: View {
    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<5) { index in
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 10).fill(LyricaStyle.stroke).frame(width: 58, height: 58)
                    VStack(alignment: .leading, spacing: 9) {
                        RoundedRectangle(cornerRadius: 4).fill(LyricaStyle.stroke).frame(width: index.isMultiple(of: 2) ? 150 : 120, height: 13)
                        RoundedRectangle(cornerRadius: 4).fill(LyricaStyle.stroke.opacity(0.7)).frame(width: 95, height: 10)
                    }
                    Spacer()
                }
                .padding(.vertical, 10)
                if index < 4 { Divider().padding(.leading, 86) }
            }
        }
        .accessibilityHidden(true)
    }
}
