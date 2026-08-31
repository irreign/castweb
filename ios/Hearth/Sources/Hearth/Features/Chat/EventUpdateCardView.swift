import SwiftUI

/// `card_type == "event_update_suggestion"` — a detected correction to an
/// existing event (brief §23, docs/02 §2.5): "🔄 Update Family Calendar? —
/// Grandma's Birthday Dinner: 24 Oct → 25 Oct".
struct EventUpdateCardView: View {
    let message: Message
    var onUpdate: () -> Void
    var onIgnore: () -> Void
    var onViewEvent: (UUID) -> Void

    private var existingTitle: String { message.metadata["existing_title"]?.stringValue ?? "Event" }
    private var existingDate: String { message.metadata["existing_date"]?.stringValue ?? "" }
    private var newTitle: String { message.metadata["new_title"]?.stringValue ?? existingTitle }
    private var newDate: String { message.metadata["new_date"]?.stringValue ?? "" }
    private var newStartTime: String? { message.metadata["new_start_time"]?.stringValue }
    private var eventId: UUID? { message.metadata["event_id"]?.stringValue.flatMap(UUID.init(uuidString:)) }

    private var newSubtitle: String {
        newStartTime.map { "\(newDate) · \($0)" } ?? newDate
    }

    var body: some View {
        AICardContainer {
            switch message.cardState {
            case .pending:
                Label("Update Family Calendar?", systemImage: "arrow.triangle.2.circlepath")
                    .font(.subheadline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text(newTitle).font(.headline)
                    HStack(spacing: 4) {
                        Text(existingDate).strikethrough().foregroundStyle(.secondary)
                        Image(systemName: "arrow.right").foregroundStyle(.secondary).font(.caption2)
                        Text(newSubtitle).fontWeight(.semibold)
                    }
                    .font(.subheadline)
                }
                HStack(spacing: 8) {
                    Button("Ignore", role: .cancel, action: onIgnore)
                        .buttonStyle(.bordered)
                    Spacer()
                    Button("Update", action: onUpdate)
                        .buttonStyle(.borderedProminent)
                }
            case .resolved:
                ResolvedCardBody(
                    icon: "🔄", headline: "Family Calendar updated",
                    title: newTitle, subtitle: newSubtitle,
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
