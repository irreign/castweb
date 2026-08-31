import Foundation

/// Mirrors `public.messages`. `attachments` (reserved for future image
/// support, brief §5/§30) is intentionally not modeled — it's unused by
/// every V1 code path and Codable ignores the extra JSON key.
struct Message: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let conversationId: UUID
    let familyId: UUID
    var senderId: UUID?
    var kind: MessageKind
    var clientId: UUID?
    var body: String?
    var replyToMessageId: UUID?
    var metadata: [String: JSONValue]
    var editedAt: Date?
    var deletedAt: Date?
    let createdAt: Date
    var updatedAt: Date

    static func == (lhs: Message, rhs: Message) -> Bool {
        lhs.id == rhs.id && lhs.updatedAt == rhs.updatedAt
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    var isDeleted: Bool { deletedAt != nil }
    var isEdited: Bool { editedAt != nil }

    var cardType: CardType? {
        metadata["card_type"]?.stringValue.flatMap(CardType.init(rawValue:))
    }

    var cardState: CardState {
        metadata["card_state"]?.stringValue.flatMap(CardState.init(rawValue:)) ?? .pending
    }

    var extractionId: UUID? {
        metadata["extraction_id"]?.stringValue.flatMap(UUID.init(uuidString:))
    }
}

/// A locally-composed, not-yet-confirmed message — used to render an
/// optimistic bubble immediately on send (brief §5 "Optimistic UI").
struct PendingMessage: Identifiable, Sendable {
    let clientId: UUID
    let conversationId: UUID
    let familyId: UUID
    let senderId: UUID
    let body: String
    let replyToMessageId: UUID?
    let createdAt: Date
    var failed: Bool = false

    var id: UUID { clientId }
}
