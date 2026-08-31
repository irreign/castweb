import SwiftUI

struct AgendaListView: View {
    @ObservedObject var viewModel: CalendarViewModel
    var onSelectEvent: (CalendarEvent) -> Void

    var body: some View {
        Group {
            if viewModel.groupedUpcomingEvents.isEmpty {
                ContentUnavailableView(
                    "Nothing coming up",
                    systemImage: "calendar",
                    description: Text("Events your family mentions in chat will show up here.")
                )
            } else {
                List {
                    ForEach(viewModel.groupedUpcomingEvents, id: \.date) { group in
                        Section(group.date.asDate(in: viewModel.timeZone).formatted(.dateTime.weekday(.wide).month(.wide).day())) {
                            ForEach(group.events) { event in
                                EventRow(event: event, timeZone: viewModel.timeZone)
                                    .contentShape(Rectangle())
                                    .onTapGesture { onSelectEvent(event) }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }
}
