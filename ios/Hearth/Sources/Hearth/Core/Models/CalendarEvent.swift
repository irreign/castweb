import Foundation

/// Mirrors `public.calendar_events`. Every field the brief §10 lists is
/// present, including the provenance fields that make an AI-created event
/// traceable back to its source message (docs/02 §2.2 step 6).
struct CalendarEvent: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let familyId: UUID
    var title: String
    var eventDescription: String?
    var startDate: CalendarDate
    var endDate: CalendarDate?
    var startTime: ClockTime?
    var endTime: ClockTime?
    var allDay: Bool
    var location: String?
    var category: EventCategory
    var recurrenceRule: String?
    var status: EventStatus
    var createdBy: UUID?
    var lastModifiedBy: UUID?
    var sourceMessageId: UUID?
    var aiGenerated: Bool
    var aiConfidence: Double?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, familyId, title
        case eventDescription = "description"
        case startDate, endDate, startTime, endTime, allDay, location, category
        case recurrenceRule, status, createdBy, lastModifiedBy, sourceMessageId
        case aiGenerated, aiConfidence, createdAt, updatedAt
    }

    var isCreatedFromChat: Bool { sourceMessageId != nil }

    var dateRangeText: String {
        guard let endDate, endDate != startDate else { return startDate.description }
        return "\(startDate.description) – \(endDate.description)"
    }
}
