import Foundation
import Combine

final class ShortlistStore: ObservableObject {
    @Published var shortlistedIDs: Set<String> {
        didSet { persist() }
    }

    private let key = "levelground.shortlistedPropertyIDs"

    init() {
        shortlistedIDs = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    }

    private func persist() {
        UserDefaults.standard.set(Array(shortlistedIDs), forKey: key)
    }

    func toggle(_ id: String) {
        if shortlistedIDs.contains(id) {
            shortlistedIDs.remove(id)
        } else {
            shortlistedIDs.insert(id)
        }
    }

    func isShortlisted(_ id: String) -> Bool { shortlistedIDs.contains(id) }
}
