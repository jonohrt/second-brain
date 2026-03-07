import Foundation

// MARK: - Request Types

struct AskRequest: Encodable {
    let text: String
}

struct CaptureRequest: Encodable {
    let text: String
    let title: String?
    let type: String?
    let tags: [String]?
}

// MARK: - Response Types

struct AskSource: Decodable, Identifiable {
    let type: String?
    let url: String?
    let title: String?
    let path: String?

    var id: String { path ?? url ?? title ?? UUID().uuidString }
}

struct AskResponse: Decodable {
    let answer: String
    let sources: [AskSource]?
    let route: String?
    let model: String?
}

struct CaptureResponse: Decodable {
    let success: Bool
    let title: String?
    let vaultPath: String?
}

// MARK: - Error Types

struct APIErrorResponse: Decodable {
    let error: String
    let message: String?
}

enum APIError: Error, LocalizedError {
    case requestFailed(statusCode: Int, message: String)
    case networkError(Error)
    case decodingError(Error)
    case serverUnreachable

    var errorDescription: String? {
        switch self {
        case .requestFailed(let statusCode, let message):
            return "Request failed (\(statusCode)): \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .serverUnreachable:
            return "Cannot reach the server. Check your network connection and Tailscale status."
        }
    }
}
