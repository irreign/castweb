import Foundation

struct SavedPropertySearch: Codable, Equatable, Identifiable {
    let id: String
    var name: String
    var filters: PropertySearchFilters
    let createdAt: Date

    init(name: String, filters: PropertySearchFilters) {
        self.id = UUID().uuidString
        self.name = name
        self.filters = filters
        self.createdAt = Date()
    }
}

enum SavedSearchStore {
    private static let key = "levelground.savedSearches"

    static func load() -> [SavedPropertySearch] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([SavedPropertySearch].self, from: data) else {
            return []
        }
        return decoded
    }

    static func save(_ searches: [SavedPropertySearch]) {
        guard let data = try? JSONEncoder().encode(searches) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
