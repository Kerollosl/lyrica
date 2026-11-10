import SwiftUI
import SwiftData
@preconcurrency import Translation
import LyricaCore

struct ReaderView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings
    @Environment(LanguageCatalog.self) private var languages
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model: ReaderViewModel
    @State private var showsManual = false
    @State private var showsOptions = false
    @State private var manualAfterOptions = false
    @State private var showsPermission = false
    @State private var layout = ReaderLayout.automatic
    @State private var retry = 0
    @State private var revealed: Set<Int> = []
    @State private var copied = false
    @ScaledMetric(relativeTo: .body) private var scaledSize: CGFloat = 18
    @ScaledMetric(relativeTo: .body) private var verseGap: CGFloat = 22

    init(song: Song) { _model = State(initialValue: ReaderViewModel.make(for: song)) }

    private var store: LibraryStore { LibraryStore(context: context) }
    private var translationIdentity: String {
        [model.document?.text ?? "", model.sourceOverride, model.targetLanguage, String(retry)].joined(separator: "\u{0}")
    }

    var body: some View {
        GeometryReader { geometry in
            // Two columns need room: stack below 600pt (every iPhone in portrait, narrow iPad splits) like the web app does.
            let stacked = layout == .stacked || (layout == .automatic && (geometry.size.width < 600 || dynamicType.isAccessibilitySize))
            ScrollView {
                // At accessibility sizes the stacked pickers would cover too much of the screen.
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: dynamicType.isAccessibilitySize ? [] : [.sectionHeaders]) {
                    songHeader
                        .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 20)
                    Section {
                        readerContent(stacked: stacked)
                            .padding(.horizontal, 16).padding(.top, 12)
                    } header: {
                        languageBar
                    }
                }
            }
            .background(LyricaStyle.paper)
        }
        .navigationTitle("Lyrics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let url = model.song.appleMusicURL {
                    ShareLink(item: url, subject: Text(model.song.title), message: Text("\(model.song.title) · \(model.song.artist)")) {
                        Image(systemName: "square.and.arrow.up").frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Share song link")
                }
                Button {
                    model.toggleFavorite(store: store)
                    // Offer offline storage once. Afterwards a favorite is simply a bookmark.
                    if model.isFavorite && !settings.cacheLyrics && !settings.offeredOfflineStorage {
                        settings.offeredOfflineStorage = true
                        showsPermission = true
                    }
                } label: {
                    Image(systemName: model.isFavorite ? "heart.fill" : "heart")
                        .contentTransition(.symbolEffect(.replace))
                        .symbolEffect(.bounce, value: reduceMotion ? false : model.isFavorite)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .sensoryFeedback(.success, trigger: model.isFavorite) { _, isFavorite in isFavorite }
                .accessibilityLabel(model.isFavorite ? "Remove from favorites" : "Save to favorites")
                .accessibilityValue(model.isFavorite ? "Saved" : "Not saved")
                Button { showsOptions = true } label: {
                    Image(systemName: "slider.horizontal.3").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Reader options")
            }
        }
        .task { await model.load(store: store, settings: settings) }
        .task(id: translationIdentity) {
            revealed = []
            await model.prepareTranslation(store: store, settings: settings)
        }
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
        .sheet(isPresented: $showsOptions, onDismiss: {
            if manualAfterOptions { manualAfterOptions = false; showsManual = true }
        }) { options }
        .alert("Keep lyrics for offline reading?", isPresented: $showsPermission) {
            Button("Enable offline reading") { settings.cacheLyrics = true; model.persistCurrent(store: store) }
            Button("Keep bookmark only", role: .cancel) { }
        } message: { Text("Only save lyrics and translations you’re permitted to keep. This enables local caching for future songs too. Your favorite is already bookmarked, and you can change this later in Settings.") }
        .alert("Storage issue", isPresented: Binding(get: { model.storageError != nil }, set: { if !$0 { model.storageError = nil } })) {
            Button("OK") { model.storageError = nil }
        } message: { Text(model.storageError ?? "") }
    }

    @ViewBuilder
    private func readerContent(stacked: Bool) -> some View {
        if model.isLoading {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 10) {
                    ProgressView().tint(LyricaStyle.accent)
                    Text("Finding lyrics…").font(.subheadline).foregroundStyle(LyricaStyle.secondary)
                }
                ForEach(0..<4) { index in
                    HStack(spacing: 24) {
                        RoundedRectangle(cornerRadius: 4).fill(LyricaStyle.stroke).frame(height: 13)
                        RoundedRectangle(cornerRadius: 4).fill(LyricaStyle.stroke.opacity(0.7)).frame(height: 13)
                    }
                    .padding(.trailing, index.isMultiple(of: 2) ? 10 : 38)
                    .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 8).padding(.vertical, 18)
        } else if let error = model.lyricsError {
            VStack(alignment: .leading, spacing: 16) {
                NoticeView(title: "Lyrics aren’t available yet", message: error, symbol: "text.magnifyingglass")
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 16) { lyricsRecoveryActions }
                    VStack(alignment: .leading, spacing: 12) { lyricsRecoveryActions }
                }
            }
            .padding(.bottom, 24)
        }
        if let document = model.document {
            if let message = model.translationMessage {
                NoticeView(title: model.isTranslating ? "Translating on your iPhone" : "Translation", message: message, symbol: "character.bubble")
                    .padding(.bottom, 12)
                if !model.isTranslating && model.translated.isEmpty {
                    Button("Retry translation") { retry += 1 }
                        .font(.subheadline.weight(.semibold)).frame(minHeight: 44).padding(.bottom, 12)
                }
            }
            if model.isTranslating {
                ProgressView().tint(LyricaStyle.accent).frame(maxWidth: .infinity).padding(.bottom, 16)
            }
            ForEach(model.presentation.lines) { line in
                lyricRow(line: line, stacked: stacked)
            }
            VStack(alignment: .leading, spacing: 12) {
                Divider().padding(.bottom, 8)
                Text(model.isDemo ? DemoContent.attribution : document.attribution)
                if document.source == .lrclib && !model.isDemo {
                    Link("Lyrics from LRCLIB", destination: URL(string: "https://lrclib.net")!)
                        .frame(minHeight: 44, alignment: .leading)
                }
                if let url = model.song.appleMusicURL {
                    Link(destination: url) {
                        Label("View in Apple Music", systemImage: "arrow.up.right")
                    }
                    .frame(minHeight: 44, alignment: .leading)
                }
                Text("Machine translations may miss poetry, slang, or context.")
            }
            .font(.caption).foregroundStyle(LyricaStyle.secondary)
            .padding(.horizontal, 10).padding(.top, 32).padding(.bottom, 32)
        }
    }

    @ViewBuilder
    private var lyricsRecoveryActions: some View {
        Button("Paste lyrics") { showsManual = true }.buttonStyle(ProminentActionStyle())
        Button("Try again") { Task { await model.load(store: store, settings: settings) } }
            .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
    }

    private var songHeader: some View {
        HStack(alignment: .center, spacing: 18) {
            ArtworkView(song: model.song, size: 76)
            VStack(alignment: .leading, spacing: 6) {
                Text(model.song.title).font(.title2.weight(.bold)).foregroundStyle(LyricaStyle.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(model.song.artist).font(.subheadline).foregroundStyle(LyricaStyle.secondary)
                Text(model.song.album).font(.caption).foregroundStyle(LyricaStyle.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func lyricRow(line: ReaderLine, stacked: Bool) -> some View {
        let index = line.index
        let original = line.text
        let selected = model.presentation.selectedLineID == line.id
        let translation = model.translated.indices.contains(index) ? model.translated[index] : ""
        let hasTranslation = !translation.isEmpty
        let concealed = settings.hideTranslations && hasTranslation && !selected && !revealed.contains(index)
        return Group {
            if original.isEmpty {
                // Verse breaks scale with the reading size so stanzas stay distinct at large text.
                Color.clear.frame(height: verseGap * settings.fontSize / 18).accessibilityHidden(true)
            } else {
                Group {
                    if stacked {
                        VStack(alignment: .leading, spacing: 6) {
                            lyricText(original, language: model.sourceLanguage, translated: false)
                            if hasTranslation { translationText(translation, concealed: concealed) }
                        }
                    } else {
                        HStack(alignment: .top, spacing: 24) {
                            lyricText(original, language: model.sourceLanguage, translated: false)
                            // Keep the original in its column while translations arrive.
                            if hasTranslation { translationText(translation, concealed: concealed) }
                            else { Color.clear.frame(maxWidth: .infinity, maxHeight: 1) }
                        }
                        .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.vertical, 10).padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(selected ? LyricaStyle.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: LyricaStyle.rowRadius, style: .continuous))
                .sensoryFeedback(.selection, trigger: selected) { _, isSelected in isSelected }
                .contentShape(Rectangle())
                // A tap highlights the pair; a long press still selects text for Copy, Look Up and Translate.
                .onTapGesture { toggle(line) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spokenLabel(original: original, translation: translation, concealed: concealed))
                .accessibilityHint(settings.hideTranslations ? "Reveals and highlights the translation" : "Highlights the original and translation")
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityAction { toggle(line) }
            }
        }
    }

    /// VoiceOver reads each part in its own language rather than the device voice.
    private func spokenLabel(original: String, translation: String, concealed: Bool) -> Text {
        var label = AttributedString(original)
        if let source = model.sourceLanguage { label.languageIdentifier = source }
        var rest: AttributedString
        if translation.isEmpty {
            rest = AttributedString(". Translation pending")
        } else if concealed {
            rest = AttributedString(". Translation hidden")
        } else {
            rest = AttributedString(". " + translation)
            rest.languageIdentifier = model.targetLanguage
        }
        return Text(label + rest)
    }

    private func toggle(_ line: ReaderLine) {
        withAnimation(LyricaStyle.motion(LyricaStyle.spring, reduce: reduceMotion)) {
            if settings.hideTranslations {
                if revealed.contains(line.index) { revealed.remove(line.index) } else { revealed.insert(line.index) }
            }
            model.toggleLine(line.id)
        }
    }

    private func translationText(_ text: String, concealed: Bool) -> some View {
        lyricText(text, language: model.targetLanguage, translated: true)
            .redacted(reason: concealed ? .placeholder : [])
            .accessibilityHidden(concealed)
    }

    private func lyricText(_ text: String, language: String?, translated: Bool) -> some View {
        let rtl = language.map { ReaderLanguage(id: $0).isRTL } ?? false
        return Text(text)
            .font(.system(size: scaledSize * settings.fontSize / 18, weight: .regular))
            .foregroundStyle(translated ? LyricaStyle.secondary : LyricaStyle.ink)
            .lineSpacing(5)
            .textSelection(.enabled)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .environment(\.layoutDirection, rtl ? .rightToLeft : .leftToRight)
            .environment(\.locale, Locale(identifier: language ?? Locale.current.identifier))
    }

    private var languageBar: some View {
        Group {
            if dynamicType.isAccessibilitySize {
                VStack(spacing: 8) { sourceLanguageMenu; targetLanguageMenu }
            } else {
                HStack(alignment: .top, spacing: 24) {
                    sourceLanguageMenu
                    targetLanguageMenu
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(.horizontal, 26).padding(.vertical, 10)
        .background(LyricaStyle.paper)
        .overlay(alignment: .bottom) { Rectangle().fill(LyricaStyle.stroke).frame(height: 1) }
    }

    private var sourceLanguageMenu: some View {
        Menu {
            Picker("Original language", selection: $model.sourceOverride) {
                Text("Detect automatically").tag("auto")
                ForEach(languages.including(model.sourceLanguage ?? "es")) { Text($0.name).tag($0.id) }
            }
        } label: {
            languageControl(title: model.sourceOverride == "auto" ? "Original · Auto" : "Original",
                            language: model.sourceLanguage.map { ReaderLanguage(id: $0).name } ?? "Detect language")
        }
        .accessibilityLabel("Original language, \(model.sourceLanguage.map { ReaderLanguage(id: $0).name } ?? "detect automatically")")
    }

    private var targetLanguageMenu: some View {
        Menu {
            Picker("Translation language", selection: $model.targetLanguage) {
                ForEach(languages.including(model.targetLanguage)) { Text($0.name).tag($0.id) }
            }
        } label: {
            languageControl(title: "Translation", language: ReaderLanguage(id: model.targetLanguage).name)
        }
        .accessibilityLabel("Translation language, \(ReaderLanguage(id: model.targetLanguage).name)")
    }

    private func languageControl(title: String, language: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.footnote).foregroundStyle(LyricaStyle.secondary)
            HStack(spacing: 6) {
                Text(language).font(.subheadline).foregroundStyle(LyricaStyle.accent)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(LyricaStyle.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    /// Original lines paired with their translations, separated by verse.
    private var copyText: String {
        guard let document = model.document else { return "" }
        let lines = document.lines.enumerated().map { index, line -> String in
            guard !line.isEmpty else { return "" }
            let translation = model.translated.indices.contains(index) ? model.translated[index] : ""
            return translation.isEmpty || translation == line ? line : line + "\n" + translation
        }
        return lines.joined(separator: "\n") + "\n\n" + model.song.title + " · " + model.song.artist
    }

    private var options: some View {
        @Bindable var settings = settings
        return NavigationStack {
            Form {
                Section("Reading") {
                    Picker("Layout", selection: $layout) { ForEach(ReaderLayout.allCases) { Text($0.title).tag($0) } }
                    LabeledContent("Text size", value: "\(Int(settings.fontSize)) pt")
                    Slider(value: $settings.fontSize, in: 14...30, step: 1)
                        .accessibilityLabel("Lyrics text size")
                        .accessibilityValue("\(Int(settings.fontSize)) points")
                }
                Section {
                    Toggle("Hide translations", isOn: $settings.hideTranslations)
                } header: {
                    Text("Study")
                } footer: {
                    Text("Read the original first, then tap a line to reveal its translation.")
                }
                Section("Original language") {
                    Picker("Language", selection: $model.sourceOverride) {
                        Text("Detect automatically").tag("auto")
                        ForEach(languages.including(model.sourceLanguage ?? "es")) { Text($0.name).tag($0.id) }
                    }
                    Text("If detection gets a short or multilingual song wrong, choose its main language.").font(.footnote).foregroundStyle(LyricaStyle.secondary)
                }
                Section {
                    if model.document != nil {
                        Button(copied ? "Copied" : "Copy lyrics and translation", systemImage: copied ? "checkmark" : "doc.on.doc") {
                            UIPasteboard.general.string = copyText
                            copied = true
                        }
                    }
                    Button("Paste or replace lyrics", systemImage: "text.badge.plus") { manualAfterOptions = true; showsOptions = false }
                } footer: {
                    Text("Long-press any line to copy a phrase or look up a word.")
                }
            }
            .onAppear { copied = false }
            .navigationTitle("Reader options").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showsOptions = false } } }
        }.presentationDetents([.medium, .large])
    }
}

enum ReaderLayout: String, Identifiable, CaseIterable {
    case automatic, columns, stacked
    var id: String { rawValue }
    var title: String {
        switch self { case .automatic: "Automatic"; case .columns: "Side by side"; case .stacked: "Stacked" }
    }
}

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
    @State private var confirmsDiscard = false
    @FocusState private var isEditing: Bool
    private let initialText: String
    let save: (String) -> Void

    // Text is an intentional one-time editing seed for this sheet.
    init(initialText: String, save: @escaping (String) -> Void) {
        self.initialText = initialText
        _text = State(initialValue: initialText)
        self.save = save
    }

    private var hasChanges: Bool { text != initialText }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(.body)
                        .frame(minHeight: 240)
                        .focused($isEditing)
                        .accessibilityLabel("Original lyrics")
                } header: {
                    Text("Original lyrics")
                } footer: {
                    Text("Paste lyrics you’re permitted to use. Keep a line break between each lyric and a blank line between verses. Only metadata is saved unless you enable permitted offline caching.")
                }
            }
            .navigationTitle("Paste lyrics").navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(hasChanges)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges { confirmsDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use lyrics") { save(text); dismiss() }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isEditing = false }
                }
            }
            .confirmationDialog("Discard your changes?", isPresented: $confirmsDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) { }
            }
        }
    }
}
