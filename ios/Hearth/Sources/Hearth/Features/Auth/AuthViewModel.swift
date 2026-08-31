import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var displayName = ""
    @Published var isSubmitting = false
    @Published var errorMessage: String?

    private let authService: AuthService

    init(authService: AuthService) {
        self.authService = authService
    }

    var canSubmitSignIn: Bool { !email.isEmpty && password.count >= 6 }
    var canSubmitSignUp: Bool {
        !email.isEmpty && password.count >= 6 && !displayName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func signIn() async {
        guard canSubmitSignIn else { return }
        await run { try await self.authService.signIn(email: self.email, password: self.password) }
    }

    func signUp() async {
        guard canSubmitSignUp else { return }
        await run {
            try await self.authService.signUp(email: self.email, password: self.password, displayName: self.displayName)
        }
    }

    private func run(_ operation: @escaping () async throws -> Void) async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
