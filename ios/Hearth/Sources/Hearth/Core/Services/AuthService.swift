import Foundation
import Supabase

/// Thin wrapper over Supabase Auth. Publishes the current session so
/// `AppState`/`RootView` can switch between the Auth flow and Main
/// (docs/03-screen-map.md). Session tokens live in Keychain via
/// `KeychainSessionStorage`, never in `UserDefaults`.
@MainActor
final class AuthService: ObservableObject {
    @Published private(set) var session: Session?
    @Published private(set) var isLoading = true

    private let client: SupabaseClient
    private var authStateTask: Task<Void, Never>?

    init(client: SupabaseClient = SupabaseManager.shared.client) {
        self.client = client
        observeAuthState()
    }

    deinit {
        authStateTask?.cancel()
    }

    var currentUserId: UUID? { session?.user.id }
    var isSignedIn: Bool { session != nil }

    private func observeAuthState() {
        authStateTask = Task { [weak self] in
            guard let self else { return }
            for await state in client.auth.authStateChanges {
                self.session = state.session
                self.isLoading = false
            }
        }
    }

    func signUp(email: String, password: String, displayName: String) async throws {
        do {
            try await client.auth.signUp(
                email: email,
                password: password,
                data: ["display_name": .string(displayName)]
            )
        } catch {
            throw mapAuthError(error)
        }
    }

    func signIn(email: String, password: String) async throws {
        do {
            try await client.auth.signIn(email: email, password: password)
        } catch {
            throw mapAuthError(error)
        }
    }

    func sendMagicLink(email: String) async throws {
        do {
            try await client.auth.signInWithOTP(email: email)
        } catch {
            throw mapAuthError(error)
        }
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    private func mapAuthError(_ error: Error) -> ServiceError {
        .validation(error.localizedDescription)
    }
}
