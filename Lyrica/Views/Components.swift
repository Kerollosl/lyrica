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
    var demo = false

    init(url: URL?, size: CGFloat = 60, demo: Bool = false) {
        self.url = url
        self.size = size
        self.demo = demo
    }

    init(song: Song, size: CGFloat = 60) {
        self.init(url: song.artworkURL, size: size, demo: DemoContent.isDemo(song))
    }

    var body: some View {
        Group {
            if demo {
                DemoArtwork()
            } else {
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
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
    }
}

/// The example's original artwork: a sun over a hill, matching the web companion.
private struct DemoArtwork: View {
    var body: some View {
        GeometryReader { geometry in
            let side = geometry.size.width
            ZStack {
                Color(red: 0.612, green: 0.667, blue: 0.549)
                Circle()
                    .fill(Color(red: 0.957, green: 0.843, blue: 0.643))
                    .frame(width: side * 0.4, height: side * 0.4)
                    .position(x: side * 0.66, y: side * 0.33)
                HillShape()
                    .fill(Color(red: 0.239, green: 0.353, blue: 0.282))
                    .frame(width: side * 1.4, height: side * 0.65)
                    .rotationEffect(.degrees(-18))
                    .position(x: side * 0.58, y: side * 0.815)
            }
            .frame(width: side, height: side)
            .clipped()
        }
    }
}

/// A dome: an elliptical top over a flat base.
private struct HillShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addEllipse(in: rect)
        path.addRect(CGRect(x: rect.minX, y: rect.midY, width: rect.width, height: rect.height / 2))
        return path
    }
}

struct SongRow: View {
    let song: Song
    var offline = false
    @Environment(\.dynamicTypeSize) private var dynamicType

    var body: some View {
        HStack(spacing: 14) {
            ArtworkView(song: song, size: dynamicType.isAccessibilitySize ? 64 : 58)
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
                } else if song.duration > 0 {
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
        Label("Offline", systemImage: "arrow.down.circle.fill")
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
