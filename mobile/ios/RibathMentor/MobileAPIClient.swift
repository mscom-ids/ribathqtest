import Foundation
import UIKit

actor MobileAPIClient {
    private let baseURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL = AppConfiguration.mobileAPIBaseURL) { self.baseURL = baseURL }

    func login(email: String, password: String, installationId: String) async throws -> LoginResponse {
        try await request(
            path: "/auth/login",
            method: "POST",
            body: LoginRequest(
                email: email.lowercased().trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                installationId: installationId,
                deviceName: UIDevice.current.model,
                appVersion: AppConfiguration.appVersion,
                osVersion: UIDevice.current.systemVersion
            )
        )
    }

    func refresh(_ session: StoredSession) async throws -> RefreshResponse {
        try await request(path: "/auth/refresh", method: "POST", body: RefreshRequest(deviceId: session.deviceId, refreshToken: session.refreshToken))
    }

    func bootstrap(accessToken: String, deviceId: String) async throws -> BootstrapResponse {
        try await request(path: "/bootstrap", method: "GET", accessToken: accessToken, deviceId: deviceId)
    }

    func sync(accessToken: String, deviceId: String, cursor: Int64) async throws -> SyncResponse {
        try await request(path: "/sync?cursor=\(cursor)&limit=250", method: "GET", accessToken: accessToken, deviceId: deviceId)
    }

    func submitHifz(accessToken: String, deviceId: String, draft: HifzDraft) async throws -> HifzMutationResponse {
        try await request(
            path: "/mutations/hifz-entries",
            method: "POST",
            body: draft,
            accessToken: accessToken,
            deviceId: deviceId
        )
    }

    func logout(_ session: StoredSession) async throws -> EmptyResponse {
        try await request(path: "/auth/logout", method: "POST", body: RefreshRequest(deviceId: session.deviceId, refreshToken: session.refreshToken))
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        accessToken: String? = nil,
        deviceId: String? = nil
    ) async throws -> Response {
        var request = URLRequest(url: URL(string: baseURL.absoluteString + path)!)
        request.httpMethod = method
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await send(request: request, accessToken: accessToken, deviceId: deviceId)
    }

    private func request<Response: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        deviceId: String
    ) async throws -> Response {
        var request = URLRequest(url: URL(string: baseURL.absoluteString + path)!)
        request.httpMethod = method
        return try await send(request: request, accessToken: accessToken, deviceId: deviceId)
    }

    private func send<Response: Decodable>(request: URLRequest, accessToken: String?, deviceId: String?) async throws -> Response {
        var request = request
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        if let deviceId { request.setValue(deviceId, forHTTPHeaderField: "x-device-id") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Invalid server response") }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(status: http.statusCode, message: message ?? "Request failed")
        }
        return try decoder.decode(Response.self, from: data)
    }
}

struct EmptyResponse: Decodable { let success: Bool }
struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}
