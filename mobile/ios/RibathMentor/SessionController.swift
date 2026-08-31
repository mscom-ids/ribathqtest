import SwiftUI

@MainActor
final class SessionController: ObservableObject {
    enum State {
        case restoring
        case signedOut
        case settingUp(String)
        case ready(HomeSnapshot, syncing: Bool)
        case failure(String, cached: HomeSnapshot?)
    }

    @Published private(set) var state: State = .restoring
    private let repository = MobileRepository()

    func restore() async {
        guard case .restoring = state else { return }
        let snapshot = await repository.restore()
        state = snapshot.map { .ready($0, syncing: false) } ?? .signedOut
    }

    func login(email: String, password: String) async {
        state = .settingUp("Setting up your mentor data…")
        do { state = .ready(try await repository.login(email: email, password: password), syncing: false) }
        catch { state = .failure(error.localizedDescription, cached: nil) }
    }

    func sync() async {
        guard case .ready(let snapshot, _) = state else { return }
        state = .ready(snapshot, syncing: true)
        do { state = .ready(try await repository.synchronize(), syncing: false) }
        catch { state = .failure(error.localizedDescription, cached: snapshot) }
    }

    func saveHifzDraft(
        studentId: String,
        entryDate: String,
        mode: String,
        surahName: String,
        startVerse: Int,
        endVerse: Int,
        notes: String?
    ) async -> Bool {
        guard case .ready(let snapshot, _) = state else { return false }
        state = .ready(snapshot, syncing: true)
        do {
            let updated = try await repository.saveHifzDraft(
                studentId: studentId,
                entryDate: entryDate,
                mode: mode,
                surahName: surahName,
                startVerse: startVerse,
                endVerse: endVerse,
                notes: notes
            )
            state = .ready(updated, syncing: false)
            return true
        } catch {
            state = .failure(error.localizedDescription, cached: snapshot)
            return false
        }
    }

    func useCached(_ snapshot: HomeSnapshot) { state = .ready(snapshot, syncing: false) }

    func backToSignIn() { state = .signedOut }

    func logout() async { await repository.logout(); state = .signedOut }
}
