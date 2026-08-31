import SwiftUI

/// Entry point for the Chat tab — resolves the current family's
/// conversation/user from `AppState` before handing off to
/// `ChatContentView`, which owns the actual `@StateObject` view model
/// (kept separate so the view model's `init` gets real, non-optional
/// parameters — see docs/03 screen-map).
struct ChatView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            if let conversation = appState.conversation, let familyId = appState.family?.id, let userId = appState.currentUser?.id {
                ChatContentView(conversation: conversation, familyId: familyId, currentUserId: userId)
            } else {
                SplashView()
            }
        }
    }
}

struct ChatContentView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: ChatViewModel
    @FocusState private var composerFocused: Bool
    @State private var editingSuggestion: EditingSuggestionContext?
    @State private var members: [FamilyMember] = []
    private let familyService = FamilyService()

    init(conversation: Conversation, familyId: UUID, currentUserId: UUID) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(
            conversation: conversation, familyId: familyId, currentUserId: currentUserId
        ))
    }

    private var displayItems: [ChatDisplayItem] {
        ChatDisplayItem.build(messages: viewModel.messages, pending: viewModel.pendingMessages)
    }

    private var senderNames: [UUID: String] {
        Dictionary(uniqueKeysWithValues: members.map { ($0.userId, $0.effectiveDisplayName) })
    }

    private var messagesById: [UUID: Message] {
        Dictionary(uniqueKeysWithValues: viewModel.messages.map { ($0.id, $0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        if viewModel.isLoadingHistory {
                            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 8)
                        }
                        ForEach(displayItems) { item in
                            ChatRowView(
                                item: item, viewModel: viewModel, senderNames: senderNames,
                                messagesById: messagesById, editingSuggestion: $editingSuggestion
                            )
                            .id(item.id)
                            .onAppear {
                                if case .message(let message) = item.kind {
                                    Task { await viewModel.loadMoreHistoryIfNeeded(visibleTopMessageId: message.id) }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .onChange(of: displayItems.count) { _, _ in
                    if let last = displayItems.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                .onChange(of: appState.navigateToMessageId) { _, messageId in
                    guard let messageId else { return }
                    if let item = displayItems.first(where: { if case .message(let m) = $0.kind { return m.id == messageId } else { return false } }) {
                        withAnimation { proxy.scrollTo(item.id, anchor: .center) }
                    }
                    appState.navigateToMessageId = nil
                }
            }

            if let reply = viewModel.replyingTo {
                ReplyPreviewBar(message: reply) { viewModel.replyingTo = nil }
            }

            MessageComposerView(text: $viewModel.draft, isFocused: $composerFocused, onSend: viewModel.send)
        }
        .navigationTitle("Family Chat")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let start: Void = viewModel.start()
            async let loadMembers: Void = loadMembers()
            _ = await (start, loadMembers)
        }
        .onDisappear { viewModel.stop() }
        .sheet(item: $editingSuggestion) { context in
            EditSuggestedEventView(context: context) { overrides in
                viewModel.resolveCard(extractionId: context.extractionId, action: .edit, overrides: overrides)
            }
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })
        ) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private func loadMembers() async {
        guard let familyId = appState.family?.id else { return }
        members = (try? await familyService.fetchMembers(familyId: familyId)) ?? []
    }
}
