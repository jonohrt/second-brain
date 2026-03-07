import Foundation

struct APIClient {
    let baseURL: URL
    let apiToken: String
    let urlSession: URLSession

    /// Convenience init using AppConfig defaults
    init() {
        self.baseURL = AppConfig.serverURL
        self.apiToken = AppConfig.apiToken
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = AppConfig.requestTimeout
        config.timeoutIntervalForResource = AppConfig.requestTimeout
        self.urlSession = URLSession(configuration: config)
    }

    /// Explicit init for testing with custom URL, token, and session
    init(baseURL: URL, apiToken: String, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.apiToken = apiToken
        self.urlSession = urlSession
    }

    // MARK: - Public API

    func ask(text: String) async throws -> AskResponse {
        try await performRequest(method: "POST", path: "/ask", body: AskRequest(text: text))
    }

    func capture(
        text: String,
        title: String? = nil,
        type: String? = nil,
        tags: [String]? = nil
    ) async throws -> CaptureResponse {
        try await performRequest(
            method: "POST",
            path: "/capture",
            body: CaptureRequest(text: text, title: title, type: type, tags: tags)
        )
    }

    // MARK: - Private

    private func performRequest<Body: Encodable, Response: Decodable>(
        method: String,
        path: String,
        body: Body
    ) async throws -> Response {
        let url = URL(string: path, relativeTo: baseURL)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = AppConfig.requestTimeout

        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let urlError as URLError {
            if urlError.code == .timedOut ||
               urlError.code == .cannotConnectToHost ||
               urlError.code == .cannotFindHost ||
               urlError.code == .networkConnectionLost {
                throw APIError.serverUnreachable
            }
            throw APIError.networkError(urlError)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverUnreachable
        }

        guard httpResponse.statusCode == 200 else {
            let message: String
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                message = errorResponse.message ?? errorResponse.error
            } else {
                message = "HTTP \(httpResponse.statusCode)"
            }
            throw APIError.requestFailed(statusCode: httpResponse.statusCode, message: message)
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
