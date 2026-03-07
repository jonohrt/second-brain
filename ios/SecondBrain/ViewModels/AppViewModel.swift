import Foundation
import Observation

@Observable
@MainActor
class AppViewModel {
    // MARK: - Published State

    /// Editable transcription text (bound to TextEditor)
    var transcription: String = ""

    /// LLM response text
    var answer: String = ""

    /// Whether the mic is actively recording
    var isRecording: Bool = false

    /// Whether WhisperKit is transcribing audio to text
    var isTranscribing: Bool = false

    /// Whether an API request is in flight (VOICE-03)
    var isLoading: Bool = false

    /// User-visible error message (RESP-02)
    var error: String? = nil

    /// Whether WhisperKit has finished downloading and loading the model
    var isWhisperReady: Bool = false

    /// First-launch setup message shown during WhisperKit model download
    var setupMessage: String? = "Downloading speech model..."

    // MARK: - Private Services

    private let apiClient: APIClient
    private let recorder: AudioRecorder
    private let transcriber: TranscriptionService

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

    /// Downloads and initializes the WhisperKit model. Call once on app launch.
    func initializeWhisper() async {
        setupMessage = "Downloading speech model..."
        do {
            try await transcriber.initialize()
            isWhisperReady = true
            setupMessage = nil
        } catch {
            setupMessage = "Failed to load speech model: \(error.localizedDescription)"
        }
    }

    // MARK: - Recording

    /// Starts recording from the microphone. Requires WhisperKit to be ready.
    func startRecording() {
        guard isWhisperReady, !isRecording else { return }
        answer = ""
        error = nil
        do {
            _ = try recorder.startRecording()
            isRecording = true
        } catch {
            self.error = "Failed to start recording: \(error.localizedDescription)"
        }
    }

    /// Stops recording and begins transcription.
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

    /// Sends the current transcription to the /ask endpoint and populates the answer.
    func sendQuestion() async {
        let trimmed = transcription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isLoading = true
        error = nil
        do {
            let response = try await apiClient.ask(text: trimmed)
            answer = response.answer
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    /// Retries the last question.
    func retry() async {
        await sendQuestion()
    }
}
