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

/// Singapore's 28 postal districts, used the way local agents and buyers actually talk about area.
enum SGDistrict {
    static let info: [Int: (code: String, name: String)] = [
        1: ("D01", "Raffles Place, Cecil, Marina, People's Park"),
        2: ("D02", "Anson, Tanjong Pagar"),
        3: ("D03", "Queenstown, Tiong Bahru, Alexandra"),
        4: ("D04", "Telok Blangah, Harbourfront"),
        5: ("D05", "Pasir Panjang, Clementi, West Coast"),
        6: ("D06", "City Hall, Beach Road"),
        7: ("D07", "Bugis, Golden Mile"),
        8: ("D08", "Little India, Farrer Park"),
        9: ("D09", "Orchard, River Valley, Cairnhill"),
        10: ("D10", "Bukit Timah, Holland, Tanglin"),
        11: ("D11", "Novena, Thomson, Watten Estate"),
        12: ("D12", "Balestier, Toa Payoh, Serangoon"),
        13: ("D13", "Macpherson, Braddell"),
        14: ("D14", "Geylang, Eunos, Paya Lebar"),
        15: ("D15", "Katong, Joo Chiat, Marine Parade"),
        16: ("D16", "Bedok, Upper East Coast"),
        17: ("D17", "Loyang, Changi"),
        18: ("D18", "Tampines, Pasir Ris"),
        19: ("D19", "Hougang, Punggol, Sengkang, Serangoon Garden"),
        20: ("D20", "Bishan, Ang Mo Kio"),
        21: ("D21", "Upper Bukit Timah, Beauty World, Clementi Park"),
        22: ("D22", "Jurong, Boon Lay, Tuas"),
        23: ("D23", "Bukit Batok, Bukit Panjang, Choa Chu Kang, Hillview"),
        24: ("D24", "Lim Chu Kang, Tengah"),
        25: ("D25", "Woodlands, Kranji"),
        26: ("D26", "Upper Thomson, Springleaf"),
        27: ("D27", "Yishun, Sembawang"),
        28: ("D28", "Seletar, Yio Chu Kang"),
    ]

    static func label(_ district: Int) -> String {
        guard let entry = info[district] else { return "District \(district)" }
        return "\(entry.code) · \(entry.name)"
    }

    static func code(_ district: Int) -> String {
        info[district]?.code ?? "D\(district)"
    }

    /// Approximate district-center coordinates, for the standalone School Priority Check
    /// tool only (letting someone check a school without a specific address). These are
    /// rough geographic centers of each district's named area, not a real or exact
    /// address — never use them as a stand-in for property search accuracy.
    static let centroid: [Int: GeoPoint] = [
        1: GeoPoint(lat: 1.2839, lon: 103.8517),
        2: GeoPoint(lat: 1.2762, lon: 103.8440),
        3: GeoPoint(lat: 1.2900, lon: 103.8100),
        4: GeoPoint(lat: 1.2653, lon: 103.8221),
        5: GeoPoint(lat: 1.3140, lon: 103.7649),
        6: GeoPoint(lat: 1.2930, lon: 103.8520),
        7: GeoPoint(lat: 1.2990, lon: 103.8560),
        8: GeoPoint(lat: 1.3123, lon: 103.8547),
        9: GeoPoint(lat: 1.3040, lon: 103.8318),
        10: GeoPoint(lat: 1.3225, lon: 103.7969),
        11: GeoPoint(lat: 1.3255, lon: 103.8400),
        12: GeoPoint(lat: 1.3345, lon: 103.8470),
        13: GeoPoint(lat: 1.3390, lon: 103.8620),
        14: GeoPoint(lat: 1.3180, lon: 103.8925),
        15: GeoPoint(lat: 1.3020, lon: 103.9050),
        16: GeoPoint(lat: 1.3300, lon: 103.9400),
        17: GeoPoint(lat: 1.3600, lon: 103.9800),
        18: GeoPoint(lat: 1.3470, lon: 103.9350),
        19: GeoPoint(lat: 1.3700, lon: 103.8900),
        20: GeoPoint(lat: 1.3555, lon: 103.8480),
        21: GeoPoint(lat: 1.3411, lon: 103.7759),
        22: GeoPoint(lat: 1.3400, lon: 103.7050),
        23: GeoPoint(lat: 1.3496, lon: 103.7490),
        24: GeoPoint(lat: 1.3800, lon: 103.7200),
        25: GeoPoint(lat: 1.4360, lon: 103.7860),
        26: GeoPoint(lat: 1.3800, lon: 103.8300),
        27: GeoPoint(lat: 1.4295, lon: 103.8350),
        28: GeoPoint(lat: 1.3950, lon: 103.8500),
    ]
}

