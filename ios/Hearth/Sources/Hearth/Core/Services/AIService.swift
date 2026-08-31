import Foundation
import Supabase

/// Resolving AI suggestion/update/clarification cards, and asking the
/// family assistant a question (brief §12-§13).
@MainActor
final class AIService {
    private let client: SupabaseClient
    init(client: SupabaseClient = SupabaseManager.shared.client) { self.client = client }

    enum ResolveAction: String {
        case add, edit, update, ignore
    }

    /// Only populated (and only read server-side) when `action == .edit` —
    /// docs/08 §8.2.
    struct EventOverrides: Encodable {
        var title: String?
        var date: String?
        var endDate: String?
        var startTime: String?
        var endTime: String?
        var allDay: Bool?
        var location: String?
        var category: String?
        var recurrence: String?

        enum CodingKeys: String, CodingKey {
            case title, date
            case endDate = "end_date"
            case startTime = "start_time"
            case endTime = "end_time"
            case allDay = "all_day"
            case location, category, recurrence
        }
    }

    private struct ResolveParams: Encodable {
        let extractionId: UUID
        let action: String
        let overrides: EventOverrides?
        enum CodingKeys: String, CodingKey {
            case extractionId = "_extraction_id", action = "_action", overrides = "_overrides"
        }
    }

    /// Resolves a pending card. Calls the `resolve_ai_extraction` Postgres
    /// RPC directly (docs/08 §8.2) — atomic, idempotent by extraction id,
    /// and enforces the caller's role server-side regardless of what the
    /// UI already gated. Returns the resulting event, or `nil` for `.ignore`.
    @discardableResult
    func resolve(extractionId: UUID, action: ResolveAction, overrides: EventOverrides? = nil) async throws -> CalendarEvent? {
        try await client
            .rpc("resolve_ai_extraction", params: ResolveParams(extractionId: extractionId, action: action.rawValue, overrides: overrides))
            .execute()
            .value
    }

    struct AskResponse: Decodable {
        let message: Message
    }

    /// Asks the family assistant a natural-language question (brief §13).
    /// The answer is also delivered to every device via the normal
    /// message Realtime subscription — this return value just avoids a
    /// round trip for the asker's own optimistic UI.
    func ask(conversationId: UUID, question: String) async throws -> Message {
        struct Body: Encodable {
            let conversationId: UUID
            let question: String
            enum CodingKeys: String, CodingKey { case conversationId = "conversation_id", question }
        }
        let response: AskResponse = try await EdgeFunctions.invoke(
            client, name: "ai-assistant", body: Body(conversationId: conversationId, question: question)
        )
        return response.message
    }
}
