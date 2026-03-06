import SwiftUI

struct ContentView: View {
    @State private var viewModel = AppViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                // Setup message (WhisperKit model download)
                if let setupMessage = viewModel.setupMessage {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text(setupMessage)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                }

                // Response area (RESP-01)
                if !viewModel.answer.isEmpty {
                    ScrollView {
                        Text(viewModel.answer)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.systemGray6))
                    )
                    .frame(maxHeight: 300)
                    .padding(.horizontal)
                }

                // Error area (RESP-02)
                if let errorMessage = viewModel.error {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.red)
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundColor(.red)
                        Spacer()
                        Button("Retry") {
                            Task { await viewModel.retry() }
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.red.opacity(0.1))
                    )
                    .padding(.horizontal)
                }

                Spacer()

                // Transcription editor (VOICE-04)
                VStack(spacing: 8) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $viewModel.transcription)
                            .frame(minHeight: 80, maxHeight: 120)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                        if viewModel.transcription.isEmpty {
                            Text("Tap record or type a question...")
                                .foregroundColor(Color(.placeholderText))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                    }

                    Button {
                        Task { await viewModel.sendQuestion() }
                    } label: {
                        Text("Send")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        viewModel.transcription
                            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || viewModel.isLoading
                    )
                }
                .padding(.horizontal)

                // Loading indicator (VOICE-03)
                if viewModel.isLoading {
                    ProgressView("Thinking...")
                }

                // Transcribing indicator
                if viewModel.isTranscribing {
                    ProgressView("Transcribing...")
                }

                // Record button (VOICE-01)
                RecordButton(
                    isRecording: viewModel.isRecording,
                    isDisabled: !viewModel.isWhisperReady,
                    onStart: { viewModel.startRecording() },
                    onStop: { viewModel.stopRecording() }
                )
                .padding(.bottom, 24)
            }
            .navigationTitle("Second Brain")
            .task {
                await viewModel.initializeWhisper()
            }
        }
    }
}
