import Foundation
import WhisperKit

class TranscriptionService {
    private var whisperKit: WhisperKit?

    /// Whether the WhisperKit model has been loaded and is ready for transcription.
    var isReady: Bool { whisperKit != nil }

    /// Initializes WhisperKit. Model is cached automatically by WhisperKit after first download.
    func initialize() async throws {
        let config = WhisperKitConfig(model: "base")
        whisperKit = try await WhisperKit(config)
    }

    /// Transcribes an audio file at the given URL to text.
    /// WhisperKit must be initialized first via `initialize()`.
    func transcribe(audioURL: URL) async throws -> String {
        guard let pipe = whisperKit else {
            throw TranscriptionError.notInitialized
        }
        let results = try await pipe.transcribe(audioPath: audioURL.path)
        let text = results.first?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // WhisperKit emits "[blank audio]" for silence — strip it out
        let cleaned = text.replacingOccurrences(of: "[blank audio]", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned
    }
}

enum TranscriptionError: Error, LocalizedError {
    case notInitialized
    case transcriptionFailed(String)

    var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "Speech model not loaded. Please wait for setup to complete."
        case .transcriptionFailed(let reason):
            return "Transcription failed: \(reason)"
        }
    }
}