struct SGProperty: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let type: PropertyType
    let town: String
    /// Singapore postal district (1–28). See SGDistrict.
    let district: Int
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
    /// Districts follow Singapore's standard 28 postal-district groupings (see SGDistrict).
    static let all: [SGProperty] = [
        SGProperty(
            id: "dawson-queenstown",
            name: "Dawson Road, Queenstown",
            type: .hdb,
            town: "Queenstown",
            district: 3,
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
            district: 20,
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
            town: "Serangoon North",
            district: 19,
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
            district: 10,
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
            district: 5,
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
            district: 15,
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
            district: 20,
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
            district: 12,
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
            district: 5,
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
            district: 5,
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
            district: 19,
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
            district: 18,
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
            district: 11,
            tenure: Tenure(type: .freehold, leaseStartYear: nil),
            location: GeoPoint(lat: 1.3255, lon: 103.8400),
            pricePsfHistoric: 2300,
            unitSizeSqft: 850,
            mcstFeeMonthly: 600,
            facilities: .premium,
            indicativePrice: 1_955_000
        ),
        SGProperty(
            id: "marina-one-residences",
            name: "Marina One Residences",
            type: .condo,
            town: "Marina",
            district: 1,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2017),
            location: GeoPoint(lat: 1.2807, lon: 103.8535),
            pricePsfHistoric: 2600,
            unitSizeSqft: 800,
            mcstFeeMonthly: 650,
            facilities: .premium,
            indicativePrice: 2_080_000
        ),
        SGProperty(
            id: "icon-tanjong-pagar",
            name: "Icon, Tanjong Pagar",
            type: .condo,
            town: "Tanjong Pagar",
            district: 2,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2007),
            location: GeoPoint(lat: 1.2762, lon: 103.8440),
            pricePsfHistoric: 2200,
            unitSizeSqft: 750,
            mcstFeeMonthly: 500,
            facilities: .full,
            indicativePrice: 1_650_000
        ),
        SGProperty(
            id: "harbourfront-suites",
            name: "HarbourFront Suites",
            type: .condo,
            town: "Telok Blangah",
            district: 4,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2011),
            location: GeoPoint(lat: 1.2653, lon: 103.8221),
            pricePsfHistoric: 1800,
            unitSizeSqft: 850,
            mcstFeeMonthly: 420,
            facilities: .full,
            indicativePrice: 1_530_000
        ),
        SGProperty(
            id: "city-square-residences",
            name: "City Square Residences",
            type: .condo,
            town: "Little India",
            district: 8,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2009),
            location: GeoPoint(lat: 1.3123, lon: 103.8547),
            pricePsfHistoric: 1700,
            unitSizeSqft: 900,
            mcstFeeMonthly: 400,
            facilities: .full,
            indicativePrice: 1_530_000
        ),
        SGProperty(
            id: "sixth-avenue-residences",
            name: "Sixth Avenue Residences",
            type: .condo,
            town: "Bukit Timah",
            district: 10,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2021),
            location: GeoPoint(lat: 1.3225, lon: 103.7969),
            pricePsfHistoric: 2400,
            unitSizeSqft: 950,
            mcstFeeMonthly: 550,
            facilities: .premium,
            indicativePrice: 2_280_000
        ),
        SGProperty(
            id: "beauty-world-residences",
            name: "Beauty World Residences",
            type: .condo,
            town: "Beauty World",
            district: 21,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2023),
            location: GeoPoint(lat: 1.3411, lon: 103.7759),
            pricePsfHistoric: 2100,
            unitSizeSqft: 900,
            mcstFeeMonthly: 480,
            facilities: .premium,
            indicativePrice: 1_890_000
        ),
        SGProperty(
            id: "daintree-residence",
            name: "Daintree Residence",
            type: .condo,
            town: "Toh Tuck / Bukit Timah",
            district: 21,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2021),
            location: GeoPoint(lat: 1.3390, lon: 103.7830),
            pricePsfHistoric: 1750,
            unitSizeSqft: 1000,
            mcstFeeMonthly: 420,
            facilities: .full,
            indicativePrice: 1_750_000
        ),
        SGProperty(
            id: "braddell-view-hdb",
            name: "Braddell View",
            type: .hdb,
            town: "Macpherson",
            district: 13,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1978),
            location: GeoPoint(lat: 1.3390, lon: 103.8620),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 480_000
        ),
        SGProperty(
            id: "paya-lebar-quarter",
            name: "Paya Lebar Quarter",
            type: .condo,
            town: "Paya Lebar",
            district: 14,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2019),
            location: GeoPoint(lat: 1.3180, lon: 103.8925),
            pricePsfHistoric: 1900,
            unitSizeSqft: 850,
            mcstFeeMonthly: 450,
            facilities: .full,
            indicativePrice: 1_615_000
        ),
        SGProperty(
            id: "bedok-north-hdb",
            name: "Bedok North Avenue 2",
            type: .hdb,
            town: "Bedok",
            district: 16,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1995),
            location: GeoPoint(lat: 1.3300, lon: 103.9400),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 560_000
        ),
        SGProperty(
            id: "jurong-west-hdb",
            name: "Jurong West Street 42",
            type: .hdb,
            town: "Jurong West",
            district: 22,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1988),
            location: GeoPoint(lat: 1.3400, lon: 103.7050),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 480_000
        ),
        SGProperty(
            id: "le-quest-bukit-batok",
            name: "Le Quest, Bukit Batok",
            type: .condo,
            town: "Bukit Batok",
            district: 23,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2017),
            location: GeoPoint(lat: 1.3496, lon: 103.7490),
            pricePsfHistoric: 1450,
            unitSizeSqft: 1000,
            mcstFeeMonthly: 350,
            facilities: .full,
            indicativePrice: 1_450_000
        ),
        SGProperty(
            id: "woodlands-hdb",
            name: "Woodlands Drive 16",
            type: .hdb,
            town: "Woodlands",
            district: 25,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1998),
            location: GeoPoint(lat: 1.4360, lon: 103.7860),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 460_000
        ),
        SGProperty(
            id: "yishun-hdb",
            name: "Yishun Ring Road",
            type: .hdb,
            town: "Yishun",
            district: 27,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 1992),
            location: GeoPoint(lat: 1.4295, lon: 103.8350),
            pricePsfHistoric: nil,
            unitSizeSqft: nil,
            mcstFeeMonthly: nil,
            facilities: nil,
            indicativePrice: 430_000
        ),
        SGProperty(
            id: "punggol-waterway-condo",
            name: "Punggol Waterway Terraces",
            type: .condo,
            town: "Punggol",
            district: 19,
            tenure: Tenure(type: .leasehold99, leaseStartYear: 2019),
            location: GeoPoint(lat: 1.4032, lon: 103.9021),
            pricePsfHistoric: 1400,
            unitSizeSqft: 950,
            mcstFeeMonthly: 320,
            facilities: .full,
            indicativePrice: 1_330_000
        )
    ]

    /// Average historic psf among sample condos in the same district — a rough "is this psf
    /// typical" reference point. With a bigger dataset this would be a real transaction-based comparable.
    static func averagePsf(inDistrict district: Int) -> Int? {
        let psfs = all.filter { $0.type == .condo && $0.district == district }.compactMap { $0.pricePsfHistoric }
        guard !psfs.isEmpty else { return nil }
        return psfs.reduce(0, +) / psfs.count
    }

    /// Average indicative price for a property type in a district, for HDB/landed where
    /// there's no psf figure to compare — same sample-data caveat as averagePsf.
    static func averageIndicativePrice(type: PropertyType, district: Int) -> Int? {
        let prices = all.filter { $0.type == type && $0.district == district }.map { $0.indicativePrice }
        guard !prices.isEmpty else { return nil }
        return prices.reduce(0, +) / prices.count
    }
}
