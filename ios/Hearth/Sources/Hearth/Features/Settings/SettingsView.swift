import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = appState.currentUser {
                        LabeledContent("Name", value: user.displayName)
                    }
                    if let role = appState.membership?.role {
                        LabeledContent("Role", value: role.rawValue.capitalized)
                    }
                    Button("Sign out", role: .destructive) {
                        Task { await appState.signOut() }
                    }
                }

                Section {
                    NavigationLink("Notifications") { NotificationSettingsView() }
                    NavigationLink("AI Behaviour") { AIBehaviourSettingsView() }
                    NavigationLink("Calendar Preferences") { CalendarPreferencesView() }
                    NavigationLink("Privacy & Data") { PrivacyView() }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
