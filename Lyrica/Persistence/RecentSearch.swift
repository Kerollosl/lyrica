import Foundation
import SwiftData

@Model
final class RecentSearch {
    @Attribute(.unique) var normalizedQuery: String
    var query: String
    var searchedAt: Date

    init(query: String, normalizedQuery: String, searchedAt: Date = .now) {
        self.query = query
        self.normalizedQuery = normalizedQuery
        self.searchedAt = searchedAt
    }
}
