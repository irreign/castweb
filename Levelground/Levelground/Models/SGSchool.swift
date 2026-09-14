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
        case .within1km: return "Top priority in whichever phase you register in — most families with no tie to the school register in Phase 2C, where this is the strongest tier available."
        case .within2km: return "Still ahead of beyond-2km applicants in your registration phase, but not ahead of anyone closer."
        case .beyond2km: return "No distance-based edge — you compete islandwide within your phase, usually settled by ballot."
        }
    }
}

/// Singapore's Primary 1 registration phases, in order. Distance priority
/// (see SchoolPriorityBand) is the tiebreaker used *within* a phase when that
/// phase has more applicants for a school than places left — it isn't a
/// phase of its own, and it mostly matters in Phase 2C, since that's where
/// families with no other tie to the school register.
struct RegistrationPhase: Identifiable {
    let id: String
    let title: String
    let whoQualifies: String
}

enum RegistrationPhaseData {
    static let all: [RegistrationPhase] = [
        RegistrationPhase(id: "phase1", title: "Phase 1", whoQualifies: "A sibling is currently studying at the school."),
        RegistrationPhase(id: "phase2a1", title: "Phase 2A(1)", whoQualifies: "A parent sits on the school's board/management committee, or works at the school."),
        RegistrationPhase(id: "phase2a2", title: "Phase 2A(2)", whoQualifies: "A parent is an alumnus registered with the school's alumni association."),
        RegistrationPhase(id: "phase2b", title: "Phase 2B", whoQualifies: "A parent is a recognised community leader or school volunteer, or the child is endorsed by a religious/clan body affiliated with the school."),
        RegistrationPhase(id: "phase2c", title: "Phase 2C", whoQualifies: "Everyone else — every remaining Singapore Citizen or PR child. This is where distance priority (1km / 1-2km / beyond) actually decides most outcomes."),
        RegistrationPhase(id: "phase2csupp", title: "Phase 2C Supplementary", whoQualifies: "For children not yet placed anywhere — choose from schools that still have vacancies."),
        RegistrationPhase(id: "phase3", title: "Phase 3", whoQualifies: "Children who are not Singapore Citizens or PRs, if places remain.")
    ]
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
        SGSchool(id: "st-hildas", name: "St. Hilda's Primary School", area: "Tampines", location: GeoPoint(lat: 1.3496, lon: 103.9391)),
        SGSchool(id: "radin-mas", name: "Radin Mas Primary School", area: "Telok Blangah", location: GeoPoint(lat: 1.2735, lon: 103.8195)),
        SGSchool(id: "balestier-hill", name: "Balestier Hill Primary School", area: "Balestier", location: GeoPoint(lat: 1.3270, lon: 103.8460)),
        SGSchool(id: "kong-hwa", name: "Kong Hwa School", area: "Geylang", location: GeoPoint(lat: 1.3195, lon: 103.8890)),
        SGSchool(id: "temasek-primary", name: "Temasek Primary School", area: "Bedok", location: GeoPoint(lat: 1.3200, lon: 103.9350)),
        SGSchool(id: "jurong-west-primary", name: "Jurong West Primary School", area: "Jurong West", location: GeoPoint(lat: 1.3405, lon: 103.7045)),
        SGSchool(id: "princess-elizabeth", name: "Princess Elizabeth Primary School", area: "Bukit Batok", location: GeoPoint(lat: 1.3520, lon: 103.7550)),
        SGSchool(id: "woodgrove-primary", name: "Woodgrove Primary School", area: "Woodlands", location: GeoPoint(lat: 1.4372, lon: 103.7868)),
        SGSchool(id: "northland-primary", name: "Northland Primary School", area: "Yishun", location: GeoPoint(lat: 1.4280, lon: 103.8300)),
        SGSchool(id: "punggol-primary", name: "Punggol Primary School", area: "Punggol", location: GeoPoint(lat: 1.4010, lon: 103.9020))
    ]

    static func nearest(to point: GeoPoint, limit: Int = 4) -> [SchoolDistance] {
        all
            .map { SchoolDistance(school: $0, distanceKm: $0.location.distanceKm(to: point)) }
            .sorted { $0.distanceKm < $1.distanceKm }
            .prefix(limit)
            .map { $0 }
    }
}
