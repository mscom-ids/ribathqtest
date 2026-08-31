import SwiftUI

@main
struct RibathMentorApp: App {
    @StateObject private var session = SessionController()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task { await session.restore() }
        }
    }
}
