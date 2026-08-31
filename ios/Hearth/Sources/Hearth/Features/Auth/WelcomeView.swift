import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject private var authService: AuthService

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.orange)
                        .accessibilityHidden(true)
                    Text("Hearth")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                    Text("Talk as a family. Hearth quietly keeps everyone organized.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                Spacer()
                VStack(spacing: 12) {
                    NavigationLink("Create account") {
                        SignUpView(authService: authService)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)

                    NavigationLink("Sign in") {
                        SignInView(authService: authService)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemBackground))
        }
    }
}
