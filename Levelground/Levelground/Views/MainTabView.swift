import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            PropertiesView()
                .tabItem { Label("Properties", systemImage: "building.2.fill") }

            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }

            LibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical.fill") }

            ToolsView()
                .tabItem { Label("Tools", systemImage: "function") }

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(ProfileStore())
        .environmentObject(ReadingStore())
}
