import SwiftUI

/// The family's timezone drives every relative-date resolution in chat
/// (docs/06 §6.8) — deliberately owner-only to change, since it silently
/// shifts how future messages get interpreted for the whole family.
struct CalendarPreferencesView: View {
    @EnvironmentObject private var appState: AppState
    @State private var timezone: String = TimeZone.current.identifier

    private var canEdit: Bool { appState.membership?.role == .owner }

    var body: some View {
        Form {
            Section {
                if canEdit {
                    Picker("Timezone", selection: $timezone) {
                        ForEach(TimeZone.knownTimeZoneIdentifiers.sorted(), id: \.self) { identifier in
                            Text(identifier).tag(identifier)
                        }
                    }
                } else {
                    LabeledContent("Timezone", value: timezone)
                }
            } footer: {
                Text("Every date your family mentions in chat — \"tomorrow\", \"next Monday\" — is resolved against this timezone. Only the family owner can change it.")
            }
        }
        .navigationTitle("Calendar Preferences")
        .onAppear { timezone = appState.family?.timezone ?? TimeZone.current.identifier }
        .onChange(of: timezone) { _, newValue in
            guard canEdit, newValue != appState.family?.timezone else { return }
            save(newValue)
        }
    }

    private func save(_ newValue: String) {
        guard let familyId = appState.family?.id else { return }
        appState.family?.timezone = newValue
        Task {
            struct Update: Encodable { let timezone: String }
            try? await SupabaseManager.shared.client
                .from("families")
                .update(Update(timezone: newValue))
                .eq("id", value: familyId)
                .execute()
        }
    }
}
