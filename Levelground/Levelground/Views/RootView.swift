import SwiftUI

struct RootView: View {
    @EnvironmentObject var profileStore: ProfileStore

    var body: some View {
        if profileStore.profile.completedOnboarding {
            MainTabView()
        } else {
            OnboardingView()
        }
    }
}

#Preview {
    RootView()
        .environmentObject(ProfileStore())
        .environmentObject(ReadingStore())
        .environmentObject(ShortlistStore())
}
