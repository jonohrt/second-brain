import SwiftUI

struct ChatBubbleView: View {
    let message: ChatMessage
    let sources: [AskSource]

    var isUser: Bool { message.role == "user" }

    private var displayContent: String {
        message.content
            .replacingOccurrences(of: "[blank audio]", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        if displayContent.isEmpty { EmptyView() } else {
        HStack {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(displayContent)
                    .textSelection(.enabled)
                    .padding(12)
                    .background(isUser ? Color.blue : Color(.systemGray5))
                    .foregroundColor(isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                // Source attribution for assistant messages (vault sources only)
                if !isUser && !sources.isEmpty {
                    let vaultSources = sources.filter { $0.type == "vault" }
                    if !vaultSources.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.text")
                            Text(vaultSources.compactMap { $0.title ?? $0.path?.components(separatedBy: "/").last }.joined(separator: ", "))
                                .lineLimit(1)
                        }
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                    }
                }
            }

            if !isUser { Spacer(minLength: 60) }
        }
        }
    }
}
