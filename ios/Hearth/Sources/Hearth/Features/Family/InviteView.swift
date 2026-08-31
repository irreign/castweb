import SwiftUI

struct InviteView: View {
    @Environment(\.dismiss) private var dismiss
    let familyId: UUID
    @State private var invite: FamilyService.InviteCreateResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    private let familyService = FamilyService()

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 44))
                    .foregroundStyle(.accentColor)

                Text("Invite a family member")
                    .font(.headline)
                Text("This link works once and expires in 7 days.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if isLoading {
                    ProgressView()
                } else if let invite, let url = URL(string: invite.url) {
                    ShareLink(item: url) {
                        Label("Share invite link", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal)

                    Text(invite.url)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .padding(.horizontal)
                } else if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }

                Spacer()
            }
            .padding(.top, 40)
            .navigationTitle("Invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await createInvite() }
        }
    }

    private func createInvite() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            invite = try await familyService.createInvite(familyId: familyId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
