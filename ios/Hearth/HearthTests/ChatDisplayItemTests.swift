import XCTest
@testable import Hearth

final class ChatDisplayItemTests: XCTestCase {
    private func makeMessage(daysAgo: Int, id: UUID = UUID()) -> Message {
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: Date())!
        return Message(
            id: id, conversationId: UUID(), familyId: UUID(), senderId: UUID(), kind: .user,
            clientId: nil, body: "hello", replyToMessageId: nil, metadata: [:],
            editedAt: nil, deletedAt: nil, createdAt: date, updatedAt: date
        )
    }

    func testInsertsADaySeparatorBetweenDifferentCalendarDays() {
        let messages = [makeMessage(daysAgo: 1), makeMessage(daysAgo: 0)]
        let items = ChatDisplayItem.build(messages: messages, pending: [])

        let separatorCount = items.filter {
            if case .daySeparator = $0.kind { return true }
            return false
        }.count
        XCTAssertEqual(separatorCount, 2)
    }

    func testDoesNotRepeatASeparatorWithinTheSameDay() {
        let messages = [makeMessage(daysAgo: 0), makeMessage(daysAgo: 0), makeMessage(daysAgo: 0)]
        let items = ChatDisplayItem.build(messages: messages, pending: [])

        let separatorCount = items.filter {
            if case .daySeparator = $0.kind { return true }
            return false
        }.count
        XCTAssertEqual(separatorCount, 1)
    }

    func testPendingMessagesAppearAfterConfirmedOnes() {
        let pending = PendingMessage(
            clientId: UUID(), conversationId: UUID(), familyId: UUID(), senderId: UUID(),
            body: "sending…", replyToMessageId: nil, createdAt: Date()
        )
        let items = ChatDisplayItem.build(messages: [makeMessage(daysAgo: 0)], pending: [pending])
        XCTAssertEqual(items.last?.id, "pending-\(pending.id.uuidString)")
    }
}
