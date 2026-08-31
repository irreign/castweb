import Foundation
import Security
import Supabase

/// Stores Supabase Auth session tokens in iOS Keychain rather than
/// `UserDefaults` (docs/07-security-model.md §7.2 — session JWTs never
/// belong in UserDefaults). Implements the Supabase Auth SDK's storage
/// protocol so the SDK's own refresh-token handling uses this transparently.
final class KeychainSessionStorage: AuthLocalStorage {
    private let service = "com.irreign.hearth.auth"

    func store(key: String, value: Data) throws {
        var query = baseQuery(for: key)
        SecItemDelete(query as CFDictionary) // upsert: clear any existing item first
        query[kSecValueData as String] = value
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    func retrieve(key: String) throws -> Data? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
        return result as? Data
    }

    func remove(key: String) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandled(status)
        }
    }

    private func baseQuery(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    enum KeychainError: Error {
        case unhandled(OSStatus)
    }
}
