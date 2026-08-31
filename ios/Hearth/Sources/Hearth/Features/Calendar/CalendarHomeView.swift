import SwiftUI

struct CalendarHomeView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            if let familyId = appState.family?.id, let timeZone = appState.family?.timeZone {
                CalendarContentView(familyId: familyId, timeZone: timeZone)
            } else {
                SplashView()
            }
        }
    }
}

private enum CalendarSegment: String, CaseIterable, Identifiable {
    case month = "Month"
    case agenda = "Agenda"
    var id: String { rawValue }
}

struct CalendarContentView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: CalendarViewModel
    @State private var segment: CalendarSegment = .month
    @State private var showingNewEvent = false
    @State private var selectedEvent: CalendarEvent?

    init(familyId: UUID, timeZone: TimeZone) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(familyId: familyId, timeZone: timeZone))
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("View", selection: $segment) {
                ForEach(CalendarSegment.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding()

            Group {
                switch segment {
                case .month:
                    MonthCalendarView(viewModel: viewModel, onSelectEvent: { selectedEvent = $0 })
                case .agenda:
                    AgendaListView(viewModel: viewModel, onSelectEvent: { selectedEvent = $0 })
                }
            }
        }
        .navigationTitle("Calendar")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingNewEvent = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New event")
            }
        }
        .task { await viewModel.loadCurrentMonth() }
        .sheet(isPresented: $showingNewEvent) {
            EventEditView(mode: .create(familyId: viewModel.familyId)) { _ in
                Task { await viewModel.loadCurrentMonth() }
            }
        }
        .sheet(item: $selectedEvent) { event in
            EventDetailView(event: event) {
                Task { await viewModel.loadCurrentMonth() }
            }
        }
        .onChange(of: appState.navigateToEventId) { _, eventId in
            guard let eventId else { return }
            Task {
                if let match = viewModel.events.first(where: { $0.id == eventId }) {
                    selectedEvent = match
                } else if let fetched = try? await CalendarService().fetchEvent(id: eventId) {
                    selectedEvent = fetched
                }
                appState.navigateToEventId = nil
            }
        }
    }
}
