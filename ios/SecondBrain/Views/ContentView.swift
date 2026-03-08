import SwiftUI

struct ContentView: View {
    @State private var viewModel = AppViewModel()
    @FocusState private var isEditorFocused: Bool
    @State private var showConversationList = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button {
                    showConversationList = true
                } label: {
                    Image(systemName: "list.bullet")
                        .font(.title3)
                }

                Spacer()

                Text(viewModel.currentConversationId != nil ? "Conversation" : "New Chat")
                    .font(.headline)

                Spacer()

                Button {
                    viewModel.toggleTTS()
                } label: {
                    Image(systemName: viewModel.isTTSEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.title3)
                        .foregroundColor(viewModel.isTTSEnabled ? .blue : .secondary)
                }

                Button {
                    viewModel.startNewConversation()
                } label: {
                    Image(systemName: "plus.bubble")
                        .font(.title3)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 4)

            #if os(iOS)
            // Setup message (WhisperKit model download)
            if let setupMessage = viewModel.setupMessage {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(setupMessage)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            #endif

            // Chat messages area
            ScrollViewReader { proxy in
                ScrollView {
                    if viewModel.messages.isEmpty && !viewModel.isLoading {
                        #if os(iOS)
                        let emptyText = "Ask a question or record a voice note"
                        #else
                        let emptyText = "Ask a question"
                        #endif
                        Text(emptyText)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 80)
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(viewModel.messages) { message in
                                ChatBubbleView(
                                    message: message,
                                    sources: message.role == "assistant" && message.id == viewModel.messages.last(where: { $0.role == "assistant" })?.id
                                        ? viewModel.vaultSources
                                        : []
                                )
                                .id(message.id)
                            }

                            if viewModel.isLoading {
                                HStack {
                                    ProgressView()
                                    Text("Thinking...")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                    Spacer()
                                }
                                .padding(.horizontal)
                                .id("loading")
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                    }
                }
                #if os(iOS)
                .scrollDismissesKeyboard(.interactively)
                #endif
                .onChange(of: viewModel.messages.count) {
                    if let lastId = viewModel.messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: viewModel.isLoading) {
                    if viewModel.isLoading {
                        withAnimation {
                            proxy.scrollTo("loading", anchor: .bottom)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            #if os(iOS)
            .background(Color(.systemGray6))
            #else
            .background(Color(nsColor: .controlBackgroundColor))
            #endif

            // Error area
            if let errorMessage = viewModel.error {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.red)
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        viewModel.retry()
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }

            #if os(iOS)
            // Transcribing indicator
            if viewModel.isTranscribing {
                ProgressView("Transcribing...")
                    .padding(.vertical, 8)
            }
            #endif

            Divider()
                .padding(.top, 8)

            // Input area
            HStack(alignment: .bottom, spacing: 12) {
                #if os(iOS)
                RecordButton(
                    isRecording: viewModel.isRecording,
                    isDisabled: !viewModel.isWhisperReady,
                    onStart: { viewModel.startRecording() },
                    onStop: { viewModel.stopRecording() }
                )
                .frame(width: 56, height: 56)
                #endif

                VStack(spacing: 6) {
                    #if os(macOS)
                    HStack {
                        TextField("Ask anything...", text: $viewModel.transcription)
                            .focused($isEditorFocused)
                            .textFieldStyle(.plain)
                            .font(.body)
                            .padding(10)
                            .onSubmit {
                                viewModel.sendQuestion()
                            }

                        if !viewModel.transcription.isEmpty {
                            Button {
                                viewModel.transcription = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                            .buttonStyle(.plain)
                            .padding(.trailing, 8)
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                    )
                    #else
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $viewModel.transcription)
                            .focused($isEditorFocused)
                            .frame(minHeight: 40, maxHeight: 80)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )
                            .overlay(alignment: .topTrailing) {
                                if !viewModel.transcription.isEmpty {
                                    Button {
                                        viewModel.transcription = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                    .buttonStyle(.plain)
                                    .padding(8)
                                }
                            }
                        if viewModel.transcription.isEmpty {
                            Text("Ask anything...")
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                    }
                    #endif

                    if viewModel.isLoading {
                        Button {
                            viewModel.cancelRequest()
                        } label: {
                            Label("Stop", systemImage: "stop.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    } else {
                        Button {
                            isEditorFocused = false
                            viewModel.sendQuestion()
                        } label: {
                            Text("Send")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            viewModel.transcription
                                .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                        #if os(macOS)
                        .keyboardShortcut(.return, modifiers: .command)
                        #endif
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        #if os(iOS)
        .onTapGesture {
            isEditorFocused = false
        }
        #endif
        .sheet(isPresented: $showConversationList) {
            ConversationListView(viewModel: viewModel)
            #if os(macOS)
                .frame(minWidth: 300, minHeight: 400)
            #endif
        }
        #if os(iOS)
        .task {
            await viewModel.initializeWhisper()
        }
        #endif
    }
}
