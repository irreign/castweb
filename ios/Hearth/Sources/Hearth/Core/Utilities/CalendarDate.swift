import Foundation

/// A plain calendar date with no time-of-day/timezone component — mirrors
/// a Postgres `date` column, which PostgREST serializes as "YYYY-MM-DD".
/// Deliberately distinct from `Date`/`timestamptz` fields: conflating the
/// two is exactly the class of bug that produces off-by-one-day errors
/// across timezones, which docs/06 §6.8's date-resolution design exists
/// to avoid on the backend — the client shouldn't reintroduce it.
struct CalendarDate: Codable, Hashable, Comparable, CustomStringConvertible, Sendable {
    let year: Int
    let month: Int
    let day: Int

    var description: String { String(format: "%04d-%02d-%02d", year, month, day) }

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    init?(isoString: String) {
        let parts = isoString.split(separator: "-")
        guard parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        self.init(year: y, month: m, day: d)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let parsed = CalendarDate(isoString: raw) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "invalid date: \(raw)")
        }
        self = parsed
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

    static func < (lhs: CalendarDate, rhs: CalendarDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    static func today(in timeZone: TimeZone) -> CalendarDate {
        from(Date(), in: timeZone)
    }

    static func from(_ date: Date, in timeZone: TimeZone) -> CalendarDate {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let comps = calendar.dateComponents([.year, .month, .day], from: date)
        return CalendarDate(year: comps.year ?? 1970, month: comps.month ?? 1, day: comps.day ?? 1)
    }

    /// A `Date` at local midnight in the given timezone — for feeding
    /// SwiftUI's Calendar-driven components, never for arithmetic that
    /// needs to cross timezones (do that on calendar day components instead).
    func asDate(in timeZone: TimeZone) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
    }
}

/// Mirrors a Postgres `time` column ("HH:MM:SS" over the wire).
struct ClockTime: Codable, Hashable, Comparable, CustomStringConvertible, Sendable {
    let hour: Int
    let minute: Int

    var description: String { String(format: "%02d:%02d", hour, minute) }

    init(hour: Int, minute: Int) {
        self.hour = hour
        self.minute = minute
    }

    init?(isoString: String) {
        let parts = isoString.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        self.init(hour: h, minute: m)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let parsed = ClockTime(isoString: raw) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "invalid time: \(raw)")
        }
        self = parsed
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description + ":00")
    }

    static func < (lhs: ClockTime, rhs: ClockTime) -> Bool { (lhs.hour, lhs.minute) < (rhs.hour, rhs.minute) }

    func formatted() -> String {
        let date = Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
        return date.formatted(date: .omitted, time: .shortened)
    }
}
