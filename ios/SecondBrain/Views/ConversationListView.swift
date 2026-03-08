import SwiftUI

private func relativeTime(_ date: Date) -> String {
    let seconds = Int(-date.timeIntervalSinceNow)
    if seconds < 60 { return "Just now" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    if days < 7 { return "\(days)d ago" }
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter.string(from: date)
}

struct ConversationListView: View {
    @Bindable var viewModel: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var isEditing = false
    @State private var selectedIds: Set<String> = []

    private var allSelected: Bool {
        !viewModel.conversations.isEmpty && selectedIds.count == viewModel.conversations.count
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoadingConversations {
                    ProgressView("Loading...")
                } else if viewModel.conversations.isEmpty {
                    ContentUnavailableView(
                        "No Conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Start a new conversation to get going.")
                    )
                } else {
                    VStack(spacing: 0) {
                        List {
                            if isEditing {
                                Button {
                                    if allSelected {
                                        selectedIds.removeAll()
                                    } else {
                                        selectedIds = Set(viewModel.conversations.map { $0.id })
                                    }
                                } label: {
                                    HStack {
                                        Image(systemName: allSelected ? "checkmark.circle.fill" : "circle")
                                            .foregroundColor(allSelected ? .accentColor : .secondary)
                                        Text("Select All")
                                            .foregroundColor(.primary)
                                    }
                                }
                                #if os(macOS)
                                .buttonStyle(.plain)
                                #endif
                            }

                            ForEach(viewModel.conversations) { conversation in
                                if isEditing {
                                    Button {
                                        toggleSelection(conversation.id)
                                    } label: {
                                        HStack {
                                            Image(systemName: selectedIds.contains(conversation.id) ? "checkmark.circle.fill" : "circle")
                                                .foregroundColor(selectedIds.contains(conversation.id) ? .accentColor : .secondary)
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(conversation.title ?? "Untitled")
                                                    .font(.body)
                                                    .foregroundColor(.primary)
                                                    .lineLimit(1)
                                                Text(relativeTime(conversation.updatedAt))
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                    }
                                    #if os(macOS)
                                    .buttonStyle(.plain)
                                    #endif
                                } else {
                                    Button {
                                        Task {
                                            await viewModel.openConversation(conversation)
                                            dismiss()
                                        }
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(conversation.title ?? "Untitled")
                                                .font(.body)
                                                .foregroundColor(.primary)
                                                .lineLimit(1)
                                            Text(relativeTime(conversation.updatedAt))
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    #if os(macOS)
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button("Delete", role: .destructive) {
                                            if let index = viewModel.conversations.firstIndex(where: { $0.id == conversation.id }) {
                                                let toDelete = viewModel.conversations[index]
                                                viewModel.conversations.remove(at: index)
                                                Task { await viewModel.deleteConversation(toDelete) }
                                            }
                                        }
                                    }
                                    #endif
                                }
                            }
                            .onDelete { indexSet in
                                let toDelete = indexSet.map { viewModel.conversations[$0] }
                                viewModel.conversations.remove(atOffsets: indexSet)
                                for conversation in toDelete {
                                    Task { await viewModel.deleteConversation(conversation) }
                                }
                            }
                        }

                        if isEditing && !selectedIds.isEmpty {
                            Button(role: .destructive) {
                                let toDelete = viewModel.conversations.filter { selectedIds.contains($0.id) }
                                selectedIds.removeAll()
                                isEditing = false
                                Task { await viewModel.deleteConversations(toDelete) }
                            } label: {
                                Text("Delete (\(selectedIds.count))")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.red)
                            .padding()
                        }
                    }
                }
            }
            .navigationTitle("Conversations")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(isEditing ? "Done" : "Close") {
                        if isEditing {
                            isEditing = false
                            selectedIds.removeAll()
                        } else {
                            dismiss()
                        }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    if isEditing {
                        EmptyView()
                    } else {
                        HStack {
                            if !viewModel.conversations.isEmpty {
                                Button("Select") {
                                    isEditing = true
                                }
                            }
                            Button {
                                viewModel.startNewConversation()
                                dismiss()
                            } label: {
                                Image(systemName: "plus")
                            }
                        }
                    }
                }
            }
            .task {
                await viewModel.loadConversations()
            }
        }
    }

    private func toggleSelection(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }
}
