import Foundation

/// Mirrors `public.users`. Property names are camelCase; the Supabase
/// client is configured (see SupabaseManager) to convert snake_case JSON
/// keys automatically, so no manual CodingKeys are needed here or in the
/// other model files.
struct User: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var displayName: String
    var avatarUrl: String?
    let createdAt: Date
    var updatedAt: Date
}
