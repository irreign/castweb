import Foundation

enum Goal: String, Codable, CaseIterable, Identifiable {
    case buyFirstHome
    case buyToInvest
    case sellOrUpgrade
    case justExploring

    var id: String { rawValue }

    var title: String {
        switch self {
        case .buyFirstHome: return "Buy my first home"
        case .buyToInvest: return "Buy a property to invest"
        case .sellOrUpgrade: return "Sell or upgrade"
        case .justExploring: return "Just exploring, no plan yet"
        }
    }

    var icon: String {
        switch self {
        case .buyFirstHome: return "house.fill"
        case .buyToInvest: return "chart.line.uptrend.xyaxis"
        case .sellOrUpgrade: return "arrow.triangle.2.circlepath"
        case .justExploring: return "binoculars.fill"
        }
    }
}

enum ExperienceLevel: String, Codable, CaseIterable, Identifiable {
    case new
    case someExperience
    case experienced

    var id: String { rawValue }

    var title: String {
        switch self {
        case .new: return "First time, know very little"
        case .someExperience: return "Done some research"
        case .experienced: return "Bought or sold before"
        }
    }
}

enum KnowledgeCategory: String, Codable, CaseIterable, Identifiable {
    case financing
    case legalProcess
    case valuation
    case negotiation
    case redFlags
    case investmentMetrics
    case marketCycles
    case taxes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .financing: return "Financing"
        case .legalProcess: return "Legal & Contracts"
        case .valuation: return "Valuation & Pricing"
        case .negotiation: return "Negotiation"
        case .redFlags: return "Spotting Red Flags"
        case .investmentMetrics: return "Investment Returns"
        case .marketCycles: return "Market Cycles"
        case .taxes: return "Taxes & Fees"
        }
    }

    var icon: String {
        switch self {
        case .financing: return "banknote.fill"
        case .legalProcess: return "doc.text.fill"
        case .valuation: return "tag.fill"
        case .negotiation: return "bubble.left.and.bubble.right.fill"
        case .redFlags: return "exclamationmark.triangle.fill"
        case .investmentMetrics: return "chart.pie.fill"
        case .marketCycles: return "waveform.path.ecg"
        case .taxes: return "percent"
        }
    }
}

struct UserProfile: Codable, Equatable {
    var goal: Goal = .justExploring
    var experience: ExperienceLevel = .new
    var market: String = ""
    var interests: Set<KnowledgeCategory> = []
    var completedOnboarding: Bool = false
}
