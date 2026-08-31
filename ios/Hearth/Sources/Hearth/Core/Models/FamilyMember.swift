import Foundation

/// Mirrors `public.family_members`.
struct FamilyMember: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let familyId: UUID
    let userId: UUID
    var role: FamilyRole
    var status: MemberStatus
    var displayName: String?
    let createdAt: Date
    var updatedAt: Date

    /// Joined-in user profile, when the query embeds it
    /// (`family_members.select("*, users(*)")`). Not present on every fetch.
    var user: User?

    var effectiveDisplayName: String {
        displayName ?? user?.displayName ?? "Family member"
    }
}

/// Mirrors `public.conversations`.
struct Conversation: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let familyId: UUID
    var name: String
    var isPrimary: Bool
    let createdAt: Date
    var updatedAt: Date
}
