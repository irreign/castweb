import UIKit

/// Minimal UIKit shim, only for APNs device-token callbacks — everything
/// else in the app is SwiftUI-native.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .hearthDidReceivePushToken, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Hearth: APNs registration failed: \(error.localizedDescription)")
    }
}

extension Notification.Name {
    static let hearthDidReceivePushToken = Notification.Name("hearthDidReceivePushToken")
}
