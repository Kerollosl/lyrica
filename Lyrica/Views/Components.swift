import SwiftUI
import LyricaCore

/// Shared semantic surfaces keep the reader and library consistent in both appearances.
enum LyricaStyle {
    static let accent = Color("AccentColor")
    static let paper = Color(uiColor: .systemBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let ink = Color.primary
    /// The asset keeps secondary text at 5.9:1 (light) and 9:1 (dark); the system secondary label is dimmer.
    static let secondary = Color("SecondaryInk")
    static let stroke = Color(uiColor: .separator)
    static let accentInk = Color("AccentInk")

    /// Shared motion. A little bounce reads as physical without delaying reading.
    /// Callers pass Reduce Motion through `motion` so springs become instant changes.
    static let spring = Animation.spring(duration: 0.42, bounce: 0.3)
    static let snappy = Animation.spring(duration: 0.3, bounce: 0.18)
    static func motion(_ animation: Animation, reduce: Bool) -> Animation? { reduce ? nil : animation }

    /// Soft, continuous corners scale with the thing they round.
    static func radius(for size: CGFloat) -> CGFloat { min(max(size * 0.2, 10), 22) }
    static let cardRadius: CGFloat = 20
    static let rowRadius: CGFloat = 14
}

/// Filled primary action. The label uses the AccentInk asset (white on the light blue fill, black on the lighter dark-mode
/// blue) so contrast holds in both appearances; the system's prominent style would put white on the light dark-mode blue.
struct ProminentActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(LyricaStyle.accentInk)
            .padding(.horizontal, 20)
            .frame(minHeight: 50)
            .background(LyricaStyle.accent, in: RoundedRectangle(cornerRadius: LyricaStyle.rowRadius, style: .continuous))
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(reduceMotion ? nil : LyricaStyle.snappy, value: configuration.isPressed)
    }
}

/// Presses sink slightly and spring back. With Reduce Motion the scale is skipped.
struct PressScaleStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(reduceMotion ? nil : LyricaStyle.snappy, value: configuration.isPressed)
    }
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
                                .foregroundStyle(LyricaStyle.secondary)
                        }
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: LyricaStyle.radius(for: size), style: .continuous))
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
        HStack(spacing: 16) {
            ArtworkView(song: song, size: dynamicType.isAccessibilitySize ? 68 : 62)
            VStack(alignment: .leading, spacing: 5) {
                Text(song.title).font(.body.weight(.semibold)).foregroundStyle(LyricaStyle.ink)
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
        .padding(.vertical, 8)
        .frame(minHeight: 64)
        .accessibilityElement(children: .combine)
    }
}

struct SavedBadge: View {
    var body: some View {
        Label("Offline", systemImage: "arrow.down.circle.fill")
            .font(.caption2)
            .foregroundStyle(LyricaStyle.secondary)
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
            Image(systemName: symbol).font(.body).foregroundStyle(LyricaStyle.secondary)
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
