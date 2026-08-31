import SwiftUI

/// The only screen reachable once a session exists but no family does yet
/// (docs/03 screen-map). Defaults to the Join tab when a
/// `hearth://invite/<token>` link launched the app (docs/02 §2.1).
struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState
    @State private var mode: Mode = .create

    enum Mode: String, CaseIterable, Identifiable {
        case create = "Create Family"
        case join = "Join Family"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Picker("", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                Group {
                    switch mode {
                    case .create: OnboardingCreateFamilyView()
                    case .join: OnboardingJoinFamilyView()
                    }
                }
                .padding(.horizontal)

                Spacer()
            }
            .padding(.top, 24)
            .navigationTitle("Welcome to Hearth")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if appState.pendingInviteToken != nil { mode = .join }
            }
        }
    }
}

struct OnboardingCreateFamilyView: View {
    @EnvironmentObject private var appState: AppState
    @State private var name = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    private let timezone = TimeZone.current.identifier

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Give your family a name")
                .font(.headline)
            TextField("e.g. The Tans", text: $name)
                .textFieldStyle(.roundedBorder)

            HStack {
                Text("Timezone")
                Spacer()
                Text(timezone).foregroundStyle(.secondary)
            }
            .font(.subheadline)

            Text("Every date your family mentions in chat is resolved against this timezone (changeable later in Settings).")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }

            Button {
                Task { await create() }
            } label: {
                HStack {
                    Spacer()
                    if isSubmitting { ProgressView() } else { Text("Create family").fontWeight(.semibold) }
                    Spacer()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
        }
    }

    private func create() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await appState.createFamily(name: name, timezone: timezone)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct OnboardingJoinFamilyView: View {
    @EnvironmentObject private var appState: AppState
    @State private var token = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Enter your invite link or code")
                .font(.headline)
            TextField("hearth://invite/…", text: $token)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }

            Button {
                Task { await join() }
            } label: {
                HStack {
                    Spacer()
                    if isSubmitting { ProgressView() } else { Text("Join family").fontWeight(.semibold) }
                    Spacer()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(token.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
        }
        .onAppear {
            if let pending = appState.pendingInviteToken { token = pending }
        }
        .onChange(of: appState.pendingInviteToken) { _, newValue in
            if let newValue { token = newValue }
        }
    }

    private func join() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await appState.joinFamily(inviteToken: normalizedToken)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Accepts either a bare token or a full `hearth://invite/<token>` link.
    private var normalizedToken: String {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), url.scheme == "hearth" {
            return url.pathComponents.last(where: { $0 != "/" }) ?? trimmed
        }
        return trimmed
    }
}
