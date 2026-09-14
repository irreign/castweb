import Foundation

struct KnowledgeItem: Identifiable, Codable, Equatable {
    let id: String
    let title: String
    let category: KnowledgeCategory
    let level: ExperienceLevel
    let summary: String
    let body: [String]
    let readMinutes: Int
}
