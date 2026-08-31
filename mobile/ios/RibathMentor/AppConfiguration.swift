import Foundation

enum AppConfiguration {
    // The iOS simulator reaches the Mac staging backend through localhost.
    // Replace with the HTTPS staging backend URL in the Staging build config.
    static let mobileAPIBaseURL = URL(string: "http://127.0.0.1:5001/api/mobile")!
    static let appVersion = "0.1.0"
}
