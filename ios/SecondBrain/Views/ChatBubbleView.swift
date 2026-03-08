import SwiftUI

struct ChatBubbleView: View {
    let message: ChatMessage
    let sources: [AskSource]

    var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .textSelection(.enabled)
                    .padding(12)
                    .background(isUser ? Color.blue : Color(.systemGray5))
                    .foregroundColor(isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                // Source attribution for assistant messages
                if !isUser && !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(sources) { source in
                            HStack(spacing: 4) {
                                Image(systemName: "doc.text")
                                Text(source.title ?? source.path ?? "Unknown")
                            }
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}
