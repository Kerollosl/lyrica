import XCTest
@testable import Lyrica

final class ReaderPresentationTests: XCTestCase {
    func testHighlightUsesStableRowIdentityAcrossUnchangedOriginal() {
        var presentation = ReaderPresentation()
        presentation.replaceOriginal(with: "First line\n\nSecond line")
        let secondLine = presentation.lines[2]
        presentation.toggleLine(secondLine.id)
        let rowIDs = presentation.lines.map(\.id)

        presentation.replaceOriginal(with: "First line\n\nSecond line")

        XCTAssertEqual(presentation.lines.map(\.id), rowIDs)
        XCTAssertEqual(presentation.selectedLineID, secondLine.id)
    }

    func testReplacingOriginalClearsHighlightAndRebuildsRows() {
        var presentation = ReaderPresentation()
        presentation.replaceOriginal(with: "Repeated\n\nRepeated")
        let oldLine = presentation.lines[2]
        presentation.toggleLine(oldLine.id)

        presentation.replaceOriginal(with: "A different line\n\nA different ending")

        XCTAssertNil(presentation.selectedLineID)
        XCTAssertEqual(presentation.lines.map(\.text), ["A different line", "", "A different ending"])
        XCTAssertFalse(presentation.lines.contains(where: { $0.id == oldLine.id }))
    }

    func testDuplicateTextRowsCanBeHighlightedIndependently() {
        var presentation = ReaderPresentation()
        presentation.replaceOriginal(with: "Same line\nSame line")
        let first = presentation.lines[0]
        let second = presentation.lines[1]

        XCTAssertNotEqual(first.id, second.id)
        presentation.toggleLine(second.id)

        XCTAssertEqual(presentation.selectedLineID, second.id)
    }

    func testBlankAndUnknownRowsCannotBeHighlighted() {
        var presentation = ReaderPresentation()
        presentation.replaceOriginal(with: "Line\n \n")
        let blankLine = presentation.lines[1]
        let unknown = UUID()

        presentation.toggleLine(blankLine.id)
        presentation.toggleLine(unknown)

        XCTAssertNil(presentation.selectedLineID)
    }
}
