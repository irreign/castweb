import SwiftUI

/// Static, but the copy is load-bearing — this is where the product
/// states its privacy commitments plainly (docs/07-security-model.md §7.1/§7.4).
struct PrivacyView: View {
    var body: some View {
        Form {
            Section("What the AI sees") {
                Text("When you send a message, Hearth's backend sends only that message, a short window of recent conversation, and your family's upcoming calendar events to Claude to check for calendar-worthy information. Nothing is sent from this device directly — API keys never leave Hearth's servers.")
                    .font(.subheadline)
            }
            Section("What we don't do") {
                Label("No public profiles or discovery", systemImage: "eye.slash")
                Label("No advertising", systemImage: "megaphone.slash")
                Label("Your family's data is never sold", systemImage: "hand.raised")
            }
            Section("Your family space") {
                Text("Only people you've invited can see this family's messages and calendar. Row-level security on the backend enforces this on every request, not just in the app's UI.")
                    .font(.subheadline)
            }
        }
        .navigationTitle("Privacy & Data")
        .navigationBarTitleDisplayMode(.inline)
    }
}
