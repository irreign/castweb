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

enum FacilitiesLevel: Int, Codable, CaseIterable, Comparable {
    case basic
    case full
    case premium

    static func < (lhs: FacilitiesLevel, rhs: FacilitiesLevel) -> Bool { lhs.rawValue < rhs.rawValue }

    var title: String {
        switch self {
        case .basic: return "Basic"
        case .full: return "Full"
        case .premium: return "Premium"
        }
    }

    var description: String {
        switch self {
        case .basic: return "Pool and gym."
        case .full: return "Pool, gym, BBQ pits, function room, and a sports court."
        case .premium: return "Full facilities plus concierge, multiple pools, and a landscaped clubhouse or sky terrace."
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

    /// Historic transacted price per square foot (SGD). Condos only — HDB uses a flat
    /// resale price and landed titles rarely trade on a psf basis in the same way.
    let pricePsfHistoric: Int?
    /// Indicative unit size backing `pricePsfHistoric`. Condos only.
    let unitSizeSqft: Int?
    /// Monthly MCST (Management Corporation Strata Title) maintenance fee. Condos only —
    /// HDB flats pay Service & Conservancy Charges instead, which work very differently.
    let mcstFeeMonthly: Int?
    let facilities: FacilitiesLevel?

    /// Indicative total price, for budget comparisons across all property types.
    /// For condos this is pricePsfHistoric × unitSizeSqft; for HDB/landed it's the flat resale price.
    let indicativePrice: Int

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
    /// Illustrative sample coordinates, psf and lease data for demo purposes — not sourced from
    /// HDB/URA records. A real build should pull this from URA's REALIS/OneMap API or user-entered
    /// address geocoding, and psf from actual caveat transactions rather than hand-authored numbers.
    static let all: [SGProperty] = [
        SGProperty(
            id: "dawson-queenstown",
            name: "Dawson Road, Queenstown",
            type: .hdb,
            town: "Queenstown",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2015),
            location: GeoPoint(lat: 1.2967, lon: 103.8034),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 780_000
        ),
        SGProperty(
            id: "bishan-st-near-aitong",
            name: "Bishan Street 22",
            type: .hdb,
            town: "Bishan",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1990),
            location: GeoPoint(lat: 1.3506, lon: 103.8300),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 650_000
        ),
        SGProperty(
            id: "serangoon-north-hdb",
            name: "Serangoon North Avenue 1",
            type: .hdb,
            town: "Serangoon",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1985),
            location: GeoPoint(lat: 1.3620, lon: 103.8720),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 550_000
        ),
        SGProperty(
            id: "bukit-timah-landed",
            name: "Bukit Timah Terrace House",
            type: .landed,
            town: "Bukit Timah",
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3200, lon: 103.8050),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 3_800_000
        ),
        SGProperty(
            id: "trilinq-clementi",
            name: "The Trilinq, Clementi",
            type: .condo,
            town: "Clementi",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2014),
            location: GeoPoint(lat: 1.3140, lon: 103.7649),
            pricePsfHistoric: 1450,
            unitSizeSqft: 1050,
            mcstFeeMonthly: 380,
            facilities: .full,
            indicativePrice: 1_522_500
        ),
        SGProperty(
            id: "marine-parade-condo",
            name: "Marine Parade Freehold Condo",
            type: .condo,
            town: "Marine Parade",
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3020, lon: 103.9050),
            pricePsfHistoric: 2100,
            unitSizeSqft: 950,
            mcstFeeMonthly: 550,
            facilities: .premium,
            indicativePrice: 1_995_000
        ),
        SGProperty(
            id: "sky-habitat-bishan",
            name: "Sky Habitat, Bishan",
            type: .condo,
            town: "Bishan",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2015),
            location: GeoPoint(lat: 1.3555, lon: 103.8480),
            pricePsfHistoric: 1750,
            unitSizeSqft: 1100,
            mcstFeeMonthly: 480,
            facilities: .premium,
            indicativePrice: 1_925_000
        ),
        SGProperty(
            id: "trevista-toa-payoh",
            name: "Trevista, Toa Payoh",
            type: .condo,
            town: "Toa Payoh",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2012),
            location: GeoPoint(lat: 1.3345, lon: 103.8470),
            pricePsfHistoric: 1550,
            unitSizeSqft: 900,
            mcstFeeMonthly: 350,
            facilities: .full,
            indicativePrice: 1_395_000
        ),
        SGProperty(
            id: "clement-canopy-clementi",
            name: "The Clement Canopy, Clementi",
            type: .condo,
            town: "Clementi",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2017),
            location: GeoPoint(lat: 1.3330, lon: 103.7745),
            pricePsfHistoric: 1650,
            unitSizeSqft: 980,
            mcstFeeMonthly: 400,
            facilities: .full,
            indicativePrice: 1_617_000
        ),
        SGProperty(
            id: "parc-riviera-west-coast",
            name: "Parc Riviera, West Coast",
            type: .condo,
            town: "West Coast",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2016),
            location: GeoPoint(lat: 1.3115, lon: 103.7645),
            pricePsfHistoric: 1350,
            unitSizeSqft: 1150,
            mcstFeeMonthly: 280,
            facilities: .basic,
            indicativePrice: 1_552_500
        ),
        SGProperty(
            id: "garden-residences-serangoon",
            name: "The Garden Residences, Serangoon",
            type: .condo,
            town: "Serangoon North",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2018),
            location: GeoPoint(lat: 1.3580, lon: 103.8695),
            pricePsfHistoric: 1500,
            unitSizeSqft: 1020,
            mcstFeeMonthly: 360,
            facilities: .full,
            indicativePrice: 1_530_000
        ),
        SGProperty(
            id: "tampines-grande",
            name: "Tampines Grande",
            type: .condo,
            town: "Tampines",
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2013),
            location: GeoPoint(lat: 1.3470, lon: 103.9350),
            pricePsfHistoric: 1250,
            unitSizeSqft: 1100,
            mcstFeeMonthly: 250,
            facilities: .basic,
            indicativePrice: 1_375_000
        ),
        SGProperty(
            id: "nim-collection-novena",
            name: "Nim Collection, Novena",
            type: .condo,
            town: "Novena",
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3255, lon: 103.8400),
            pricePsfHistoric: 2300,
            unitSizeSqft: 850,
            mcstFeeMonthly: 600,
            facilities: .premium,
            indicativePrice: 1_955_000
        )
    ]

    /// Average historic psf among sample condos in the same town — a rough "is this psf typical"
    /// reference point. With a bigger dataset this would be a real transaction-based comparable.
    static func averagePsf(inTown town: String) -> Int? {
        let psfs = all.filter { $0.type == .condo && $0.town == town }.compactMap { $0.pricePsfHistoric }
        guard !psfs.isEmpty else { return nil }
        return psfs.reduce(0, +) / psfs.count
    }
}
