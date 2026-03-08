import Foundation

// MARK: - Request Types

struct AskRequest: Encodable {
    let text: String
    let conversation_id: String?
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
    let conversation_id: String?
}

struct CaptureResponse: Decodable {
    let success: Bool
    let title: String?
    let vaultPath: String?
}

// MARK: - Conversation Types

struct ConversationSummary: Decodable, Identifiable {
    let id: String
    let title: String?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        let createdStr = try container.decode(String.self, forKey: .createdAt)
        let updatedStr = try container.decode(String.self, forKey: .updatedAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        createdAt = formatter.date(from: createdStr) ?? Date()
        updatedAt = formatter.date(from: updatedStr) ?? Date()
    }
}

struct ConversationsResponse: Decodable {
    let conversations: [ConversationSummary]
}

struct ChatMessage: Decodable, Identifiable, Equatable {
    let id: String
    let conversationId: String
    let role: String
    let content: String
    let metadata: [String: AnyCodable]?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, role, content, metadata, conversationId, createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        role = try container.decode(String.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        metadata = try container.decodeIfPresent([String: AnyCodable].self, forKey: .metadata)
        let createdStr = try container.decode(String.self, forKey: .createdAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        createdAt = formatter.date(from: createdStr) ?? Date()
    }

    /// Local-only initializer for optimistic UI updates
    init(id: String = UUID().uuidString, conversationId: String, role: String, content: String, createdAt: Date = Date()) {
        self.id = id
        self.conversationId = conversationId
        self.role = role
        self.content = content
        self.metadata = nil
        self.createdAt = createdAt
    }

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id
    }
}

struct MessagesResponse: Decodable {
    let messages: [ChatMessage]
}

/// Type-erased Codable wrapper for JSON values
struct AnyCodable: Decodable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) { value = str }
        else if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else { value = "" }
    }
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
