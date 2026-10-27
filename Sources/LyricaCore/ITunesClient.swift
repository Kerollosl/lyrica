import Foundation

public protocol SongSearching: Sendable {
    func search(_ query: String) async throws -> [Song]
    func song(fromAppleMusicURL url: URL) async throws -> Song
}

public struct AppleMusicReference: Equatable, Sendable {
    public let songID: Int
    public let country: String

    public init(url: URL) throws {
        guard ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              ["music.apple.com", "geo.music.apple.com", "itunes.apple.com"].contains(url.host?.lowercased() ?? ""),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw LyricaError.invalidAppleMusicURL
        }
        let path = url.pathComponents.filter { $0 != "/" }
        let isSong = path.contains("song")
        let isAlbum = path.contains("album")
        guard isSong || isAlbum else { throw LyricaError.invalidAppleMusicURL }
        let queryID = components.queryItems?.first(where: { $0.name == "i" })?.value
        let rawID = queryID ?? (isSong ? path.last : nil)
        guard let rawID, let id = Int(rawID.hasPrefix("id") ? String(rawID.dropFirst(2)) : rawID), id > 0 else {
            throw LyricaError.invalidAppleMusicURL
        }
        songID = id
        let storefront = path.first ?? "us"
        country = storefront.count == 2 && storefront.allSatisfy(\.isLetter) ? storefront.uppercased() : "US"
    }
}

public struct ITunesClient: SongSearching {
    private let client: HTTPClient
    private let country: String

    public init(country: String = Locale.current.region?.identifier ?? "US",
                transport: any HTTPTransport = URLSessionTransport(), paced: Bool = true) {
        self.country = country
        client = HTTPClient(transport: transport, paced: paced)
    }

    public func search(_ query: String) async throws -> [Song] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let response = try await client.get(SearchResponse.self, url: url(path: "search", items: [
            URLQueryItem(name: "term", value: query),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "country", value: country),
            URLQueryItem(name: "limit", value: "40")
        ]), notFoundError: .songNotFound)
        var seen = Set<Int>()
        return response.results.compactMap(\.song).filter { seen.insert($0.id).inserted }
    }

    public func song(fromAppleMusicURL link: URL) async throws -> Song {
        let reference = try AppleMusicReference(url: link)
        let response = try await client.get(SearchResponse.self, url: url(path: "lookup", items: [
            URLQueryItem(name: "id", value: String(reference.songID)),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "country", value: reference.country)
        ]), notFoundError: .songNotFound)
        guard let song = response.results.compactMap(\.song).first(where: { $0.id == reference.songID }) else {
            throw LyricaError.songNotFound
        }
        return song
    }

    private func url(path: String, items: [URLQueryItem]) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "itunes.apple.com"
        components.path = "/\(path)"
        components.queryItems = items
        return components.url!
    }
}

private struct SearchResponse: Decodable, Sendable {
    let results: [Track]
}

private struct Track: Decodable, Sendable {
    let kind: String?
    let trackId: Int?
    let trackName: String?
    let artistName: String?
    let collectionName: String?
    let trackTimeMillis: Double?
    let artworkUrl100: String?
    let trackViewUrl: String?

    var song: Song? {
        guard kind == "song", let id = trackId, let title = trackName, let artist = artistName else { return nil }
        return Song(id: id, title: title, artist: artist, album: collectionName ?? "",
                    duration: max(0, (trackTimeMillis ?? 0) / 1_000),
                    artworkURL: artworkUrl100.flatMap { URL(string: $0.replacingOccurrences(of: "100x100bb", with: "600x600bb")) },
                    appleMusicURL: trackViewUrl.flatMap(URL.init(string:)))
    }
}
