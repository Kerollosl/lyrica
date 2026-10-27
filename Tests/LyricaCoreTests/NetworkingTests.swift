import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LyricaCore

private actor StubTransport: HTTPTransport {
    struct Stub: Sendable {
        let status: Int
        let body: String
    }
    private var stubs: [Stub]
    private(set) var requests: [URLRequest] = []

    init(_ stubs: [Stub]) { self.stubs = stubs }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !stubs.isEmpty else { throw URLError(.badServerResponse) }
        let stub = stubs.removeFirst()
        return (Data(stub.body.utf8), HTTPURLResponse(url: request.url!, statusCode: stub.status,
                                                   httpVersion: "HTTP/1.1", headerFields: nil)!)
    }
}

@MainActor
final class NetworkingTests: XCTestCase {
    private let trackJSON = #"{"results":[{"kind":"song","trackId":456,"trackName":"Corazón","artistName":"Example","collectionName":"Original","trackTimeMillis":200000,"artworkUrl100":"https://example.com/100x100bb.jpg"}]}"#
    private let song = Song(id: 456, title: "Corazón", artist: "Example", album: "Original", duration: 200)
    private let recordJSON = #"{"id":1,"trackName":"Corazón","artistName":"Example","albumName":"Original","duration":200,"instrumental":false,"plainLyrics":"Hola\n\nMundo","syncedLyrics":null}"#

    func testSearchEncodesQueryAndMapsMetadata() async throws {
        let transport = StubTransport([.init(status: 200, body: trackJSON)])
        let results = try await ITunesClient(transport: transport, paced: false).search("Corazón & Example")
        XCTAssertEqual(results.first?.duration, 200)
        XCTAssertEqual(results.first?.artworkURL?.absoluteString, "https://example.com/600x600bb.jpg")
        let requests = await transport.requests
        let components = URLComponents(url: try XCTUnwrap(requests.first?.url), resolvingAgainstBaseURL: false)
        XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "term" })?.value, "Corazón & Example")
    }

    func testAppleMusicLookupUsesSongIDAndStorefront() async throws {
        let transport = StubTransport([.init(status: 200, body: trackJSON)])
        let result = try await ITunesClient(transport: transport, paced: false)
            .song(fromAppleMusicURL: URL(string: "https://music.apple.com/es/album/example/123?i=456")!)
        XCTAssertEqual(result.id, 456)
        let requests = await transport.requests
        let items = URLComponents(url: requests[0].url!, resolvingAgainstBaseURL: false)?.queryItems
        XCTAssertEqual(items?.first(where: { $0.name == "id" })?.value, "456")
        XCTAssertEqual(items?.first(where: { $0.name == "country" })?.value, "ES")
    }

    func testExactLyrics404FallsBackToConservativeSearch() async throws {
        let transport = StubTransport([.init(status: 404, body: "{}"), .init(status: 200, body: "[\(recordJSON)]")])
        let result = try await LRCLIBClient(transport: transport, paced: false).lyrics(for: song)
        XCTAssertEqual(result.lines, ["Hola", "", "Mundo"])
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[1].url?.path, "/api/search")
    }

    func testRateLimitDoesNotRetryOrFallThroughToSearch() async {
        let transport = StubTransport([.init(status: 429, body: "{}")])
        do {
            _ = try await LRCLIBClient(transport: transport, paced: false).lyrics(for: song)
            XCTFail("Expected rate limit")
        } catch { XCTAssertEqual(error as? LyricaError, .rateLimited) }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 1)
    }

    func testMalformedResponseIsActionable() async {
        let transport = StubTransport([.init(status: 200, body: "not JSON")])
        do {
            _ = try await ITunesClient(transport: transport, paced: false).search("test")
            XCTFail("Expected invalid response")
        } catch { XCTAssertEqual(error as? LyricaError, .invalidResponse) }
    }


    func testServerRetryIsBounded() async {
        let transport = StubTransport([.init(status: 503, body: "{}"), .init(status: 503, body: "{}")])
        do {
            _ = try await ITunesClient(transport: transport, paced: false).search("test")
            XCTFail("Expected server error")
        } catch { XCTAssertEqual(error as? LyricaError, .server(503)) }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
    }

    func testCancellationBeforeRequestDoesNoNetworkWork() async {
        let transport = StubTransport([.init(status: 200, body: trackJSON)])
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await ITunesClient(transport: transport, paced: false).search("test")
        }
        do { _ = try await task.value; XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
        let requests = await transport.requests
        XCTAssertTrue(requests.isEmpty)
    }
}
