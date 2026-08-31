import SwiftUI

/// Docs/02 §2.8: toggling auto-add changes future extraction outcomes
/// from "always show a card" to "auto-create + confirmation-only card"
/// above the threshold — everything below it still asks first regardless.
/// The 0.90–0.99 slider bound mirrors the server-side hard floor in
/// supabase/functions/_shared/extraction.ts; the server clamps again
/// regardless of what's sent, so this bound is a UX courtesy, not the
/// real enforcement.
struct AIBehaviourSettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var autoAddEnabled = false
    @State private var threshold: Double = 0.95
    private let familyService = FamilyService()

    var body: some View {
        Form {
            Section {
                Toggle("Auto-add high-confidence events", isOn: $autoAddEnabled)
            } footer: {
                Text("When off (default), every AI-detected event shows a card for someone to confirm. When on, only events the AI is very confident about are added automatically.")
            }

            if autoAddEnabled {
                Section("Confidence threshold: \(Int((threshold * 100).rounded()))%") {
                    Slider(value: $threshold, in: 0.90...0.99, step: 0.01)
                } footer: {
                    Text("Lower catches more events automatically but risks the occasional wrong one; higher is more conservative.")
                }
            }
        }
        .navigationTitle("AI Behaviour")
        .onAppear {
            autoAddEnabled = appState.family?.settings.autoAddEnabled ?? false
            threshold = appState.family?.settings.autoAddThreshold ?? 0.95
        }
        .onChange(of: autoAddEnabled) { _, _ in save() }
        .onChange(of: threshold) { _, _ in save() }
    }

    private func save() {
        guard let familyId = appState.family?.id else { return }
        let settings = FamilySettings(autoAddEnabled: autoAddEnabled, autoAddThreshold: threshold)
        appState.family?.settings = settings
        Task { try? await familyService.updateSettings(familyId: familyId, settings: settings) }
    }
}
