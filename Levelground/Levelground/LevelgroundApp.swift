import SwiftUI

@main
struct LevelgroundApp: App {
    @StateObject private var profileStore = ProfileStore()
    @StateObject private var readingStore = ReadingStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(profileStore)
                .environmentObject(readingStore)
        }
    }
}
