import UIKit

/// Centralizes haptic feedback so call sites read as intent, not raw
/// UIKit generator boilerplate (brief §25 "haptics").
enum Haptics {
    @MainActor static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    @MainActor static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    @MainActor static func lightTap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @MainActor static func selectionChanged() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
