import Foundation
import Observation

@Observable
@MainActor
class AppViewModel {
    // MARK: - Published State

    /// Editable transcription text (bound to TextEditor)
    var transcription: String = ""

    /// Chat messages for current conversation
    var messages: [ChatMessage] = []

    /// Whether TTS readback is enabled
    var isTTSEnabled: Bool = false

    /// Sources from the last API response
    var currentSources: [AskSource] = []

    /// Vault sources filtered from currentSources
    var vaultSources: [AskSource] { currentSources.filter { $0.type == "vault" } }

    /// Whether TTS is actively speaking
    var isSpeaking: Bool { speechService.isSpeaking }

    /// Whether the mic is actively recording
    var isRecording: Bool = false

    /// Whether WhisperKit is transcribing audio to text
    var isTranscribing: Bool = false

    /// Whether an API request is in flight
    var isLoading: Bool = false

    /// User-visible error message
    var error: String? = nil

    /// Whether WhisperKit has finished downloading and loading the model
    var isWhisperReady: Bool = false

    /// Setup message shown while WhisperKit loads
    var setupMessage: String? = nil

    /// Current conversation ID (nil = no active conversation)
    var currentConversationId: String? = nil

    /// List of conversations for the conversation list screen
    var conversations: [ConversationSummary] = []

    /// Whether we're loading the conversation list
    var isLoadingConversations: Bool = false

    // MARK: - Private

    private let apiClient: APIClient
    private let recorder: AudioRecorder
    private let transcriber: TranscriptionService
    private let speechService = SpeechService()
    private var currentRequestTask: Task<Void, Never>?

    // MARK: - Init

    init(
        apiClient: APIClient = APIClient(),
        recorder: AudioRecorder = AudioRecorder(),
        transcriber: TranscriptionService = TranscriptionService()
    ) {
        self.apiClient = apiClient
        self.recorder = recorder
        self.transcriber = transcriber
    }

    // MARK: - WhisperKit Initialization

    func initializeWhisper() async {
        setupMessage = "Loading speech model..."
        do {
            try await transcriber.initialize()
            isWhisperReady = true
            setupMessage = nil
        } catch {
            setupMessage = nil
            self.error = "Voice unavailable: \(error.localizedDescription)"
        }
    }

    // MARK: - Recording

    func startRecording() {
        speechService.stop()
        guard isWhisperReady, !isRecording else { return }
        error = nil
        do {
            _ = try recorder.startRecording()
            isRecording = true
        } catch {
            self.error = "Failed to start recording: \(error.localizedDescription)"
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        isRecording = false
        guard let url = recorder.stopRecording() else { return }
        isTranscribing = true
        Task {
            do {
                transcription = try await transcriber.transcribe(audioURL: url)
            } catch {
                self.error = "Transcription failed: \(error.localizedDescription)"
            }
            isTranscribing = false
        }
    }

    // MARK: - API

    func sendQuestion() {
        let trimmed = transcription
            .replacingOccurrences(of: "[blank audio]", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isLoading = true
        error = nil
        speechService.stop()

        // Optimistic: show user message immediately
        let userMsg = ChatMessage(
            conversationId: currentConversationId ?? "pending",
            role: "user",
            content: trimmed
        )
        messages.append(userMsg)
        transcription = ""

        currentRequestTask = Task {
            do {
                let response = try await apiClient.ask(text: trimmed, conversationId: currentConversationId)
                guard !Task.isCancelled else { return }

                // Update conversation ID
                if let convId = response.conversation_id {
                    currentConversationId = convId
                }

                currentSources = response.sources ?? []

                // Add assistant message
                let assistantMsg = ChatMessage(
                    conversationId: currentConversationId ?? "",
                    role: "assistant",
                    content: response.answer
                )
                messages.append(assistantMsg)

                if isTTSEnabled {
                    speechService.speak(response.answer)
                }
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
                // Remove optimistic user message on error
                if messages.last?.role == "user" {
                    messages.removeLast()
                }
            }
            isLoading = false
        }
    }

    func cancelRequest() {
        currentRequestTask?.cancel()
        currentRequestTask = nil
        isLoading = false
    }

    func retry() {
        sendQuestion()
    }

    // MARK: - TTS

    func toggleTTS() {
        if speechService.isSpeaking {
            speechService.stop()
            return
        }
        isTTSEnabled.toggle()
        if isTTSEnabled, let lastAssistant = messages.last(where: { $0.role == "assistant" }) {
            speechService.speak(lastAssistant.content)
        }
    }

    // MARK: - Conversations

    func loadConversations() async {
        isLoadingConversations = true
        do {
            conversations = try await apiClient.listConversations()
        } catch {
            self.error = "Failed to load conversations: \(error.localizedDescription)"
        }
        isLoadingConversations = false
    }

    func openConversation(_ conversation: ConversationSummary) async {
        currentConversationId = conversation.id
        messages = []
        isLoading = true
        do {
            messages = try await apiClient.getMessages(conversationId: conversation.id)
        } catch {
            self.error = "Failed to load messages: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func startNewConversation() {
        currentConversationId = nil
        messages = []
        currentSources = []
        error = nil
        transcription = ""
        speechService.stop()
    }

    func deleteConversation(_ conversation: ConversationSummary) async {
        do {
            try await apiClient.deleteConversation(id: conversation.id)
            // List removal already handled by onDelete in the view
            if currentConversationId == conversation.id {
                startNewConversation()
            }
        } catch {
            // Re-add on failure so the row reappears
            conversations.append(conversation)
            conversations.sort { ($0.updatedAt) > ($1.updatedAt) }
            self.error = "Failed to delete conversation: \(error.localizedDescription)"
        }
    }
}
