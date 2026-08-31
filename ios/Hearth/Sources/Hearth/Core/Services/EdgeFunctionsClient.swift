import Foundation
import Supabase

/// Thin helper around `SupabaseClient.functions.invoke`, decoding either
/// the success payload or the uniform error shape from
/// docs/08-api-design.md §8.3 into a `ServiceError`. Request bodies passed
/// through here should declare snake_case `CodingKeys` explicitly (rather
/// than relying on a global encoder strategy) since the Functions client
/// encodes independently of the PostgREST client configured in
/// SupabaseManager.
enum EdgeFunctions {
    private struct ErrorBody: Decodable {
        struct Inner: Decodable { let code: String; let message: String }
        let error: Inner
    }

    static func invoke<Response: Decodable>(
        _ client: SupabaseClient,
        name: String,
        body: some Encodable
    ) async throws -> Response {
        do {
            return try await client.functions.invoke(name, options: FunctionInvokeOptions(body: body))
        } catch {
            throw mapError(error)
        }
    }

    static func invokeVoid(_ client: SupabaseClient, name: String, body: some Encodable) async throws {
        do {
            _ = try await client.functions.invoke(name, options: FunctionInvokeOptions(body: body)) as VoidResponse
        } catch {
            throw mapError(error)
        }
    }

    private static func mapError(_ error: Error) -> ServiceError {
        // TODO(docs/09 known issues): supabase-swift surfaces a non-2xx
        // function response as a `FunctionsError` carrying the raw HTTP
        // response; once this project is compiling against a pinned SDK
        // version, extract that response's body here and decode it with
        // `ErrorBody` to recover the precise { code, message } from
        // docs/08-api-design.md §8.3 instead of falling back to a generic
        // message below.
        .unknown(error.localizedDescription)
    }
}

/// Used only to satisfy `invoke`'s generic Decodable requirement when we
/// don't care about the response body.
private struct VoidResponse: Decodable {}
