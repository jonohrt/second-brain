import Foundation

struct AppConfig {
    /// Server base URL -- update to your Mac Mini's Tailscale IP
    static let serverURL = URL(string: "http://100.64.0.1:3000")!

    /// API bearer token -- set this to your real token from the server
    static let apiToken = "CHANGE_ME"

    /// Request timeout in seconds (keeps UI responsive over Tailscale)
    static let requestTimeout: TimeInterval = 60
}
