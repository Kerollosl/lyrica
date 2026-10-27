import SwiftUI
import SwiftData
import Translation
import LyricaCore

struct ReaderView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings
    @Environment(LanguageCatalog.self) private var languages
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model: ReaderViewModel
    @State private var selectedLine: Int?
    @State private var showsManual = false
    @State private var showsOptions = false
    @State private var showsPermission = false
    @State private var layout = ReaderLayout.automatic
    @State private var retry = 0
    @ScaledMetric(relativeTo: .body) private var scaledSize: CGFloat = 18

    init(song: Song) { _model = State(initialValue: ReaderViewModel(song: song)) }

    private var store: LibraryStore { LibraryStore(context: context) }
    private var translationIdentity: String {
        [model.document?.text ?? "", model.sourceOverride, model.targetLanguage, String(retry)].joined(separator: "\u{0}")
    }

    var body: some View {
        GeometryReader { geometry in
            let stacked = layout == .stacked || (layout == .automatic && (geometry.size.width < 375 || dynamicType.isAccessibilitySize))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    songHeader.padding(.bottom, 24)
                    if model.isLoading {
                        HStack(spacing: 12) { ProgressView(); Text("Finding the words…").foregroundStyle(.secondary) }.padding(.vertical, 40)
                    } else if let error = model.lyricsError {
                        NoticeView(title: "The words are still yours to find", message: error, symbol: "text.magnifyingglass")
                        HStack {
                            Button("Try again") { Task { await model.load(store: store, settings: settings) } }
                            Spacer()
                            Button("Paste lyrics") { showsManual = true }.buttonStyle(.borderedProminent)
                        }.padding(.top, 16)
                    }
                    if let document = model.document {
                        if let message = model.translationMessage {
                            NoticeView(title: model.isTranslating ? "On-device translation" : "Translation", message: message, symbol: "character.bubble")
                                .padding(.bottom, 12)
                            if !model.isTranslating && model.translated.isEmpty {
                                Button("Retry translation") { retry += 1 }.padding(.bottom, 16)
                            }
                        }
                        if model.isTranslating { ProgressView().frame(maxWidth: .infinity).padding(.bottom, 16) }
                        columnHeader(stacked: stacked).padding(.bottom, 16)
                        ForEach(Array(document.lines.enumerated()), id: \.offset) { index, line in
                            lyricRow(index: index, original: line, stacked: stacked)
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            Text(document.attribution)
                            if document.source == .lrclib {
                                Link("About LRCLIB", destination: URL(string: "https://lrclib.net")!)
                            }
                            Text("Machine translations may miss poetry, slang, or context.")
                        }
                        .font(.caption).foregroundStyle(.secondary).padding(.top, 32).padding(.bottom, 24)
                    }
                }
                .padding(.horizontal, 22).padding(.top, 12)
            }
            .background(LyricaStyle.paper)
        }
        .navigationTitle("Lyrics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    model.toggleFavorite(store: store)
                    if model.isFavorite && !settings.cacheLyrics { showsPermission = true }
                } label: { Image(systemName: model.isFavorite ? "heart.fill" : "heart") }
                .accessibilityLabel(model.isFavorite ? "Remove from favorites" : "Save to favorites")
                Button { showsOptions = true } label: { Image(systemName: "textformat.size") }.accessibilityLabel("Reader options")
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { languageBar }
        .task { await model.load(store: store, settings: settings) }
        .task(id: translationIdentity) { await model.prepareTranslation(store: store, settings: settings) }
        .background {
            if let request = model.request {
                TranslationWorker(request: request) { session in
                    await model.translate(using: session, request: request, store: store, settings: settings)
                }.id(request.id)
            }
        }
        .sheet(isPresented: $showsManual) {
            ManualLyricsView(initialText: model.document?.text ?? "") { text in
                model.useManual(text, store: store, settings: settings)
            }
        }
        .sheet(isPresented: $showsOptions) { options }
        .alert("Keep lyrics for offline reading?", isPresented: $showsPermission) {
            Button("Enable offline reading") { settings.cacheLyrics = true; model.persistCurrent(store: store) }
            Button("Save bookmark only", role: .cancel) { }
        } message: { Text("Only save lyrics and translations you’re permitted to keep. This enables local caching for future songs too. Your favorite is already bookmarked.") }
        .alert("Storage issue", isPresented: Binding(get: { model.storageError != nil }, set: { if !$0 { model.storageError = nil } })) {
            Button("OK") { model.storageError = nil }
        } message: { Text(model.storageError ?? "") }
    }

    private var songHeader: some View {
        HStack(alignment: .center, spacing: 18) {
            ArtworkView(url: model.song.artworkURL, size: 86)
            VStack(alignment: .leading, spacing: 6) {
                Text(model.song.title).font(.system(.title2, design: .serif).weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                Text(model.song.artist).font(.subheadline).foregroundStyle(.secondary)
                Text(model.song.album).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }.accessibilityElement(children: .combine)
    }

    private func columnHeader(stacked: Bool) -> some View {
        HStack {
            Text(model.sourceLanguage.map { ReaderLanguage(id: $0).name } ?? "Original").frame(maxWidth: .infinity, alignment: .leading)
            if !stacked { Text(ReaderLanguage(id: model.targetLanguage).name).frame(maxWidth: .infinity, alignment: .leading) }
        }
        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        .textCase(.uppercase).tracking(1.1)
        .environment(\.layoutDirection, .leftToRight)
    }

    private func lyricRow(index: Int, original: String, stacked: Bool) -> some View {
        let translation = model.translated.indices.contains(index) ? model.translated[index] : nil
        return Group {
            if original.isEmpty { Color.clear.frame(height: 24).accessibilityHidden(true) }
            else {
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { selectedLine = selectedLine == index ? nil : index }
                } label: {
                    Group {
                        if stacked {
                            VStack(alignment: .leading, spacing: 7) {
                                lyricText(original, language: model.sourceLanguage, translated: false)
                                lyricText(translation ?? "—", language: model.targetLanguage, translated: true)
                            }
                        } else {
                            HStack(alignment: .top, spacing: 24) {
                                lyricText(original, language: model.sourceLanguage, translated: false)
                                lyricText(translation ?? "—", language: model.targetLanguage, translated: true)
                            }
                            .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    .padding(.vertical, 10).padding(.horizontal, 10)
                    .background(selectedLine == index ? LyricaStyle.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 10))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(original + ". " + (translation ?? "Translation pending"))
                .accessibilityHint("Highlights the original and translation")
                .accessibilityAddTraits(selectedLine == index ? .isSelected : [])
            }
        }
    }

    private func lyricText(_ text: String, language: String?, translated: Bool) -> some View {
        let rtl = language.map { ReaderLanguage(id: $0).isRTL } ?? false
        return Text(text)
            .font(.system(size: scaledSize * settings.fontSize / 18, weight: .regular, design: .serif))
            .foregroundStyle(translated ? .secondary : .primary)
            .lineSpacing(5)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .environment(\.layoutDirection, rtl ? .rightToLeft : .leftToRight)
            .accessibilitySpeechLanguage(language ?? Locale.current.identifier)
    }

    private var languageBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "character.bubble").foregroundStyle(LyricaStyle.accent)
            Menu {
                Picker("Translation language", selection: $model.targetLanguage) {
                    ForEach(languages.including(model.targetLanguage)) { Text($0.name).tag($0.id) }
                }
            } label: {
                HStack { Text(ReaderLanguage(id: model.targetLanguage).name).fontWeight(.semibold); Image(systemName: "chevron.up.chevron.down").font(.caption) }
            }.accessibilityLabel("Translation language, \(ReaderLanguage(id: model.targetLanguage).name)")
            Spacer()
            Text("ON DEVICE").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24).padding(.vertical, 16)
        .background(.regularMaterial)
    }

    private var options: some View {
        @Bindable var settings = settings
        return NavigationStack {
            Form {
                Section("Reading") {
                    Picker("Layout", selection: $layout) { ForEach(ReaderLayout.allCases) { Text($0.rawValue.capitalized).tag($0) } }
                    LabeledContent("Text size", value: "\(Int(settings.fontSize)) pt")
                    Slider(value: $settings.fontSize, in: 14...30, step: 1).accessibilityLabel("Lyrics text size")
                }
                Section("Original language") {
                    Picker("Language", selection: $model.sourceOverride) {
                        Text("Detect automatically").tag("auto")
                        ForEach(languages.including(model.sourceLanguage ?? "es")) { Text($0.name).tag($0.id) }
                    }
                    Text("If detection gets a short or multilingual song wrong, choose its main language.").font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Button("Paste or replace lyrics") { showsOptions = false; showsManual = true }
                }
            }
            .navigationTitle("Reader options").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showsOptions = false } } }
        }.presentationDetents([.medium, .large])
    }
}

enum ReaderLayout: String, Identifiable, CaseIterable { case automatic, columns, stacked; var id: String { rawValue } }

private struct TranslationWorker: View {
    let request: TranslationRequest
    let action: (TranslationSession) async -> Void
    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .translationTask(source: request.source.map { Locale.Language(identifier: $0) }, target: Locale.Language(identifier: request.target)) { session in
                await action(session)
            }
    }
}

struct ManualLyricsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    let save: (String) -> Void
    init(initialText: String, save: @escaping (String) -> Void) { _text = State(initialValue: initialText); self.save = save }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                NoticeView(title: "Bring your own words", message: "Paste lyrics you’re permitted to use. Keep a line break between each lyric and a blank line between verses.")
                TextEditor(text: $text).font(.body).padding(8).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("Original lyrics")
                Text("Only metadata is saved unless you enable permitted offline caching.").font(.footnote).foregroundStyle(.secondary)
            }.padding()
            .navigationTitle("Paste lyrics").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Use lyrics") { save(text); dismiss() }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}
