import Foundation
import Supabase

/// Chat reads/writes and the Realtime subscription for one conversation.
/// Note on the Realtime API: this targets supabase-swift v2's
/// `realtimeV2`/`postgresChange` surface as documented at the time of
/// writing — verify the exact case/method names against the pinned SDK
/// version (docs/09-development-plan.md "known issues").
@MainActor
final class ChatService {
    private let client: SupabaseClient
    private let decoder: JSONDecoder
    private let pageSize = 30

    init(client: SupabaseClient = SupabaseManager.shared.client) {
        self.client = client
        self.decoder = SupabaseManager.shared.decoder
    }

    /// Most recent page, oldest-first for display. Pass `before` (the
    /// oldest currently-loaded message's `createdAt`) to page further back.
    func fetchMessages(conversationId: UUID, before: Date? = nil) async throws -> [Message] {
        var query = client.from("messages")
            .select()
            .eq("conversation_id", value: conversationId)
            .order("created_at", ascending: false)
            .limit(pageSize)
        if let before {
            query = query.lt("created_at", value: before)
        }
        let messages: [Message] = try await query.execute().value
        return messages.reversed()
    }

    private struct MessageInsert: Encodable {
        let conversationId: UUID
        let familyId: UUID
        let senderId: UUID
        let clientId: UUID
        let kind: String
        let body: String
        let replyToMessageId: UUID?
    }

    /// Sends a message. The caller renders a `PendingMessage` bubble
    /// immediately (optimistic UI, brief §5) before this resolves;
    /// `clientId` lets a retried send upsert instead of duplicating
    /// (docs/08 §8.4 — `messages.client_id` is unique per sender).
    func send(pending: PendingMessage) async throws -> Message {
        let insert = MessageInsert(
            conversationId: pending.conversationId,
            familyId: pending.familyId,
            senderId: pending.senderId,
            clientId: pending.clientId,
            kind: MessageKind.user.rawValue,
            body: pending.body,
            replyToMessageId: pending.replyToMessageId
        )
        return try await client.from("messages")
            .insert(insert, returning: .representation)
            .single()
            .execute()
            .value
    }

    func editMessage(id: UUID, newBody: String) async throws {
        struct Update: Encodable { let body: String; let editedAt: Date }
        try await client.from("messages")
            .update(Update(body: newBody, editedAt: Date()))
            .eq("id", value: id)
            .execute()
    }

    /// Soft delete (docs/05 §5.2) — keeps the row (and any AI provenance
    /// pointing at it) intact, the client hides its content once
    /// `deletedAt != nil`.
    func deleteMessage(id: UUID) async throws {
        struct Update: Encodable { let deletedAt: Date }
        try await client.from("messages")
            .update(Update(deletedAt: Date()))
            .eq("id", value: id)
            .execute()
    }

    /// Streams every insert/update to this conversation's messages —
    /// covers new messages arriving, edits, soft-deletes, and an AI card
    /// flipping state in place (docs/06 §6.7, brief §12).
    func subscribeToMessages(conversationId: UUID) -> AsyncStream<Message> {
        AsyncStream { continuation in
            let task = Task {
                let channel = client.realtimeV2.channel("messages-\(conversationId.uuidString)")
                let changes = channel.postgresChange(
                    AnyAction.self,
                    schema: "public",
                    table: "messages",
                    filter: "conversation_id=eq.\(conversationId.uuidString)"
                )
                await channel.subscribe()

                for await change in changes {
                    guard let record = change.record, let message = try? decoder.decodeJSONObject(record, as: Message.self) else {
                        continue
                    }
                    continuation.yield(message)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

private extension JSONDecoder {
    /// Realtime delivers each change as a `[String: AnyJSON]`-ish record
    /// rather than raw `Data` — re-serialize then decode through the same
    /// configured decoder so date/key handling stays identical to
    /// PostgREST responses.
    func decodeJSONObject<T: Decodable>(_ object: some Encodable, as type: T.Type) throws -> T {
        let data = try JSONEncoder().encode(object)
        return try self.decode(T.self, from: data)
    }
}
