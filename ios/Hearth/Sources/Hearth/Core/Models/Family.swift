import Foundation

/// Mirrors `public.families`.
struct Family: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var timezone: String
    var settings: FamilySettings
    let createdBy: UUID
    let createdAt: Date
    var updatedAt: Date

    var timeZone: TimeZone { TimeZone(identifier: timezone) ?? .current }
}

/// `families.settings` — the AI-behaviour configuration from Settings →
/// AI Behaviour (docs/02 §2.8, docs/06 §6.3). `autoAddThreshold` is
/// clamped again server-side (0.90–0.99) regardless of what's stored here
/// or sent from the client — see AUTO_ADD_MIN/MAX_THRESHOLD in
/// supabase/functions/_shared/extraction.ts.
struct FamilySettings: Codable, Hashable, Sendable {
    var autoAddEnabled: Bool
    var autoAddThreshold: Double

    static let `default` = FamilySettings(autoAddEnabled: false, autoAddThreshold: 0.95)
}
