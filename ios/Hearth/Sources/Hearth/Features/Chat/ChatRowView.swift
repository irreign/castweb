import SwiftUI

/// Dispatches one `ChatDisplayItem` to the right view — a plain bubble, an
/// optimistic pending bubble, a day separator, or one of the four AI card
/// types (brief §12).
struct ChatRowView: View {
    let item: ChatDisplayItem
    @ObservedObject var viewModel: ChatViewModel
    @EnvironmentObject private var appState: AppState
    let senderNames: [UUID: String]
    let messagesById: [UUID: Message]
    @Binding var editingSuggestion: EditingSuggestionContext?

    var body: some View {
        switch item.kind {
        case .daySeparator(let date):
            DaySeparatorView(date: date)
        case .pending(let pending):
            PendingMessageBubbleView(pending: pending) { viewModel.retry(pending) }
        case .message(let message):
            messageView(message)
        }
    }

    @ViewBuilder
    private func messageView(_ message: Message) -> some View {
        if message.kind == .system, let cardType = message.cardType {
            cardView(message, cardType: cardType)
        } else {
            let isMine = message.senderId == viewModel.currentUserId
            let name = message.kind == .assistant
                ? "Hearth"
                : (message.senderId.flatMap { senderNames[$0] } ?? "Family member")
            MessageBubbleView(
                message: message, isMine: isMine, senderName: name,
                quotedMessage: message.replyToMessageId.flatMap { messagesById[$0] },
                onReply: { viewModel.replyingTo = message },
                onDelete: { viewModel.deleteMessage(message) },
                canDelete: isMine
            )
        }
    }

    @ViewBuilder
    private func cardView(_ message: Message, cardType: CardType) -> some View {
        guard let extractionId = message.extractionId else {
            EmptyView()
            return
        }
        switch cardType {
        case .eventSuggestion:
            EventSuggestionCardView(
                message: message,
                onAdd: { viewModel.resolveCard(extractionId: extractionId, action: .add) },
                onIgnore: { viewModel.resolveCard(extractionId: extractionId, action: .ignore) },
                onEdit: { editingSuggestion = .from(message: message) },
                onViewEvent: { id in appState.navigateToEventId = id }
            )
        case .eventUpdateSuggestion:
            EventUpdateCardView(
                message: message,
                onUpdate: { viewModel.resolveCard(extractionId: extractionId, action: .update) },
                onIgnore: { viewModel.resolveCard(extractionId: extractionId, action: .ignore) },
                onViewEvent: { id in appState.navigateToEventId = id }
            )
        case .eventClarification:
            EventClarificationCardView(
                message: message,
                onIgnore: { viewModel.resolveCard(extractionId: extractionId, action: .ignore) },
                onEdit: { editingSuggestion = .from(message: message) }
            )
        case .eventConfirmed:
            EventConfirmedCardView(message: message, onViewEvent: { id in appState.navigateToEventId = id })
        }
    }
}
