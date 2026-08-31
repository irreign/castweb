import Foundation

/// Owns one conversation's message list, optimistic sends, the Realtime
/// subscription, and AI-card resolution. Views only bind to `@Published`
/// state and call the intent methods below (brief §5 "optimistic UI",
/// docs/06 §6.7, docs/02 §2.2/§2.7).
@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [Message] = []
    @Published private(set) var pendingMessages: [PendingMessage] = []
    @Published var draft = ""
    @Published var replyingTo: Message?
    @Published private(set) var isLoadingHistory = false
    @Published private(set) var hasMoreHistory = true
    @Published var errorMessage: String?

    let conversation: Conversation
    let familyId: UUID
    let currentUserId: UUID

    private let chatService: ChatService
    private let aiService: AIService
    private var subscriptionTask: Task<Void, Never>?

    init(
        conversation: Conversation, familyId: UUID, currentUserId: UUID,
        chatService: ChatService = ChatService(), aiService: AIService = AIService()
    ) {
        self.conversation = conversation
        self.familyId = familyId
        self.currentUserId = currentUserId
        self.chatService = chatService
        self.aiService = aiService
    }

    func start() async {
        await loadInitial()
        subscribe()
    }

    func stop() {
        subscriptionTask?.cancel()
        subscriptionTask = nil
    }

    private func loadInitial() async {
        isLoadingHistory = true
        defer { isLoadingHistory = false }
        do {
            let page = try await chatService.fetchMessages(conversationId: conversation.id)
            messages = page
            hasMoreHistory = page.count >= 30
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Called from the list's `.onAppear` on its topmost row (brief §5
    /// pagination).
    func loadMoreHistoryIfNeeded(visibleTopMessageId: Message.ID) async {
        guard hasMoreHistory, !isLoadingHistory, messages.first?.id == visibleTopMessageId, let oldest = messages.first else {
            return
        }
        isLoadingHistory = true
        defer { isLoadingHistory = false }
        do {
            let older = try await chatService.fetchMessages(conversationId: conversation.id, before: oldest.createdAt)
            hasMoreHistory = older.count >= 30
            messages.insert(contentsOf: older, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func subscribe() {
        subscriptionTask = Task { [weak self] in
            guard let self else { return }
            for await message in chatService.subscribeToMessages(conversationId: conversation.id) {
                self.handleIncoming(message)
            }
        }
    }

    private func handleIncoming(_ message: Message) {
        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        } else {
            messages.append(message)
            messages.sort { $0.createdAt < $1.createdAt }
        }
        if let clientId = message.clientId {
            pendingMessages.removeAll { $0.clientId == clientId }
        }
    }

    func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let pending = PendingMessage(
            clientId: UUID(), conversationId: conversation.id, familyId: familyId, senderId: currentUserId,
            body: trimmed, replyToMessageId: replyingTo?.id, createdAt: Date()
        )
        pendingMessages.append(pending)
        draft = ""
        replyingTo = nil
        Haptics.lightTap()

        Task {
            do {
                _ = try await chatService.send(pending: pending)
                // The Realtime subscription delivers the confirmed row and
                // clears the matching optimistic bubble (docs/08 §8.4:
                // client_id makes a retried send idempotent, not duplicated).
                if Self.looksLikeAssistantQuestion(trimmed) {
                    try? await aiService.ask(conversationId: self.conversation.id, question: trimmed)
                }
            } catch {
                markPendingFailed(pending.id)
            }
        }
    }

    func retry(_ pending: PendingMessage) {
        guard let index = pendingMessages.firstIndex(where: { $0.id == pending.id }) else { return }
        pendingMessages[index].failed = false
        Task {
            do {
                _ = try await chatService.send(pending: pending)
            } catch {
                markPendingFailed(pending.id)
            }
        }
    }

    private func markPendingFailed(_ id: PendingMessage.ID) {
        guard let index = pendingMessages.firstIndex(where: { $0.id == id }) else { return }
        pendingMessages[index].failed = true
    }

    func deleteMessage(_ message: Message) {
        Task { try? await chatService.deleteMessage(id: message.id) }
    }

    func editMessage(_ message: Message, newBody: String) {
        Task { try? await chatService.editMessage(id: message.id, newBody: newBody) }
    }

    /// Add / Edit / Update / Ignore on an inline AI card (brief §12).
    func resolveCard(extractionId: UUID, action: AIService.ResolveAction, overrides: AIService.EventOverrides? = nil) {
        Task {
            do {
                _ = try await aiService.resolve(extractionId: extractionId, action: action, overrides: overrides)
                if action != .ignore { Haptics.success() }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Cheap client-side heuristic for "this looks like a question meant
    /// for the assistant" (docs/02 §2.7) — the message is still sent as a
    /// completely normal chat message either way; this only decides
    /// whether to *also* trigger a grounded answer.
    private static func looksLikeAssistantQuestion(_ text: String) -> Bool {
        guard text.hasSuffix("?"), text.count <= 200 else { return false }
        let lowered = text.lowercased()
        let starters = ["what", "when", "who", "where", "which", "how many", "is there", "are we", "do we", "did we", "does"]
        return starters.contains { lowered.hasPrefix($0) }
    }
}
