import Foundation
import Supabase

/// Family/member/invite operations. Table reads/writes go straight
/// through the Supabase SDK under RLS (docs/08-api-design.md §8.1);
/// family creation and invite create/redeem go through the transactional
/// RPCs / Edge Functions described in docs/08 §8.2.
@MainActor
final class FamilyService {
    private let client: SupabaseClient
    init(client: SupabaseClient = SupabaseManager.shared.client) { self.client = client }

    func fetchMyFamilies() async throws -> [Family] {
        try await client.from("families").select().order("created_at").execute().value
    }

    func fetchMembers(familyId: UUID) async throws -> [FamilyMember] {
        try await client.from("family_members")
            .select("*, user:users(*)")
            .eq("family_id", value: familyId)
            .eq("status", value: MemberStatus.active.rawValue)
            .order("created_at")
            .execute()
            .value
    }

    func fetchMyMembership(familyId: UUID, userId: UUID) async throws -> FamilyMember? {
        // .maybeSingle() (unlike .single()) returns nil instead of
        // throwing when zero rows match — the right choice here since "not
        // yet a member" is an expected outcome, not an error.
        try await client.from("family_members")
            .select()
            .eq("family_id", value: familyId)
            .eq("user_id", value: userId)
            .maybeSingle()
            .execute()
            .value
    }

    func fetchPrimaryConversation(familyId: UUID) async throws -> Conversation {
        try await client.from("conversations")
            .select()
            .eq("family_id", value: familyId)
            .eq("is_primary", value: true)
            .single()
            .execute()
            .value
    }

    private struct CreateFamilyParams: Encodable {
        let name: String
        let timezone: String
        enum CodingKeys: String, CodingKey { case name = "_name", timezone = "_timezone" }
    }

    func createFamily(name: String, timezone: String) async throws -> Family {
        // create_family() returns a single `families` row (not SETOF), so
        // PostgREST hands back one JSON object already — no `.single()`
        // needed (that's for reducing a SETOF/array response to one row).
        try await client
            .rpc("create_family", params: CreateFamilyParams(name: name, timezone: timezone))
            .execute()
            .value
    }

    func updateSettings(familyId: UUID, settings: FamilySettings) async throws {
        struct Update: Encodable { let settings: FamilySettings }
        try await client.from("families").update(Update(settings: settings)).eq("id", value: familyId).execute()
    }

    // MARK: - Invites (docs/08 §8.2)

    struct InviteCreateResponse: Decodable {
        let token: String
        let url: String
        let expiresAt: Date
    }

    func createInvite(familyId: UUID, maxUses: Int = 1, expiresInHours: Int = 168) async throws -> InviteCreateResponse {
        struct Body: Encodable {
            let familyId: UUID
            let maxUses: Int
            let expiresInHours: Int
            enum CodingKeys: String, CodingKey {
                case familyId = "family_id", maxUses = "max_uses", expiresInHours = "expires_in_hours"
            }
        }
        return try await EdgeFunctions.invoke(
            client, name: "invite/create",
            body: Body(familyId: familyId, maxUses: maxUses, expiresInHours: expiresInHours)
        )
    }

    func redeemInvite(token: String) async throws -> UUID {
        struct Body: Encodable { let token: String }
        struct Response: Decodable {
            let familyId: UUID
            enum CodingKeys: String, CodingKey { case familyId = "family_id" }
        }
        let response: Response = try await EdgeFunctions.invoke(client, name: "invite/redeem", body: Body(token: token))
        return response.familyId
    }
}
