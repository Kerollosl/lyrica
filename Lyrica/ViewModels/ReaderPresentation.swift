import Foundation

/// Row identity belongs to an original document, independently of translations.
struct ReaderLine: Identifiable {
    let id = UUID()
    let index: Int
    let text: String
}

struct ReaderPresentation {
    private(set) var lines: [ReaderLine] = []
    private(set) var selectedLineID: UUID?
    private var originalText: String?

    mutating func replaceOriginal(with text: String?) {
        guard text != originalText else { return }
        originalText = text
        selectedLineID = nil
        lines = text.map { value in
            value.components(separatedBy: "\n").enumerated().map {
                ReaderLine(index: $0.offset, text: $0.element)
            }
        } ?? []
    }

    mutating func toggleLine(_ id: UUID) {
        guard lines.contains(where: {
            $0.id == id && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) else { return }
        selectedLineID = selectedLineID == id ? nil : id
    }
}
