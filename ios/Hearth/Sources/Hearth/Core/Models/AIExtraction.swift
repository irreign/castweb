import Foundation

/// Mirrors `public.ai_extractions` — the provenance/audit row behind every
/// AI-detected event (docs/05 §5.2, brief §10). The client mostly reads
/// this indirectly via a card message's `metadata.extraction_id`, but
/// fetches the full row when resolving a card or showing "Created from
/// chat" detail.
struct AIExtraction: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let messageId: UUID
    let familyId: UUID
    var status: ExtractionStatus
    var confidence: Double?
    var needsClarification: Bool
    var clarificationQuestion: String?
    var duplicateOfEventId: UUID?
    var resultingEventId: UUID?
    var cardMessageId: UUID?
    var resolvedBy: UUID?
    var resolvedAt: Date?
    let createdAt: Date
    var updatedAt: Date
}

/// Mirrors `public.notification_preferences` — see Settings → Notifications.
struct NotificationPreferences: Codable, Hashable, Sendable {
    let userId: UUID
    let familyId: UUID
    var newMessage: Bool
    var eventAdded: Bool
    var eventUpcoming: Bool
    var eventChanged: Bool
    var clarificationNeeded: Bool
    var updatedAt: Date

    func value(for category: NotificationCategory) -> Bool {
        switch category {
        case .newMessage: return newMessage
        case .eventAdded: return eventAdded
        case .eventUpcoming: return eventUpcoming
        case .eventChanged: return eventChanged
        case .clarificationNeeded: return clarificationNeeded
        }
    }
}
