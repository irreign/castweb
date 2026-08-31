import SwiftUI

/// Month grid with a day tapped showing that day's events inline below —
/// covers both "month view" and "day view if useful" (brief §11) without
/// a separate screen, since a tap-to-expand day is the more familiar
/// interaction pattern.
struct MonthCalendarView: View {
    @ObservedObject var viewModel: CalendarViewModel
    var onSelectEvent: (CalendarEvent) -> Void

    private let columns = Array(repeating: GridItem(.flexible()), count: 7)

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                monthHeader
                weekdayHeader

                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(daysInGrid, id: \.self) { day in
                        DayCell(
                            date: day,
                            isInCurrentMonth: isInVisibleMonth(day),
                            isSelected: Calendar.current.isDate(day, inSameDayAs: viewModel.selectedDate),
                            eventCount: viewModel.events(on: day).count
                        )
                        .onTapGesture {
                            Haptics.selectionChanged()
                            viewModel.selectedDate = day
                        }
                    }
                }
                .padding(.horizontal)

                Divider().padding(.horizontal)

                selectedDaySection
            }
            .padding(.bottom, 24)
        }
        .overlay {
            if viewModel.isLoading { ProgressView() }
        }
    }

    private var monthHeader: some View {
        HStack {
            Button { Task { await viewModel.goToPreviousMonth() } } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(viewModel.visibleMonth.formatted(.dateTime.month(.wide).year()))
                .font(.title3.weight(.semibold))
            Spacer()
            Button { Task { await viewModel.goToNextMonth() } } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding(.horizontal)
    }

    private var weekdayHeader: some View {
        HStack {
            ForEach(Calendar.current.veryShortWeekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal)
    }

    private var selectedDaySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(viewModel.selectedDate.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .font(.headline)
                .padding(.horizontal)

            let dayEvents = viewModel.events(on: viewModel.selectedDate)
            if dayEvents.isEmpty {
                Text("Nothing scheduled.")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                    .padding(.horizontal)
            } else {
                VStack(spacing: 0) {
                    ForEach(dayEvents) { event in
                        EventRow(event: event, timeZone: viewModel.timeZone)
                            .padding(.horizontal)
                            .contentShape(Rectangle())
                            .onTapGesture { onSelectEvent(event) }
                    }
                }
            }
        }
    }

    private var daysInGrid: [Date] {
        var calendar = Calendar.current
        calendar.timeZone = viewModel.timeZone
        guard let monthInterval = calendar.dateInterval(of: .month, for: viewModel.visibleMonth) else { return [] }
        let firstWeekday = calendar.component(.weekday, from: monthInterval.start)
        let leadingEmpty = (firstWeekday - calendar.firstWeekday + 7) % 7
        guard let gridStart = calendar.date(byAdding: .day, value: -leadingEmpty, to: monthInterval.start) else { return [] }
        return (0..<42).compactMap { calendar.date(byAdding: .day, value: $0, to: gridStart) }
    }

    private func isInVisibleMonth(_ date: Date) -> Bool {
        Calendar.current.isDate(date, equalTo: viewModel.visibleMonth, toGranularity: .month)
    }
}

private struct DayCell: View {
    let date: Date
    let isInCurrentMonth: Bool
    let isSelected: Bool
    let eventCount: Int

    var body: some View {
        VStack(spacing: 4) {
            Text(date.formatted(.dateTime.day()))
                .font(.subheadline)
                .fontWeight(isSelected ? .bold : .regular)
                .frame(width: 32, height: 32)
                .background(isSelected ? Color.accentColor : Color.clear)
                .foregroundStyle(foregroundColor)
                .clipShape(Circle())

            Circle()
                .fill(eventCount > 0 ? Color.accentColor : Color.clear)
                .frame(width: 5, height: 5)
        }
        .frame(maxWidth: .infinity)
    }

    private var foregroundColor: Color {
        if isSelected { return .white }
        return isInCurrentMonth ? .primary : .secondary.opacity(0.4)
    }
}

struct EventRow: View {
    let event: CalendarEvent
    let timeZone: TimeZone

    var body: some View {
        HStack(spacing: 12) {
            Text(event.category.emoji).font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).font(.subheadline.weight(.medium))
                Text(DateFormatting.eventDateLine(event, timeZone: timeZone))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if event.aiGenerated {
                Image(systemName: "sparkles")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Added by AI")
            }
        }
        .padding(.vertical, 6)
    }
}
