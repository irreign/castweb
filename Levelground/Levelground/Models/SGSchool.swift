import Foundation

struct SGSchool: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let area: String
    let location: GeoPoint
}

enum SchoolPriorityBand: String {
    case within1km
    case within2km
    case beyond2km

    var title: String {
        switch self {
        case .within1km: return "Within 1km"
        case .within2km: return "1km – 2km"
        case .beyond2km: return "Beyond 2km"
        }
    }

    var phaseNote: String {
        switch self {
        case .within1km: return "Phase 2A(1) priority — the strongest priority tier open to non-alumni families."
        case .within2km: return "Phase 2A(1) priority does not apply, but you still get Phase 2B priority ahead of the general public ballot."
        case .beyond2km: return "No distance-based priority. You'd register in Phase 2C, competing island-wide by ballot."
        }
    }
}

struct SchoolDistance: Identifiable {
    var id: String { school.id }
    let school: SGSchool
    let distanceKm: Double

    var band: SchoolPriorityBand {
        if distanceKm <= 1.0 { return .within1km }
        if distanceKm <= 2.0 { return .within2km }
        return .beyond2km
    }
}

enum SGSchoolData {
    /// Illustrative sample coordinates for demo purposes — not verified against MOE/OneMap.
    /// A real build should pull this from MOE's school directory or the OneMap API.
    static let all: [SGSchool] = [
        SGSchool(id: "ai-tong", name: "Ai Tong School", area: "Bright Hill", location: GeoPoint(lat: 1.3597, lon: 103.8339)),
        SGSchool(id: "rosyth", name: "Rosyth School", area: "Serangoon North", location: GeoPoint(lat: 1.3620, lon: 103.8720)),
        SGSchool(id: "nan-hua", name: "Nan Hua Primary School", area: "Clementi", location: GeoPoint(lat: 1.3175, lon: 103.7793)),
        SGSchool(id: "nanyang", name: "Nanyang Primary School", area: "Bukit Timah", location: GeoPoint(lat: 1.3138, lon: 103.8078)),
        SGSchool(id: "tao-nan", name: "Tao Nan School", area: "Marine Parade", location: GeoPoint(lat: 1.3086, lon: 103.9036)),
        SGSchool(id: "henry-park", name: "Henry Park Primary School", area: "Holland", location: GeoPoint(lat: 1.3145, lon: 103.7847)),
        SGSchool(id: "catholic-high", name: "Catholic High School (Primary)", area: "Bishan", location: GeoPoint(lat: 1.3567, lon: 103.8508)),
        SGSchool(id: "pei-hwa", name: "Pei Hwa Presbyterian Primary School", area: "Bukit Timah", location: GeoPoint(lat: 1.3423, lon: 103.7913)),
        SGSchool(id: "acs-primary", name: "Anglo-Chinese School (Primary)", area: "Novena", location: GeoPoint(lat: 1.3277, lon: 103.8377)),
        SGSchool(id: "st-hildas", name: "St. Hilda's Primary School", area: "Tampines", location: GeoPoint(lat: 1.3496, lon: 103.9391))
    ]

    static func nearest(to point: GeoPoint, limit: Int = 4) -> [SchoolDistance] {
        all
            .map { SchoolDistance(school: $0, distanceKm: $0.location.distanceKm(to: point)) }
            .sorted { $0.distanceKm < $1.distanceKm }
            .prefix(limit)
            .map { $0 }
    }
}
