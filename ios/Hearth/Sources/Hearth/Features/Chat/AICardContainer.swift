import SwiftUI

/// Shared chrome for every inline AI card (brief §12) — the interaction is
/// meant to feel like part of the conversation, not a separate workflow,
/// so all four card types (suggestion, update, clarification, confirmed)
/// share one consistent, calm visual language.
struct AICardContainer<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.accentColor.opacity(0.22))
        )
        .padding(.vertical, 2)
    }
}

/// The shared "resolved" body — used by every card once it settles into
/// its final state (Added / Updated / Ignored).
struct ResolvedCardBody: View {
    let icon: String
    let headline: String
    let title: String
    let subtitle: String
    var onViewEvent: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.title3)
            VStack(alignment: .leading, spacing: 4) {
                Text(headline).font(.subheadline.weight(.semibold))
                Text("\(icon) \(title)").font(.subheadline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
                if let onViewEvent {
                    Button("View Event", action: onViewEvent)
                        .font(.caption.weight(.semibold))
                        .padding(.top, 2)
                }
            }
        }
    }
}
