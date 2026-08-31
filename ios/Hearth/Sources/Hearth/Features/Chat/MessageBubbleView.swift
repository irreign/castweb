import SwiftUI

struct MessageBubbleView: View {
    let message: Message
    let isMine: Bool
    let senderName: String
    let quotedMessage: Message?
    var onReply: () -> Void = {}
    var onDelete: () -> Void = {}
    var canDelete: Bool = false

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 40) }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if !isMine {
                    Text(senderName)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                if let quotedMessage {
                    QuotedMessagePreview(message: quotedMessage)
                }

                Group {
                    if message.isDeleted {
                        Text("Message deleted")
                            .italic()
                            .foregroundStyle(.secondary)
                    } else {
                        Text(message.body ?? "")
                            .foregroundStyle(isMine ? Color.white : Color.primary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bubbleBackground)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                HStack(spacing: 4) {
                    if message.isEdited && !message.isDeleted {
                        Text("edited").font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(DateFormatting.messageTimestamp(message.createdAt))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if !isMine { Spacer(minLength: 40) }
        }
        .contextMenu {
            if !message.isDeleted {
                Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
                if canDelete {
                    Button(role: .destructive) { onDelete() } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
    }

    private var bubbleBackground: Color {
        message.isDeleted ? Color(.tertiarySystemBackground) : (isMine ? Color.accentColor : Color(.secondarySystemBackground))
    }
}

private struct QuotedMessagePreview: View {
    let message: Message

    var body: some View {
        HStack(spacing: 6) {
            Rectangle().fill(Color.accentColor).frame(width: 3)
            Text(message.body ?? "Message")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(Color(.tertiarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct PendingMessageBubbleView: View {
    let pending: PendingMessage
    var onRetry: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .trailing, spacing: 4) {
                Text(pending.body)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.accentColor.opacity(pending.failed ? 0.5 : 0.85))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                if pending.failed {
                    Button(action: onRetry) {
                        Label("Not sent — tap to retry", systemImage: "exclamationmark.arrow.circlepath")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                } else {
                    ProgressView().scaleEffect(0.6)
                }
            }
        }
    }
}

struct DaySeparatorView: View {
    let date: Date

    var body: some View {
        Text(DateFormatting.daySeparator(date))
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(Color(.tertiarySystemBackground))
            .clipShape(Capsule())
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
    }
}

struct ReplyPreviewBar: View {
    let message: Message
    var onCancel: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Color.accentColor).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text("Replying to").font(.caption2).foregroundStyle(.secondary)
                Text(message.body ?? "Message").font(.caption).lineLimit(1)
            }
            Spacer()
            Button(action: onCancel) {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemBackground))
    }
}
