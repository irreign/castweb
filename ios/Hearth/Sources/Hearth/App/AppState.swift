import Foundation
import Supabase
import UserNotifications
import UIKit

/// The app's root state: current user profile, the family they belong to
/// (V1 supports exactly one family per user in the UI — docs/03
/// screen-map), and the family's single primary conversation. Populated
/// once a session exists (see RootView).
@MainActor
final class AppState: ObservableObject {
    @Published var currentUser: User?
    @Published var family: Family?
    @Published var membership: FamilyMember?
    @Published var conversation: Conversation?
    @Published var isLoadingFamily = false
    @Published var loadError: String?

    /// Set by the `hearth://invite/<token>` deep link handler (HearthApp)
    /// so onboarding can prefill the Join flow (docs/02 §2.1).
    @Published var pendingInviteToken: String?

    /// Cross-tab navigation coordinator for the "Created from chat" /
    /// "View Event" links (docs/02 §2.2 step 6, brief §10) — set by an
    /// event card in Chat or by an event's detail sheet in Calendar;
    /// MainTabView switches tabs, the destination view consumes and clears it.
    @Published var navigateToEventId: UUID?
    @Published var navigateToMessageId: UUID?

    let authService: AuthService
    let familyService: FamilyService
    private let notificationService: NotificationService
    private let client: SupabaseClient

    init(authService: AuthService, client: SupabaseClient = SupabaseManager.shared.client) {
        self.authService = authService
        self.client = client
        self.familyService = FamilyService(client: client)
        self.notificationService = NotificationService(client: client)
    }

    var hasFamily: Bool { family != nil }

    func loadFamilyIfNeeded() async {
        guard let userId = authService.currentUserId else { return }
        isLoadingFamily = true
        loadError = nil
        defer { isLoadingFamily = false }

        do {
            if currentUser == nil {
                currentUser = try await fetchCurrentUser(userId: userId)
            }
            guard let first = try await familyService.fetchMyFamilies().first else {
                family = nil
                membership = nil
                conversation = nil
                return
            }
            family = first
            async let membershipFetch = familyService.fetchMyMembership(familyId: first.id, userId: userId)
            async let conversationFetch = familyService.fetchPrimaryConversation(familyId: first.id)
            membership = try await membershipFetch
            conversation = try await conversationFetch
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func fetchCurrentUser(userId: UUID) async throws -> User {
        try await client.from("users").select().eq("id", value: userId).single().execute().value
    }

    func createFamily(name: String, timezone: String) async throws {
        _ = try await familyService.createFamily(name: name, timezone: timezone)
        await loadFamilyIfNeeded()
    }

    func joinFamily(inviteToken: String) async throws {
        _ = try await familyService.redeemInvite(token: inviteToken)
        pendingInviteToken = nil
        await loadFamilyIfNeeded()
    }

    func handleIncomingURL(_ url: URL) {
        // hearth://invite/<token>
        guard url.scheme == "hearth", url.host == "invite" else { return }
        let token = url.pathComponents.last(where: { $0 != "/" })
        pendingInviteToken = token
    }

    func signOut() async {
        try? await authService.signOut()
        currentUser = nil
        family = nil
        membership = nil
        conversation = nil
    }

    // MARK: - Push notifications (brief §15)

    func requestPushAuthorizationAndRegister() async {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func registerDeviceToken(_ token: String) async {
        guard let userId = currentUser?.id else { return }
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        try? await notificationService.registerDeviceToken(userId: userId, token: token, environment: environment)
    }
}
