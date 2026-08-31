import SwiftUI

enum EventEditMode {
    case create(familyId: UUID)
    case edit(CalendarEvent)
}

/// Manual event creation/editing (brief §11) — reuses the same
/// `CalendarService.EventInput` shape the AI-resolution path writes
/// through, so a manually-created event and an AI-confirmed one are
/// indistinguishable in the database except for `ai_generated`.
struct EventEditView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let mode: EventEditMode
    var onSaved: (CalendarEvent?) -> Void

    @State private var title: String
    @State private var eventDescription: String
    @State private var date: Date
    @State private var endDate: Date
    @State private var hasEndDate: Bool
    @State private var time: Date
    @State private var allDay: Bool
    @State private var location: String
    @State private var category: EventCategory
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let calendarService = CalendarService()

    init(mode: EventEditMode, onSaved: @escaping (CalendarEvent?) -> Void) {
        self.mode = mode
        self.onSaved = onSaved
        switch mode {
        case .create:
            _title = State(initialValue: "")
            _eventDescription = State(initialValue: "")
            _date = State(initialValue: Date())
            _endDate = State(initialValue: Date())
            _hasEndDate = State(initialValue: false)
            _time = State(initialValue: Date())
            _allDay = State(initialValue: false)
            _location = State(initialValue: "")
            _category = State(initialValue: .other)
        case .edit(let event):
            _title = State(initialValue: event.title)
            _eventDescription = State(initialValue: event.eventDescription ?? "")
            _date = State(initialValue: event.startDate.asDate(in: .current))
            _endDate = State(initialValue: (event.endDate ?? event.startDate).asDate(in: .current))
            _hasEndDate = State(initialValue: event.endDate != nil)
            _time = State(initialValue: event.startTime.map { clock in
                Calendar.current.date(bySettingHour: clock.hour, minute: clock.minute, second: 0, of: Date()) ?? Date()
            } ?? Date())
            _allDay = State(initialValue: event.allDay)
            _location = State(initialValue: event.location ?? "")
            _category = State(initialValue: event.category)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Event") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $eventDescription, axis: .vertical)
                    Picker("Category", selection: $category) {
                        ForEach(EventCategory.allCases) { c in
                            Text("\(c.emoji) \(c.displayName)").tag(c)
                        }
                    }
                }
                Section("When") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    Toggle("All day", isOn: $allDay)
                    if !allDay {
                        DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                    }
                    Toggle("Ends on a different day", isOn: $hasEndDate)
                    if hasEndDate {
                        DatePicker("End date", selection: $endDate, displayedComponents: .date)
                    }
                }
                Section("Location") {
                    TextField("Optional", text: $location)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle(isCreate ? "New Event" : "Edit Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
    }

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let calendar = Calendar.current
        let input = CalendarService.EventInput(
            title: title,
            description: eventDescription.isEmpty ? nil : eventDescription,
            startDate: .from(date, in: .current),
            endDate: hasEndDate ? .from(endDate, in: .current) : nil,
            startTime: allDay ? nil : ClockTime(
                hour: calendar.component(.hour, from: time), minute: calendar.component(.minute, from: time)
            ),
            endTime: nil,
            allDay: allDay,
            location: location.isEmpty ? nil : location,
            category: category
        )

        do {
            switch mode {
            case .create(let familyId):
                guard let userId = appState.currentUser?.id else { return }
                let created = try await calendarService.createEvent(familyId: familyId, createdBy: userId, input: input)
                onSaved(created)
            case .edit(let event):
                guard let userId = appState.currentUser?.id else { return }
                let updated = try await calendarService.updateEvent(id: event.id, modifiedBy: userId, input: input)
                onSaved(updated)
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
