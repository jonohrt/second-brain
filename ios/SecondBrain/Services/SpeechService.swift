import AVFoundation
import NaturalLanguage

final class SpeechService: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private(set) var isSpeaking = false
    var onFinished: (() -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    // MARK: - Public API

    func speak(_ text: String) {
        stop()
        let sentences = splitIntoSentences(text)
        guard !sentences.isEmpty else { return }
        isSpeaking = true
        for sentence in sentences {
            let utterance = AVSpeechUtterance(string: sentence)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
        }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    /// Splits text into sentences using NLTokenizer. Internal for testability.
    func splitIntoSentences(_ text: String) -> [String] {
        let tokenizer = NLTokenizer(unit: .sentence)
        tokenizer.string = text
        var sentences: [String] = []
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            let sentence = String(text[range])
            if !sentence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                sentences.append(sentence)
            }
            return true
        }
        return sentences
    }

    // MARK: - AVSpeechSynthesizerDelegate

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        // Only mark as finished when synthesizer has no more queued utterances
        if !synthesizer.isSpeaking {
            isSpeaking = false
            onFinished?()
        }
    }
}
