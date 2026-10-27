import Foundation
import SwiftData

@Model
final class CachedTranslation {
    @Attribute(.unique) var key: String
    var contentDigest: String
    var targetLanguage: String
    var sourceLanguage: String?
    var linesData: Data
    var createdAt: Date

    init(key: String, contentDigest: String, targetLanguage: String, sourceLanguage: String?, linesData: Data) {
        self.key = key
        self.contentDigest = contentDigest
        self.targetLanguage = targetLanguage
        self.sourceLanguage = sourceLanguage
        self.linesData = linesData
        createdAt = .now
    }
}
