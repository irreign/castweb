import Foundation

enum DateFormatting {
    static func messageTimestamp(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    static func daySeparator(_ date: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).month(.wide).day())
    }

    static func eventDateLine(_ event: CalendarEvent, timeZone: TimeZone) -> String {
        let dateText = event.startDate.asDate(in: timeZone)
            .formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        guard !event.allDay, let start = event.startTime else { return dateText }
        if let end = event.endTime {
            return "\(dateText) · \(start.formatted())–\(end.formatted())"
        }
        return "\(dateText) · \(start.formatted())"
    }

    static func monthTitle(year: Int, month: Int) -> String {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = 1
        let date = Calendar.current.date(from: components) ?? Date()
        return date.formatted(.dateTime.month(.wide).year())
    }
}
