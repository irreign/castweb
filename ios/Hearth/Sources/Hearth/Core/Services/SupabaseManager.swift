import Foundation
import Supabase

/// Owns the single `SupabaseClient` instance for the app. Holds only the
/// public anon key (docs/07-security-model.md §7.2/§7.1) — the service
/// role key and the Claude API key never appear in this app; they live
/// only in Edge Function secrets (supabase/README.md).
@MainActor
final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    /// Shared, consistently-configured decoder — also used to decode
    /// Realtime payloads (ChatService), which arrive outside the
    /// PostgREST client and so don't automatically inherit its decoder.
    let decoder: JSONDecoder
    let encoder: JSONEncoder

    private init() {
        guard
            let urlString = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String,
            let url = URL(string: urlString), url.scheme == "https",
            let anonKey = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String,
            !anonKey.isEmpty
        else {
            fatalError("SUPABASE_URL / SUPABASE_ANON_KEY are not configured — see ios/Hearth/Config/*.xcconfig")
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom(Self.decodeFlexibleISO8601Date)
        self.decoder = decoder

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: anonKey,
            options: SupabaseClientOptions(
                db: .init(encoder: encoder, decoder: decoder),
                auth: .init(storage: KeychainSessionStorage())
            )
        )
    }

    /// `timestamptz` columns come back as ISO8601, with or without
    /// fractional seconds depending on the row — accept both rather than
    /// failing decode on the common "no fractional seconds" case.
    private static func decodeFlexibleISO8601Date(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if let date = Self.isoWithFractionalSeconds.date(from: raw) { return date }
        if let date = Self.isoStandard.date(from: raw) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "invalid timestamp: \(raw)")
    }

    private static let isoStandard = ISO8601DateFormatter()
    private static let isoWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
