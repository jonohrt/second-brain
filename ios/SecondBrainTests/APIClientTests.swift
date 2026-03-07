import XCTest
@testable import SecondBrain

// MARK: - Mock URL Protocol

final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            XCTFail("No request handler set")
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

// MARK: - Tests

final class APIClientTests: XCTestCase {

    var client: APIClient!
    var session: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        session = URLSession(configuration: config)
        client = APIClient(
            baseURL: URL(string: "http://localhost:3000")!,
            apiToken: "test-token",
            urlSession: session
        )
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    // MARK: - ask() tests

    func testAskWithValidResponseDecodesCorrectly() async throws {
        let json = """
        {"answer":"42","sources":[{"type":"vault","path":"notes/note.md","title":"My Note","similarity":0.82}],"route":"brain","model":"qwen"}
        """.data(using: .utf8)!

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertTrue(request.url!.path.hasSuffix("/ask"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")

            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        let result = try await client.ask(text: "What is the meaning of life?")
        XCTAssertEqual(result.answer, "42")
        XCTAssertEqual(result.sources?.first?.type, "vault")
        XCTAssertEqual(result.sources?.first?.path, "notes/note.md")
        XCTAssertEqual(result.sources?.first?.title, "My Note")
        XCTAssertEqual(result.route, "brain")
        XCTAssertEqual(result.model, "qwen")
    }

    func testAskWithWebSourceDecodesCorrectly() async throws {
        let json = """
        {"answer":"Paris","sources":[{"type":"web","url":"https://example.com","title":"Example"}],"route":"web","model":"qwen"}
        """.data(using: .utf8)!

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        let result = try await client.ask(text: "What is the capital of France?")
        XCTAssertEqual(result.answer, "Paris")
        XCTAssertEqual(result.sources?.first?.type, "web")
        XCTAssertEqual(result.sources?.first?.url, "https://example.com")
        XCTAssertEqual(result.sources?.first?.title, "Example")
        XCTAssertNil(result.sources?.first?.path)
    }

    func testAskWith401ThrowsRequestFailed() async {
        MockURLProtocol.requestHandler = { request in
            let json = """
            {"error":"Unauthorized","message":"Invalid token"}
            """.data(using: .utf8)!
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 401,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        do {
            _ = try await client.ask(text: "test")
            XCTFail("Expected error")
        } catch let error as APIError {
            if case .requestFailed(let statusCode, let message) = error {
                XCTAssertEqual(statusCode, 401)
                XCTAssertTrue(message.contains("Invalid token"))
            } else {
                XCTFail("Expected requestFailed, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAskWith500ThrowsRequestFailed() async {
        MockURLProtocol.requestHandler = { request in
            let json = """
            {"error":"Internal Server Error"}
            """.data(using: .utf8)!
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 500,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        do {
            _ = try await client.ask(text: "test")
            XCTFail("Expected error")
        } catch let error as APIError {
            if case .requestFailed(let statusCode, _) = error {
                XCTAssertEqual(statusCode, 500)
            } else {
                XCTFail("Expected requestFailed, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAskWithMalformedJSONThrowsDecodingError() async {
        MockURLProtocol.requestHandler = { request in
            let data = "not json".data(using: .utf8)!
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200,
                httpVersion: nil, headerFields: nil
            )!
            return (response, data)
        }

        do {
            _ = try await client.ask(text: "test")
            XCTFail("Expected error")
        } catch let error as APIError {
            if case .decodingError = error {
                // Expected
            } else {
                XCTFail("Expected decodingError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - capture() tests

    func testCaptureWithValidResponseDecodesCorrectly() async throws {
        let json = """
        {"success":true,"title":"My Note","vaultPath":"inbox/my-note.md"}
        """.data(using: .utf8)!

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertTrue(request.url!.path.hasSuffix("/capture"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")

            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        let result = try await client.capture(text: "Remember to buy milk")
        XCTAssertTrue(result.success)
        XCTAssertEqual(result.title, "My Note")
        XCTAssertEqual(result.vaultPath, "inbox/my-note.md")
    }

    func testCaptureWithErrorResponseThrowsRequestFailed() async {
        MockURLProtocol.requestHandler = { request in
            let json = """
            {"error":"Bad Request"}
            """.data(using: .utf8)!
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 400,
                httpVersion: nil, headerFields: nil
            )!
            return (response, json)
        }

        do {
            _ = try await client.capture(text: "test")
            XCTFail("Expected error")
        } catch let error as APIError {
            if case .requestFailed(let statusCode, _) = error {
                XCTAssertEqual(statusCode, 400)
            } else {
                XCTFail("Expected requestFailed, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }
}
