import Foundation

/// Mirrors `public.family_role` in 0001_init.sql. Drives UI-level gating
/// only — the real enforcement is Postgres RLS (docs/07 §7.7).
enum FamilyRole: String, Codable, CaseIterable {
    case owner
    case adult
    case child
}

enum MemberStatus: String, Codable {
    case active
    case removed
}

/// Mirrors `public.message_kind`.
enum MessageKind: String, Codable {
    case user
    case system
    case assistant
}

/// Mirrors `public.event_category`.
enum EventCategory: String, Codable, CaseIterable, Identifiable {
    case appointment, birthday, school, holiday, travel, leave
    case dinner, meeting, activity, deadline, reminder, other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .appointment: return "Appointment"
        case .birthday: return "Birthday"
        case .school: return "School"
        case .holiday: return "Holiday"
        case .travel: return "Travel"
        case .leave: return "Leave"
        case .dinner: return "Dinner"
        case .meeting: return "Meeting"
        case .activity: return "Activity"
        case .deadline: return "Deadline"
        case .reminder: return "Reminder"
        case .other: return "Other"
        }
    }

    var emoji: String {
        switch self {
        case .appointment: return "🩺"
        case .birthday: return "🎂"
        case .school: return "🎒"
        case .holiday: return "🌴"
        case .travel: return "✈️"
        case .leave: return "🧳"
        case .dinner: return "🍽️"
        case .meeting: return "🗓️"
        case .activity: return "🎉"
        case .deadline: return "⏰"
        case .reminder: return "🔔"
        case .other: return "📌"
        }
    }
}

enum EventStatus: String, Codable {
    case confirmed
    case cancelled
}

/// Mirrors `public.extraction_status`.
enum ExtractionStatus: String, Codable {
    case silent
    case pending
    case resolved
    case ignored
    case duplicate
    case failed
    case autoAdded = "auto_added"
}

/// The kind of inline AI card a system message renders as, read from
/// `messages.metadata.card_type` (see supabase/functions/ai-extract).
enum CardType: String, Codable {
    case eventSuggestion = "event_suggestion"
    case eventUpdateSuggestion = "event_update_suggestion"
    case eventClarification = "event_clarification"
    case eventConfirmed = "event_confirmed"
}

/// The state a card has settled into, read from `messages.metadata.card_state`
/// (set by the resolve_ai_extraction RPC — 0001_init.sql).
enum CardState: String, Codable {
    case pending
    case resolved
    case ignored
}

enum NotificationCategory: String, Codable, CaseIterable {
    case newMessage = "new_message"
    case eventAdded = "event_added"
    case eventUpcoming = "event_upcoming"
    case eventChanged = "event_changed"
    case clarificationNeeded = "clarification_needed"

    var displayName: String {
        switch self {
        case .newMessage: return "New messages"
        case .eventAdded: return "Events added"
        case .eventUpcoming: return "Upcoming event reminders"
        case .eventChanged: return "Event changes"
        case .clarificationNeeded: return "AI clarification requests"
        }
    }
}
