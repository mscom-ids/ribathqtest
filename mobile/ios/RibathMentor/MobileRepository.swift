import Foundation

actor MobileRepository {
    private let api = MobileAPIClient()
    private let keychain = KeychainStore()
    private let store = OfflineStore()
    private var accessToken: String?

    func cachedSnapshot() async -> HomeSnapshot? { try? await store.snapshot(cached: true) }

    func login(email: String, password: String) async throws -> HomeSnapshot {
        let installationId = installationIdentifier()
        let response = try await api.login(email: email, password: password, installationId: installationId)
        accessToken = response.accessToken
        try keychain.save(StoredSession(deviceId: response.device.id, refreshToken: response.refreshToken))
        return try await bootstrap(deviceId: response.device.id)
    }

    func restore() async -> HomeSnapshot? {
        guard let session = try? keychain.read() else { return await cachedSnapshot() }
        do {
            let refreshed = try await api.refresh(session)
            accessToken = refreshed.accessToken
            try keychain.save(StoredSession(deviceId: session.deviceId, refreshToken: refreshed.refreshToken))
            return try await bootstrap(deviceId: session.deviceId)
        } catch let error as APIError where error.status == 401 {
            keychain.clear()
            return await cachedSnapshot()
        } catch {
            return await cachedSnapshot()
        }
    }

    func synchronize() async throws -> HomeSnapshot {
        let session = try await ensureAccessSession()
        try await flushHifzDrafts(session: session)
        var more = false
        repeat {
            let response = try await api.sync(accessToken: accessToken!, deviceId: session.deviceId, cursor: await store.cursor())
            try await store.apply(response)
            more = response.hasMore
        } while more
        return try await store.snapshot(cached: false)!
    }

    func saveHifzDraft(
        studentId: String,
        entryDate: String,
        mode: String,
        surahName: String,
        startVerse: Int,
        endVerse: Int,
        notes: String?
    ) async throws -> HomeSnapshot {
        let draft = HifzDraft(
            mutationId: UUID().uuidString.lowercased(),
            studentId: studentId,
            entryDate: entryDate,
            mode: mode,
            surahName: surahName,
            startVerse: startVerse,
            endVerse: endVerse,
            notes: notes
        )
        try await store.queue(draft)
        do {
            let session = try await ensureAccessSession()
            try await flushHifzDrafts(session: session)
            return try await store.snapshot(cached: false)!
        } catch let error as APIError where [400, 403, 409].contains(error.status) {
            throw error
        } catch {
            return try await store.snapshot(cached: true)!
        }
    }

    func logout() async {
        if let session = try? keychain.read() { _ = try? await api.logout(session) }
        accessToken = nil
        keychain.clear()
    }

    private func bootstrap(deviceId: String) async throws -> HomeSnapshot {
        guard let accessToken else { throw APIError(status: 401, message: "Sign in again") }
        let response = try await api.bootstrap(accessToken: accessToken, deviceId: deviceId)
        try await store.replace(with: response)
        return try await store.snapshot(cached: false)!
    }

    private func ensureAccessSession() async throws -> StoredSession {
        guard var session = try keychain.read() else { throw APIError(status: 401, message: "Sign in again") }
        if accessToken == nil {
            let refreshed = try await api.refresh(session)
            accessToken = refreshed.accessToken
            session = StoredSession(deviceId: session.deviceId, refreshToken: refreshed.refreshToken)
            try keychain.save(session)
        }
        return session
    }

    private func flushHifzDrafts(session: StoredSession) async throws {
        for draft in try await store.pendingDrafts() {
            do {
                let response = try await api.submitHifz(
                    accessToken: accessToken!,
                    deviceId: session.deviceId,
                    draft: draft
                )
                try await store.markApplied(mutationId: draft.mutationId, entry: response.entry)
            } catch let error as APIError where [400, 403, 409].contains(error.status) {
                try await store.markRejected(mutationId: draft.mutationId, error: error.message)
            } catch {
                throw error
            }
        }
    }

    private func installationIdentifier() -> String {
        let key = "ribath.installation-id"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let value = UUID().uuidString.lowercased()
        UserDefaults.standard.set(value, forKey: key)
        return value
    }
}
