import Foundation
import XCTest
@testable import LyricaCore

final class AppleMusicReferenceTests: XCTestCase {
    func testSongInAlbumUsesQueryIDNotAlbumID() throws {
        let reference = try AppleMusicReference(url: URL(string: "https://music.apple.com/es/album/example/123?i=456&l=en")!)
        XCTAssertEqual(reference.songID, 456)
        XCTAssertEqual(reference.country, "ES")
    }

    func testStandaloneSongLinks() throws {
        XCTAssertEqual(try AppleMusicReference(url: URL(string: "https://music.apple.com/us/song/example/123")!).songID, 123)
        XCTAssertEqual(try AppleMusicReference(url: URL(string: "https://music.apple.com/fr/song/123")!).country, "FR")
    }

    func testAlbumPlaylistAndSpoofedHostRejected() {
        for link in ["https://music.apple.com/us/album/example/123",
                     "https://music.apple.com/us/playlist/test/pl.123?i=456",
                     "https://music.apple.com.evil.example/us/song/test/123",
                     "https://example.com/us/song/test/123",
                     "file://music.apple.com/us/song/test/123",
                     "https://music.apple.com/us/song/test/no-id"] {
            XCTAssertThrowsError(try AppleMusicReference(url: URL(string: link)!)) { error in
                XCTAssertEqual(error as? LyricaError, .invalidAppleMusicURL)
            }
        }
    }
}
