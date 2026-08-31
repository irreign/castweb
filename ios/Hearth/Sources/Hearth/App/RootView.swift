import SwiftUI

/// Switches between the Auth flow, onboarding, and Main — the only place
/// in the app that branches on session/family state (docs/03 screen-map).
struct RootView: View {
    @EnvironmentObject private var authService: AuthService
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if authService.isLoading {
                SplashView()
            } else if !authService.isSignedIn {
                WelcomeView()
            } else if appState.isLoadingFamily && appState.family == nil {
                SplashView()
            } else if appState.family == nil {
                OnboardingView()
            } else {
                MainTabView()
            }
        }
        .animation(.default, value: appState.hasFamily)
        .task(id: authService.session?.user.id) {
            guard authService.isSignedIn else { return }
            await appState.loadFamilyIfNeeded()
        }
    }
}

struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "flame.fill")
                .font(.system(size: 44))
                .foregroundStyle(.orange)
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
