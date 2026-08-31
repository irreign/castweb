import SwiftUI

/// Backing state for the "Edit" sheet, opened from an
/// EventSuggestionCardView / EventClarificationCardView. Pre-filled from
/// whatever the AI already extracted (title/date/time/location/category)
/// so editing means "correcting a few fields", not starting from scratch.
struct EditingSuggestionContext: Identifiable {
    let id = UUID()
    let extractionId: UUID
    var title: String
    var date: Date
    var time: Date
    var allDay: Bool
    var location: String
    var category: EventCategory
}

extension EditingSuggestionContext {
    static func from(message: Message) -> EditingSuggestionContext {
        guard let extractionId = message.extractionId else {
            preconditionFailure("EditSuggestedEventView requires a card message with an extraction_id")
        }
        let title = message.metadata["title"]?.stringValue ?? message.metadata["new_title"]?.stringValue ?? ""
        let dateString = message.metadata["date"]?.stringValue ?? message.metadata["new_date"]?.stringValue
        let date = dateString.flatMap { CalendarDate(isoString: $0)?.asDate(in: .current) } ?? Date()
        let allDay = message.metadata["all_day"]?.boolValue ?? false
        let timeString = message.metadata["start_time"]?.stringValue ?? message.metadata["new_start_time"]?.stringValue
        let time = timeString.flatMap(ClockTime.init(isoString:)).map { clock in
            Calendar.current.date(bySettingHour: clock.hour, minute: clock.minute, second: 0, of: Date()) ?? Date()
        } ?? Date()
        let location = message.metadata["location"]?.stringValue ?? ""
        let category = message.metadata["category"]?.stringValue.flatMap(EventCategory.init(rawValue:)) ?? .other

        return EditingSuggestionContext(
            extractionId: extractionId, title: title, date: date, time: time,
            allDay: allDay, location: location, category: category
        )
    }
}

struct EditSuggestedEventView: View {
    @Environment(\.dismiss) private var dismiss
    @State var context: EditingSuggestionContext
    var onSave: (AIService.EventOverrides) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Event") {
                    TextField("Title", text: $context.title)
                    Picker("Category", selection: $context.category) {
                        ForEach(EventCategory.allCases) { category in
                            Text("\(category.emoji) \(category.displayName)").tag(category)
                        }
                    }
                }
                Section("When") {
                    DatePicker("Date", selection: $context.date, displayedComponents: .date)
                    Toggle("All day", isOn: $context.allDay)
                    if !context.allDay {
                        DatePicker("Time", selection: $context.time, displayedComponents: .hourAndMinute)
                    }
                }
                Section("Location") {
                    TextField("Optional", text: $context.location)
                }
            }
            .navigationTitle("Edit Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(overrides)
                        dismiss()
                    }
                    .disabled(context.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var overrides: AIService.EventOverrides {
        let calendar = Calendar.current
        let dateComponents = calendar.dateComponents([.year, .month, .day], from: context.date)
        let dateString = String(
            format: "%04d-%02d-%02d",
            dateComponents.year ?? 1970, dateComponents.month ?? 1, dateComponents.day ?? 1
        )

        var startTimeString: String?
        if !context.allDay {
            let timeComponents = calendar.dateComponents([.hour, .minute], from: context.time)
            startTimeString = String(format: "%02d:%02d", timeComponents.hour ?? 0, timeComponents.minute ?? 0)
        }

        return AIService.EventOverrides(
            title: context.title,
            date: dateString,
            endDate: nil,
            startTime: startTimeString,
            endTime: nil,
            allDay: context.allDay,
            location: context.location.isEmpty ? nil : context.location,
            category: context.category.rawValue,
            recurrence: nil
        )
    }
}
