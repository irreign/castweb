import SwiftUI

/// `card_type == "event_clarification"` — the AI couldn't confidently
/// resolve enough to suggest an event outright, so it asks instead of
/// guessing (brief §9, docs/02 §2.4).
struct EventClarificationCardView: View {
    let message: Message
    var onIgnore: () -> Void
    var onEdit: () -> Void

    private var question: String {
        message.metadata["question"]?.stringValue ?? "Can you confirm the date and time for this?"
    }

    var body: some View {
        AICardContainer {
            switch message.cardState {
            case .pending:
                Label("Quick question", systemImage: "questionmark.circle")
                    .font(.subheadline.weight(.semibold))
                Text(question).font(.subheadline)
                HStack(spacing: 8) {
                    Button("Ignore", role: .cancel, action: onIgnore)
                        .buttonStyle(.bordered)
                    Spacer()
                    Button("Add details", action: onEdit)
                        .buttonStyle(.borderedProminent)
                }
            case .resolved:
                Label("Added to Family Calendar", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.subheadline)
            case .ignored:
                Label("Ignored", systemImage: "xmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// `card_type == "event_confirmed"` — the auto-add path (docs/06 §6.3):
/// the family opted into automatic creation above their configured
/// threshold, so this card renders already-resolved from the moment it
/// arrives (brief §1 "📅 Added to Family Calendar").
struct EventConfirmedCardView: View {
    let message: Message
    var onViewEvent: (UUID) -> Void

    private var title: String { message.metadata["title"]?.stringValue ?? "Event" }
    private var dateText: String { message.metadata["start_date"]?.stringValue ?? "" }
    private var startTime: String? { message.metadata["start_time"]?.stringValue }
    private var eventId: UUID? { message.metadata["event_id"]?.stringValue.flatMap(UUID.init(uuidString:)) }

    private var subtitle: String {
        startTime.map { "\(dateText) · \($0)" } ?? dateText
    }

    var body: some View {
        AICardContainer {
            ResolvedCardBody(
                icon: "📅", headline: "Added to Family Calendar",
                title: title, subtitle: subtitle,
                onViewEvent: eventId.map { id in { onViewEvent(id) } }
            )
        }
    }
}
