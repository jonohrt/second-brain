import SwiftUI

struct ContentView: View {
    @State private var viewModel = AppViewModel()
    @FocusState private var isEditorFocused: Bool
    @Namespace private var topID

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Second Brain")
                    .font(.title2.bold())
                Spacer()
                Button {
                    viewModel.toggleTTS()
                } label: {
                    Image(systemName: viewModel.isTTSEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.title3)
                        .foregroundColor(viewModel.isTTSEnabled ? .blue : .secondary)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 4)

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

            // Response area — takes all available space
            ScrollViewReader { proxy in
                ScrollView {
                    Color.clear.frame(height: 0).id("top")
                    if !viewModel.answer.isEmpty {
                        Text(viewModel.answer)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()

                        // Vault source attribution
                        if !viewModel.vaultSources.isEmpty {
                            Divider()
                                .padding(.horizontal)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Sources")
                                    .font(.caption.bold())
                                    .foregroundColor(.secondary)
                                ForEach(viewModel.vaultSources) { source in
                                    HStack(spacing: 4) {
                                        Image(systemName: "doc.text")
                                        Text(source.title ?? source.path ?? "Unknown")
                                    }
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                }
                            }
                            .padding(.horizontal)
                            .padding(.bottom, 8)
                        }
                    } else if !viewModel.isLoading {
                        Text("Ask a question or record a voice note")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .padding(.top, 80)
                    }
                }
                .onChange(of: viewModel.answer) {
                    withAnimation {
                        proxy.scrollTo("top", anchor: .top)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)

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

            // Loading indicator
            if viewModel.isLoading {
                ProgressView("Thinking...")
                    .padding(.vertical, 8)
            }

            // Transcribing indicator
            if viewModel.isTranscribing {
                ProgressView("Transcribing...")
                    .padding(.vertical, 8)
            }

            Divider()
                .padding(.top, 8)

            // Input area — compact at bottom
            HStack(alignment: .bottom, spacing: 12) {
                // Record button
                RecordButton(
                    isRecording: viewModel.isRecording,
                    isDisabled: !viewModel.isWhisperReady,
                    onStart: { viewModel.startRecording() },
                    onStop: { viewModel.stopRecording() }
                )
                .frame(width: 56, height: 56)

                // Text input + send/stop
                VStack(spacing: 6) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $viewModel.transcription)
                            .focused($isEditorFocused)
                            .frame(minHeight: 40, maxHeight: 80)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                            .overlay(alignment: .topTrailing) {
                                if !viewModel.transcription.isEmpty {
                                    Button {
                                        viewModel.transcription = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(8)
                                }
                            }
                        if viewModel.transcription.isEmpty {
                            Text("Ask anything...")
                                .foregroundColor(Color(.placeholderText))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                    }

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
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .onTapGesture {
            isEditorFocused = false
        }
        .task {
            await viewModel.initializeWhisper()
        }
    }
}
