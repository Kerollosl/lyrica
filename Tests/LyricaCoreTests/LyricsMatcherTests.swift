import Foundation
import XCTest
@testable import LyricaCore

final class LyricsMatcherTests: XCTestCase {
    private let song = Song(id: 1, title: "Corazón", artist: "Example", album: "Original", duration: 200)

    private func record(id: Int = 1, title: String = "Corazón", artist: String = "Example",
                        album: String = "Original", duration: Double = 200, instrumental: Bool = false,
                        plain: String? = "Hola\nMundo", synced: String? = nil) -> LRCLIBRecord {
        LRCLIBRecord(id: id, trackName: title, artistName: artist, albumName: album,
                     duration: duration, instrumental: instrumental, plainLyrics: plain, syncedLyrics: synced)
    }

    func testPrefersOriginalAlbumAndNearestDuration() throws {
        let remaster = record(id: 2, album: "Remastered", duration: 203, plain: "Different")
        let original = record(id: 3)
        XCTAssertEqual(try LyricsMatcher.best([remaster, original], for: song).id, 3)
    }

    func testRejectsWrongRecordingAndArtist() {
        XCTAssertNil(LyricsMatcher.score(record(title: "Corazón (Live)"), for: song))
        XCTAssertNil(LyricsMatcher.score(record(artist: "Someone Else"), for: song))
        XCTAssertNil(LyricsMatcher.score(record(duration: 240), for: song))
    }

    func testConflictingEqualMatchesAreAmbiguous() {
        XCTAssertThrowsError(try LyricsMatcher.best([record(), record(id: 2, plain: "Other words")], for: song)) {
            XCTAssertEqual($0 as? LyricaError, .ambiguousLyrics)
        }
    }

    func testConflictingThirdMatchIsNotHiddenByIdenticalReissue() {
        XCTAssertThrowsError(try LyricsMatcher.best([record(), record(id: 2), record(id: 3, plain: "Different words")], for: song)) {
            XCTAssertEqual($0 as? LyricaError, .ambiguousLyrics)
        }
    }

    func testIdenticalReissuesAreSafe() throws {
        XCTAssertEqual(try LyricsMatcher.best([record(), record(id: 2)], for: song).id, 1)
    }

    func testPlainLyricsPreferredAndSyncedFallbackPreservesStanzas() throws {
        XCTAssertEqual(try record(plain: "Plain", synced: "[00:01.00]Synced").document().text, "Plain")
        XCTAssertEqual(try record(plain: "", synced: "[00:01.00]Hola\n[00:02.00]\n[00:03.00]Mundo").document().lines,
                       ["Hola", "", "Mundo"])
    }

    func testInstrumentalNeverBecomesLyrics() {
        XCTAssertThrowsError(try record(instrumental: true).document()) {
            XCTAssertEqual($0 as? LyricaError, .instrumental)
        }
    }

    func testMissingDurationNeedsAlbumEvidence() {
        XCTAssertNil(LyricsMatcher.score(record(album: "Other", duration: 0), for: song))
        XCTAssertNotNil(LyricsMatcher.score(record(duration: 0), for: song))
    }
}
