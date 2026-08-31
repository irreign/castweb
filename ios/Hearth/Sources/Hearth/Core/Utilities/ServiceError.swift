import Foundation

/// A typed mapping of the Edge Function error shape (docs/08-api-design.md
/// §8.3) plus local failure cases, so view models can drive the right
/// empty/error state instead of a generic alert (brief §21/§25).
enum ServiceError: Error, LocalizedError, Equatable {
    case notAuthenticated
    case forbidden(String)
    case notFound(String)
    case conflict(String)
    case validation(String)
    case aiUnavailable(String)
    case offline
    case unknown(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Please sign in again."
        case .forbidden(let message), .notFound(let message), .conflict(let message),
             .validation(let message), .aiUnavailable(let message), .unknown(let message):
            return message
        case .offline:
            return "You're offline — this will retry automatically."
        }
    }

    static func from(code: String, message: String) -> ServiceError {
        switch code {
        case "UNAUTHENTICATED": return .notAuthenticated
        case "FORBIDDEN": return .forbidden(message)
        case "NOT_FOUND": return .notFound(message)
        case "CONFLICT": return .conflict(message)
        case "VALIDATION_FAILED", "AI_VALIDATION_FAILED": return .validation(message)
        case "UPSTREAM_FAILURE", "UPSTREAM_TIMEOUT": return .aiUnavailable(message)
        default: return .unknown(message)
        }
    }
}
