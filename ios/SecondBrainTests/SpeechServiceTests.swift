import XCTest
@testable import SecondBrain

final class SpeechServiceTests: XCTestCase {

    var service: SpeechService!

    override func setUp() {
        super.setUp()
        service = SpeechService()
    }

    override func tearDown() {
        service = nil
        super.tearDown()
    }

    // MARK: - splitIntoSentences tests

    func testSplitMultipleSentences() {
        let result = service.splitIntoSentences("Hello world. How are you?")
        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result[0].contains("Hello world"))
        XCTAssertTrue(result[1].contains("How are you"))
    }

    func testSplitEmptyString() {
        let result = service.splitIntoSentences("")
        XCTAssertEqual(result, [])
    }

    func testSplitSingleSentenceNoPeriod() {
        let result = service.splitIntoSentences("One sentence")
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0], "One sentence")
    }

    func testSplitWithAbbreviation() {
        let result = service.splitIntoSentences("Dr. Smith went home. He rested.")
        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result[0].contains("Dr. Smith"))
        XCTAssertTrue(result[1].contains("He rested"))
    }
}
