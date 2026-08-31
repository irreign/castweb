import Foundation
import Supabase

/// Device push token registration and per-category notification
/// preferences (brief §15).
@MainActor
final class NotificationService {
    private let client: SupabaseClient
    init(client: SupabaseClient = SupabaseManager.shared.client) { self.client = client }

    func registerDeviceToken(userId: UUID, token: String, environment: String) async throws {
        struct Upsert: Encodable {
            let userId: UUID
            let token: String
            let platform: String
            let environment: String
        }
        try await client.from("device_push_tokens")
            .upsert(
                Upsert(userId: userId, token: token, platform: "ios", environment: environment),
                onConflict: "user_id,token"
            )
            .execute()
    }

    func fetchPreferences(userId: UUID, familyId: UUID) async throws -> NotificationPreferences {
        try await client.from("notification_preferences")
            .select()
            .eq("user_id", value: userId)
            .eq("family_id", value: familyId)
            .single()
            .execute()
            .value
    }

    func updatePreferences(_ preferences: NotificationPreferences) async throws {
        struct Update: Encodable {
            let newMessage: Bool
            let eventAdded: Bool
            let eventUpcoming: Bool
            let eventChanged: Bool
            let clarificationNeeded: Bool
        }
        try await client.from("notification_preferences")
            .update(Update(
                newMessage: preferences.newMessage,
                eventAdded: preferences.eventAdded,
                eventUpcoming: preferences.eventUpcoming,
                eventChanged: preferences.eventChanged,
                clarificationNeeded: preferences.clarificationNeeded
            ))
            .eq("user_id", value: preferences.userId)
            .eq("family_id", value: preferences.familyId)
            .execute()
    }
}
