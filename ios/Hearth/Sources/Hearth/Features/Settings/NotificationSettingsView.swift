import SwiftUI

/// Per-category push notification toggles (brief §15 — "do not spam users
/// with AI notifications", so `clarificationNeeded` is toggle-able just
/// like every other category, not force-on).
struct NotificationSettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var preferences: NotificationPreferences?
    @State private var isLoading = true
    private let notificationService = NotificationService()

    var body: some View {
        Form {
            if let preferences {
                ForEach(NotificationCategory.allCases, id: \.self) { category in
                    Toggle(category.displayName, isOn: binding(for: category, current: preferences))
                }
            } else if isLoading {
                ProgressView()
            }
        }
        .navigationTitle("Notifications")
        .task { await load() }
    }

    private func binding(for category: NotificationCategory, current: NotificationPreferences) -> Binding<Bool> {
        Binding(
            get: { preferences?.value(for: category) ?? true },
            set: { update(category: category, value: $0) }
        )
    }

    private func load() async {
        guard let userId = appState.currentUser?.id, let familyId = appState.family?.id else { return }
        isLoading = true
        defer { isLoading = false }
        preferences = try? await notificationService.fetchPreferences(userId: userId, familyId: familyId)
    }

    private func update(category: NotificationCategory, value: Bool) {
        guard var updated = preferences else { return }
        switch category {
        case .newMessage: updated.newMessage = value
        case .eventAdded: updated.eventAdded = value
        case .eventUpcoming: updated.eventUpcoming = value
        case .eventChanged: updated.eventChanged = value
        case .clarificationNeeded: updated.clarificationNeeded = value
        }
        preferences = updated
        Task { try? await notificationService.updatePreferences(updated) }
    }
}
