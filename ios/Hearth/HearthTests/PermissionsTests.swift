import XCTest
@testable import Hearth

/// Docs/07-security-model.md §7.7's role table, expressed as tests.
/// These check the client-side UX gate only — the real enforcement is
/// Postgres RLS (see supabase/migrations/0001_init.sql), which this
/// project has no way to exercise from a Swift unit test.
final class PermissionsTests: XCTestCase {
    func testOwnerAndAdultCanEditCalendar() {
        XCTAssertTrue(Permissions.canEditCalendar(role: .owner))
        XCTAssertTrue(Permissions.canEditCalendar(role: .adult))
        XCTAssertFalse(Permissions.canEditCalendar(role: .child))
    }

    func testOnlyOwnerCanManageFamily() {
        XCTAssertTrue(Permissions.canManageFamily(role: .owner))
        XCTAssertFalse(Permissions.canManageFamily(role: .adult))
        XCTAssertFalse(Permissions.canManageFamily(role: .child))
    }

    func testChildCannotResolveAICards() {
        XCTAssertFalse(Permissions.canResolveAICard(role: .child))
        XCTAssertTrue(Permissions.canResolveAICard(role: .adult))
        XCTAssertTrue(Permissions.canResolveAICard(role: .owner))
    }

    func testDeleteMessagePermission() {
        XCTAssertTrue(Permissions.canDeleteMessage(role: .child, isOwnMessage: true))
        XCTAssertFalse(Permissions.canDeleteMessage(role: .child, isOwnMessage: false))
        XCTAssertTrue(Permissions.canDeleteMessage(role: .owner, isOwnMessage: false))
    }
}
