import Foundation

/// Owns the currently-loaded month of events (brief §11: month, agenda,
/// and day are all views over the same loaded range, not separate fetches).
@MainActor
final class CalendarViewModel: ObservableObject {
    @Published private(set) var events: [CalendarEvent] = []
    @Published var visibleMonth: Date
    @Published var selectedDate: Date
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    let familyId: UUID
    let timeZone: TimeZone
    private let calendarService: CalendarService

    init(familyId: UUID, timeZone: TimeZone, calendarService: CalendarService = CalendarService()) {
        self.familyId = familyId
        self.timeZone = timeZone
        self.calendarService = calendarService
        let today = Date()
        self.visibleMonth = today
        self.selectedDate = today
    }

    func loadCurrentMonth() async {
        await load(monthContaining: visibleMonth)
    }

    func load(monthContaining date: Date) async {
        visibleMonth = date
        isLoading = true
        defer { isLoading = false }
        do {
            let (start, end) = Self.monthRange(containing: date, timeZone: timeZone)
            events = try await calendarService.fetchEvents(familyId: familyId, from: start, to: end)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func goToPreviousMonth() async {
        guard let previous = Calendar.current.date(byAdding: .month, value: -1, to: visibleMonth) else { return }
        await load(monthContaining: previous)
    }

    func goToNextMonth() async {
        guard let next = Calendar.current.date(byAdding: .month, value: 1, to: visibleMonth) else { return }
        await load(monthContaining: next)
    }

    func events(on date: Date) -> [CalendarEvent] {
        let target = CalendarDate.from(date, in: timeZone)
        return events
            .filter { event in
                if let end = event.endDate { return event.startDate <= target && target <= end }
                return event.startDate == target
            }
            .sorted { ($0.startTime ?? ClockTime(hour: 0, minute: 0)) < ($1.startTime ?? ClockTime(hour: 0, minute: 0)) }
    }

    /// Grouped for the agenda list — only dates that actually have events,
    /// in order.
    var groupedUpcomingEvents: [(date: CalendarDate, events: [CalendarEvent])] {
        let today = CalendarDate.today(in: timeZone)
        let upcoming = events.filter { ($0.endDate ?? $0.startDate) >= today }
        let grouped = Dictionary(grouping: upcoming, by: \.startDate)
        return grouped.keys.sorted().map { date in (date: date, events: grouped[date]!.sorted { titleOrder($0, $1) }) }
    }

    private func titleOrder(_ a: CalendarEvent, _ b: CalendarEvent) -> Bool {
        (a.startTime ?? ClockTime(hour: 0, minute: 0)) < (b.startTime ?? ClockTime(hour: 0, minute: 0))
    }

    static func monthRange(containing date: Date, timeZone: TimeZone) -> (CalendarDate, CalendarDate) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let comps = calendar.dateComponents([.year, .month], from: date)
        let year = comps.year ?? 2026
        let month = comps.month ?? 1
        let daysInMonth = calendar.range(of: .day, in: .month, for: date)?.count ?? 30
        return (CalendarDate(year: year, month: month, day: 1), CalendarDate(year: year, month: month, day: daysInMonth))
    }
}
