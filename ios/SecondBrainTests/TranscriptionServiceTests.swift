import XCTest
@testable import SecondBrain

final class TranscriptionServiceTests: XCTestCase {

    func testIsReadyReturnsFalseBeforeInitialization() {
        let service = TranscriptionService()
        XCTAssertFalse(service.isReady, "TranscriptionService should not be ready before initialize()")
    }

    func testTranscribeBeforeInitializeThrowsNotInitialized() async {
        let service = TranscriptionService()
        let dummyURL = FileManager.default.temporaryDirectory.appendingPathComponent("dummy.wav")

        do {
            _ = try await service.transcribe(audioURL: dummyURL)
            XCTFail("Expected TranscriptionError.notInitialized to be thrown")
        } catch let error as TranscriptionError {
            switch error {
            case .notInitialized:
                break // Expected
            default:
                XCTFail("Expected .notInitialized but got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testNotInitializedErrorDescription() {
        let error = TranscriptionError.notInitialized
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription!.contains("Speech model"))
    }

    func testTranscriptionFailedErrorDescription() {
        let error = TranscriptionError.transcriptionFailed("test reason")
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription!.contains("test reason"))
    }
}
