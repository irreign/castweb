import SwiftUI

enum HearthTab {
    case chat, calendar, family, settings
}

/// The four primary sections (brief §4): Chat, Calendar, Family, Settings.
/// Also the cross-tab navigation coordinator for "Created from chat" /
/// "View Event" links (docs/02 §2.2 step 6) via `appState.navigateTo*`.
struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedTab: HearthTab = .chat

    var body: some View {
        TabView(selection: $selectedTab) {
            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right.fill") }
                .tag(HearthTab.chat)

            CalendarHomeView()
                .tabItem { Label("Calendar", systemImage: "calendar") }
                .tag(HearthTab.calendar)

            FamilyView()
                .tabItem { Label("Family", systemImage: "person.2.fill") }
                .tag(HearthTab.family)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(HearthTab.settings)
        }
        .onChange(of: appState.navigateToEventId) { _, newValue in
            if newValue != nil { selectedTab = .calendar }
        }
        .onChange(of: appState.navigateToMessageId) { _, newValue in
            if newValue != nil { selectedTab = .chat }
        }
        .task {
            await appState.requestPushAuthorizationAndRegister()
        }
    }
}
