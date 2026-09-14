import Foundation
import Combine

final class ProfileStore: ObservableObject {
    @Published var profile: UserProfile {
        didSet { persist() }
    }

    private let defaultsKey = "levelground.userProfile"

    init() {
        if let data = UserDefaults.standard.data(forKey: defaultsKey),
           let decoded = try? JSONDecoder().decode(UserProfile.self, from: data) {
            self.profile = decoded
        } else {
            self.profile = UserProfile()
        }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    func resetOnboarding() {
        profile.completedOnboarding = false
    }
}
