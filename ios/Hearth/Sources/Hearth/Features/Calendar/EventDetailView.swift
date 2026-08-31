import SwiftUI

/// The "Created from chat" → jump-to-message link required by brief §10:
/// every AI-generated event is traceable back to the message that caused
/// it (docs/02 §2.2 step 6).
struct EventDetailView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State var event: CalendarEvent
    var onChanged: () -> Void

    @State private var isEditing = false
    @State private var isConfirmingDelete = false
    @State private var sourceMessage: Message?

    private let calendarService = CalendarService()

    private var canEdit: Bool {
        guard let role = appState.membership?.role else { return false }
        return Permissions.canEditCalendar(role: role)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Text(event.category.emoji).font(.largeTitle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title).font(.title3.weight(.semibold))
                            Text(DateFormatting.eventDateLine(event, timeZone: appState.family?.timeZone ?? .current))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                if let description = event.eventDescription, !description.isEmpty {
                    Section("Details") { Text(description) }
                }

                if let location = event.location, !location.isEmpty {
                    Section("Location") { Label(location, systemImage: "mappin.and.ellipse") }
                }

                if event.isCreatedFromChat {
                    Section("Created from chat") {
                        if let sourceMessage {
                            Button {
                                appState.navigateToMessageId = sourceMessage.id
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(sourceMessage.body ?? "").lineLimit(2).foregroundStyle(.primary)
                                    Label("Jump to message", systemImage: "arrow.up.right.circle")
                                        .font(.caption)
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                        } else {
                            ProgressView()
                        }
                        if let confidence = event.aiConfidence {
                            Text("AI confidence: \(Int((confidence * 100).rounded()))%")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if canEdit {
                    Section {
                        Button("Edit Event") { isEditing = true }
                        Button("Delete Event", role: .destructive) { isConfirmingDelete = true }
                    }
                }
            }
            .navigationTitle("Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                sourceMessage = try? await calendarService.fetchSourceMessage(for: event)
            }
            .sheet(isPresented: $isEditing) {
                EventEditView(mode: .edit(event)) { updated in
                    if let updated { event = updated }
                    onChanged()
                }
            }
            .alert("Delete this event?", isPresented: $isConfirmingDelete) {
                Button("Delete", role: .destructive) {
                    Task {
                        try? await calendarService.deleteEvent(id: event.id)
                        onChanged()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This can't be undone.")
            }
        }
    }
}
