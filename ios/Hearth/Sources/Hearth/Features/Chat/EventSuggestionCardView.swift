import SwiftUI

/// Renders `messages.metadata` for `card_type == "event_suggestion"`
/// (written by ai-extract's `suggestion`/`auto_add` branches — docs/06
/// §6.1). Brief §1/§12 exact UX: "📅 I found a calendar event … Add | Edit
/// | Ignore", flipping in place to "✓ Added to Family Calendar" once
/// resolved, for every device (docs/06 §6.7).
struct EventSuggestionCardView: View {
    let message: Message
    var onAdd: () -> Void
    var onIgnore: () -> Void
    var onEdit: () -> Void
    var onViewEvent: (UUID) -> Void

    private var title: String { message.metadata["title"]?.stringValue ?? "Event" }
    private var dateText: String { message.metadata["date"]?.stringValue ?? "" }
    private var startTime: String? { message.metadata["start_time"]?.stringValue }
    private var allDay: Bool { message.metadata["all_day"]?.boolValue ?? false }
    private var category: EventCategory {
        message.metadata["category"]?.stringValue.flatMap(EventCategory.init(rawValue:)) ?? .other
    }
    private var eventId: UUID? { message.metadata["event_id"]?.stringValue.flatMap(UUID.init(uuidString:)) }

    private var subtitle: String {
        allDay || startTime == nil ? dateText : "\(dateText) · \(startTime!)"
    }

    var body: some View {
        AICardContainer {
            switch message.cardState {
            case .pending:
                Label("Calendar event found", systemImage: "calendar.badge.plus")
                    .font(.subheadline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(category.emoji) \(title)").font(.headline)
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
                HStack(spacing: 8) {
                    Button("Ignore", role: .cancel, action: onIgnore)
                        .buttonStyle(.bordered)
                    Button("Edit", action: onEdit)
                        .buttonStyle(.bordered)
                    Spacer()
                    Button("Add", action: onAdd)
                        .buttonStyle(.borderedProminent)
                }
            case .resolved:
                ResolvedCardBody(
                    icon: category.emoji, headline: "Added to Family Calendar",
                    title: title, subtitle: subtitle,
                    onViewEvent: eventId.map { id in { onViewEvent(id) } }
                )
            case .ignored:
                Label("Ignored", systemImage: "xmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
