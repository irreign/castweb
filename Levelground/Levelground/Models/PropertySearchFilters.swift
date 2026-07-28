import Foundation

enum PropertySortOption: String, Codable, CaseIterable {
    case nearestSchool
    case priceLowHigh
    case priceHighLow
    case psfLowHigh
    case psfHighLow
    case nameAZ

    var title: String {
        switch self {
        case .nearestSchool: return "Nearest school"
        case .priceLowHigh: return "Price: Low to High"
        case .priceHighLow: return "Price: High to Low"
        case .psfLowHigh: return "PSF: Low to High"
        case .psfHighLow: return "PSF: High to Low"
        case .nameAZ: return "Name A–Z"
        }
    }
}

struct PropertySearchFilters: Codable, Equatable {
    var propertyType: PropertyType?
    var district: Int?
    var schoolID: String?
    var maxBudget: Double
    var minFacilities: FacilitiesLevel?
    var maxMcstFee: Double
    var minLeaseYears: Double
    var sortOption: PropertySortOption

    static let `default` = PropertySearchFilters()

    private static let key = "levelground.propertySearchFilters"

    init(
        propertyType: PropertyType? = nil,
        district: Int? = nil,
        schoolID: String? = nil,
        maxBudget: Double = 3_000_000,
        minFacilities: FacilitiesLevel? = nil,
        maxMcstFee: Double = 700,
        minLeaseYears: Double = 0,
        sortOption: PropertySortOption = .nearestSchool
    ) {
        self.propertyType = propertyType
        self.district = district
        self.schoolID = schoolID
        self.maxBudget = maxBudget
        self.minFacilities = minFacilities
        self.maxMcstFee = maxMcstFee
        self.minLeaseYears = minLeaseYears
        self.sortOption = sortOption
    }

    /// Decodes leniently so adding new fields later doesn't invalidate filters already saved on a device.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        propertyType = try container.decodeIfPresent(PropertyType.self, forKey: .propertyType)
        district = try container.decodeIfPresent(Int.self, forKey: .district)
        schoolID = try container.decodeIfPresent(String.self, forKey: .schoolID)
        maxBudget = try container.decodeIfPresent(Double.self, forKey: .maxBudget) ?? 3_000_000
        minFacilities = try container.decodeIfPresent(FacilitiesLevel.self, forKey: .minFacilities)
        maxMcstFee = try container.decodeIfPresent(Double.self, forKey: .maxMcstFee) ?? 700
        minLeaseYears = try container.decodeIfPresent(Double.self, forKey: .minLeaseYears) ?? 0
        sortOption = try container.decodeIfPresent(PropertySortOption.self, forKey: .sortOption) ?? .nearestSchool
    }

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
