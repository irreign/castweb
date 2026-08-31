import Foundation

/// Flattens the message list (+ any in-flight optimistic sends) into a
/// single ordered list the chat's LazyVStack can render directly, with day
/// separators inserted between calendar days.
struct ChatDisplayItem: Identifiable {
    enum Kind {
        case daySeparator(Date)
        case message(Message)
        case pending(PendingMessage)
    }

    let id: String
    let kind: Kind

    static func build(messages: [Message], pending: [PendingMessage]) -> [ChatDisplayItem] {
        var items: [ChatDisplayItem] = []
        var lastDay: Date?
        let calendar = Calendar.current

        for message in messages {
            let day = calendar.startOfDay(for: message.createdAt)
            if day != lastDay {
                items.append(ChatDisplayItem(id: "day-\(day.timeIntervalSince1970)", kind: .daySeparator(day)))
                lastDay = day
            }
            items.append(ChatDisplayItem(id: "msg-\(message.id.uuidString)", kind: .message(message)))
        }
        for item in pending {
            items.append(ChatDisplayItem(id: "pending-\(item.id.uuidString)", kind: .pending(item)))
        }
        return items
    }
}
