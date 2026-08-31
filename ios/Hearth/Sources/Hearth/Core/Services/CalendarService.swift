import Foundation
import Supabase

/// Shared calendar reads/writes (brief §10-§11). Manual create/edit/delete
/// go through plain PostgREST calls under RLS (owner/adult only — docs/07
/// §7.7); AI-created events are written by the `ai-extract` Edge Function
/// or the `resolve_ai_extraction` RPC (AIService), never here.
@MainActor
final class CalendarService {
    private let client: SupabaseClient
    init(client: SupabaseClient = SupabaseManager.shared.client) { self.client = client }

    func fetchEvents(familyId: UUID, from: CalendarDate, to: CalendarDate) async throws -> [CalendarEvent] {
        try await client.from("calendar_events")
            .select()
            .eq("family_id", value: familyId)
            .eq("status", value: EventStatus.confirmed.rawValue)
            .gte("start_date", value: from.description)
            .lte("start_date", value: to.description)
            .order("start_date")
            .execute()
            .value
    }

    func fetchEvent(id: UUID) async throws -> CalendarEvent {
        try await client.from("calendar_events").select().eq("id", value: id).single().execute().value
    }

    func fetchSourceMessage(for event: CalendarEvent) async throws -> Message? {
        guard let messageId = event.sourceMessageId else { return nil }
        let messages: [Message] = try await client.from("messages").select().eq("id", value: messageId).limit(1).execute().value
        return messages.first
    }

    struct EventInput {
        var title: String
        var description: String?
        var startDate: CalendarDate
        var endDate: CalendarDate?
        var startTime: ClockTime?
        var endTime: ClockTime?
        var allDay: Bool
        var location: String?
        var category: EventCategory
    }

    private struct EventWrite: Encodable {
        var familyId: UUID?
        var title: String
        var description: String?
        var startDate: CalendarDate
        var endDate: CalendarDate?
        var startTime: ClockTime?
        var endTime: ClockTime?
        var allDay: Bool
        var location: String?
        var category: String
        var createdBy: UUID?
        var lastModifiedBy: UUID
    }

    func createEvent(familyId: UUID, createdBy: UUID, input: EventInput) async throws -> CalendarEvent {
        let write = EventWrite(
            familyId: familyId, title: input.title, description: input.description,
            startDate: input.startDate, endDate: input.endDate, startTime: input.startTime, endTime: input.endTime,
            allDay: input.allDay, location: input.location, category: input.category.rawValue,
            createdBy: createdBy, lastModifiedBy: createdBy
        )
        return try await client.from("calendar_events")
            .insert(write, returning: .representation)
            .single()
            .execute()
            .value
    }

    func updateEvent(id: UUID, modifiedBy: UUID, input: EventInput) async throws -> CalendarEvent {
        let write = EventWrite(
            familyId: nil, title: input.title, description: input.description,
            startDate: input.startDate, endDate: input.endDate, startTime: input.startTime, endTime: input.endTime,
            allDay: input.allDay, location: input.location, category: input.category.rawValue,
            createdBy: nil, lastModifiedBy: modifiedBy
        )
        return try await client.from("calendar_events")
            .update(write)
            .eq("id", value: id)
            .select()
            .single()
            .execute()
            .value
    }

    func deleteEvent(id: UUID) async throws {
        try await client.from("calendar_events").delete().eq("id", value: id).execute()
    }
}
