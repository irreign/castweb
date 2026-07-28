import Foundation

struct PropertySearchFilters: Codable, Equatable {
    var propertyType: PropertyType?
    var district: Int?
    var schoolID: String?
    var maxBudget: Double = 3_000_000
    var minFacilities: FacilitiesLevel?
    var maxMcstFee: Double = 700
    var minLeaseYears: Double = 0

    static let `default` = PropertySearchFilters()

    private static let key = "levelground.propertySearchFilters"

    static func load() -> PropertySearchFilters {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode(PropertySearchFilters.self, from: data) else {
            return .default
        }
        return decoded
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }
}
