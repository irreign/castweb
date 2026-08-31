import SwiftUI

@main
struct HearthApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authService: AuthService
    @StateObject private var appState: AppState

    init() {
        let auth = AuthService()
        _authService = StateObject(wrappedValue: auth)
        _appState = StateObject(wrappedValue: AppState(authService: auth))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authService)
                .environmentObject(appState)
                .onOpenURL { url in
                    appState.handleIncomingURL(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: .hearthDidReceivePushToken)) { note in
                    guard let token = note.object as? String else { return }
                    Task { await appState.registerDeviceToken(token) }
                }
        }
    }
}
