import Foundation
import Combine

final class ReadingStore: ObservableObject {
    @Published var readIDs: Set<String> {
        didSet { persist() }
    }
    @Published var bookmarkedIDs: Set<String> {
        didSet { persist() }
    }

    private let readKey = "levelground.readIDs"
    private let bookmarkKey = "levelground.bookmarkedIDs"

    init() {
        let defaults = UserDefaults.standard
        readIDs = Set(defaults.stringArray(forKey: readKey) ?? [])
        bookmarkedIDs = Set(defaults.stringArray(forKey: bookmarkKey) ?? [])
    }

    private func persist() {
        let defaults = UserDefaults.standard
        defaults.set(Array(readIDs), forKey: readKey)
        defaults.set(Array(bookmarkedIDs), forKey: bookmarkKey)
    }

    func markRead(_ id: String) {
        readIDs.insert(id)
    }

    func toggleBookmark(_ id: String) {
        if bookmarkedIDs.contains(id) {
            bookmarkedIDs.remove(id)
        } else {
            bookmarkedIDs.insert(id)
        }
    }

    func isRead(_ id: String) -> Bool { readIDs.contains(id) }
    func isBookmarked(_ id: String) -> Bool { bookmarkedIDs.contains(id) }
}
