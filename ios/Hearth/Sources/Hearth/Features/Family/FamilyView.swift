import SwiftUI

struct FamilyView: View {
    @EnvironmentObject private var appState: AppState
    @State private var members: [FamilyMember] = []
    @State private var isLoading = false
    @State private var showingInvite = false
    private let familyService = FamilyService()

    var body: some View {
        NavigationStack {
            List {
                if let family = appState.family {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(family.name).font(.headline)
                            Text(family.timezone).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }

                Section("Members") {
                    if members.isEmpty && !isLoading {
                        Text("No members yet.").foregroundStyle(.secondary)
                    }
                    ForEach(members) { member in
                        MemberRow(member: member)
                    }
                }
            }
            .navigationTitle("Family")
            .toolbar {
                if canInvite {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showingInvite = true } label: { Image(systemName: "person.badge.plus") }
                            .accessibilityLabel("Invite a family member")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showingInvite) {
                if let familyId = appState.family?.id {
                    InviteView(familyId: familyId)
                }
            }
        }
    }

    private var canInvite: Bool {
        guard let role = appState.membership?.role else { return false }
        return Permissions.canInvite(role: role)
    }

    private func load() async {
        guard let familyId = appState.family?.id else { return }
        isLoading = true
        defer { isLoading = false }
        members = (try? await familyService.fetchMembers(familyId: familyId)) ?? []
    }
}

private struct MemberRow: View {
    let member: FamilyMember

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.accentColor.opacity(0.18))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(initials)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(member.effectiveDisplayName).font(.subheadline.weight(.medium))
                Text(roleLabel).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var initials: String {
        let parts = member.effectiveDisplayName.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "?" : letters.joined().uppercased()
    }

    private var roleLabel: String {
        switch member.role {
        case .owner: return "Owner"
        case .adult: return "Adult"
        case .child: return "Child"
        }
    }
}
