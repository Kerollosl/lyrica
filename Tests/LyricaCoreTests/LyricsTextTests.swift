import XCTest
@testable import LyricaCore

final class LyricsTextTests: XCTestCase {
    func testLRCRemovesTimingAndMetadataButPreservesStanzas() {
        let text = "[ar:Example]\r\n[ti:Song]\r\n[00:01.50][00:21.500]Hola\r\n[00:03.00]Mundo\r\n[00:04.00]\r\n[00:05.00][Chorus]\r\n[00:06.00]Otra vez"
        let document = LyricDocument(text: text, source: .lrclib)
        XCTAssertEqual(document.lines, ["Hola", "Mundo", "", "[Chorus]", "Otra vez"])
    }

    func testPlainLyricsAndArabicRemainIntact() {
        let text = "  مرحباً بك\n\nCorazón, où es-tu?\n  "
        XCTAssertEqual(LyricsText.clean(text), "مرحباً بك\n\nCorazón, où es-tu?")
    }

    func testEmptyDocumentHasNoPhantomRow() {
        XCTAssertTrue(LyricDocument(text: " \n ", source: .manual).lines.isEmpty)
    }

    func testVersionQualifiersRemainSignificant() {
        XCTAssertEqual(LyricsText.normalized("CORAZÓN!"), LyricsText.normalized("Corazon"))
        XCTAssertNotEqual(LyricsText.normalized("Corazon (Live)"), LyricsText.normalized("Corazon"))
    }
}
