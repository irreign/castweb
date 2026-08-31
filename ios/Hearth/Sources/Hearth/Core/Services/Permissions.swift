import Foundation

/// Client-side mirror of the role table in docs/07-security-model.md §7.7.
/// This is UX gating only (hide/disable actions that would just fail
/// server-side) — the real enforcement is always Postgres RLS and the
/// SECURITY DEFINER RPCs, never this file.
enum Permissions {
    static func canEditCalendar(role: FamilyRole) -> Bool {
        role == .owner || role == .adult
    }

    static func canManageFamily(role: FamilyRole) -> Bool {
        role == .owner
    }

    static func canInvite(role: FamilyRole) -> Bool {
        role == .owner || role == .adult
    }

    /// Adding/editing/updating/ignoring an AI suggestion card — same
    /// owner/adult gate as editing the calendar directly, since resolving
    /// a card is just another way of writing a calendar_events row.
    static func canResolveAICard(role: FamilyRole) -> Bool {
        role != .child
    }

    static func canDeleteMessage(role: FamilyRole, isOwnMessage: Bool) -> Bool {
        isOwnMessage || role == .owner
    }
}
