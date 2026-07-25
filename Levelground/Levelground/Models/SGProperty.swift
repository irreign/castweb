import Foundation

enum PropertyType: String, Codable {
    case hdb
    case condo
    case landed

    var title: String {
        switch self {
        case .hdb: return "HDB"
        case .condo: return "Condo"
        case .landed: return "Landed"
        }
    }
}

enum TenureType: String, Codable {
    case freehold
    case leasehold99
    case leasehold999
}

struct Tenure: Codable, Equatable {
    let type: TenureType
    /// Year the lease commenced. Required for .leasehold99, ignored otherwise.
    let leaseStartYear: Int?

    var title: String {
        switch type {
        case .freehold: return "Freehold"
        case .leasehold999: return "999-year leasehold"
        case .leasehold99:
            guard let start = leaseStartYear else { return "99-year leasehold" }
            return "99-year leasehold (from \(start))"
        }
    }
}

enum LeaseBand {
    case notApplicable
    case healthy(yearsRemaining: Int)
    case caution(yearsRemaining: Int)
    case highRisk(yearsRemaining: Int)

    var title: String {
        switch self {
        case .notApplicable: return "No material lease decay"
        case .healthy(let years): return "\(years) years remaining"
        case .caution(let years): return "\(years) years remaining"
        case .highRisk(let years): return "\(years) years remaining"
        }
    }

    var note: String {
        switch self {
        case .notApplicable:
            return "Freehold and 999-year leases don't run down in any way that affects your lifetime or financing."
        case .healthy:
            return "Comfortably above the 60-year mark most banks and CPF use as a threshold — financing should be straightforward."
        case .caution:
            return "Below 60 years remaining, banks typically cut the loan-to-value ratio and shorten the loan tenure, and CPF usage starts to face restrictions. Confirm the actual numbers with a bank before committing."
        case .highRisk:
            return "Below 30 years remaining, financing and CPF usage get significantly more restricted, and resale demand tends to be thinner. Get professional advice before proceeding."
        }
    }
}

struct SGProperty: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let type: PropertyType
    let town: String
    let tenure: Tenure
    let location: GeoPoint

    func leaseBand(asOf year: Int = Calendar.current.component(.year, from: Date())) -> LeaseBand {
        guard tenure.type == .leasehold99, let start = tenure.leaseStartYear else {
            return .notApplicable
        }
        let remaining = 99 - (year - start)
        if remaining >= 60 { return .healthy(yearsRemaining: remaining) }
        if remaining >= 30 { return .caution(yearsRemaining: remaining) }
        return .highRisk(yearsRemaining: remaining)
    }
}

enum SGPropertyData {
    /// Illustrative sample coordinates and lease data for demo purposes — not sourced from HDB/URA records.
    /// A real build should pull this from URA's REALIS/OneMap API or user-entered address geocoding.
    static let all: [SGProperty] = [
        SGProperty(
            id: "dawson-queenstown",
            name: "Dawson Road, Queenstown",
            type: .hdb,
            town: "Queenstown",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2015),
            location: GeoPoint(lat: 1.2967, lon: 103.8034)
        ),
        SGProperty(
            id: "bishan-st-near-aitong",
            name: "Bishan Street 22",
            type: .hdb,
            town: "Bishan",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1990),
            location: GeoPoint(lat: 1.3506, lon: 103.8300)
        ),
        SGProperty(
            id: "trilinq-clementi",
            name: "The Trilinq, Clementi",
            type: .condo,
            town: "Clementi",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2014),
            location: GeoPoint(lat: 1.3140, lon: 103.7649)
        ),
        SGProperty(
            id: "serangoon-north-hdb",
            name: "Serangoon North Avenue 1",
            type: .hdb,
            town: "Serangoon",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1985),
            location: GeoPoint(lat: 1.3620, lon: 103.8720)
        ),
        SGProperty(
            id: "marine-parade-condo",
            name: "Marine Parade Freehold Condo",
            type: .condo,
            town: "Marine Parade",
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3020, lon: 103.9050)
        ),
        SGProperty(
            id: "bukit-timah-landed",
            name: "Bukit Timah Terrace House",
            type: .landed,
            town: "Bukit Timah",
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3200, lon: 103.8050)
        )
    ]
}
