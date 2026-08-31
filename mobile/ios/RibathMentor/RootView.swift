import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionController

    var body: some View {
        switch session.state {
        case .restoring: SetupView(message: "Restoring your saved data…")
        case .signedOut: LoginView()
        case .settingUp(let message): SetupView(message: message)
        case .ready(let snapshot, let syncing): HomeView(snapshot: snapshot, syncing: syncing)
        case .failure(let message, let cached): FailureView(message: message, cached: cached)
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject private var session: SessionController
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Text("Ribath Mentor").font(.largeTitle.bold())
            Text("Secure native access with offline data").foregroundStyle(.secondary)
            TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress).textFieldStyle(.roundedBorder)
            SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
            Button("Sign in") { Task { await session.login(email: email, password: password) } }
                .buttonStyle(.borderedProminent).frame(maxWidth: .infinity).disabled(email.isEmpty || password.isEmpty)
            Spacer()
        }.padding(24)
    }
}

private struct SetupView: View {
    let message: String
    var body: some View {
        VStack(spacing: 18) {
            ProgressView().controlSize(.large)
            Text(message).font(.headline)
            Text("This may take a moment on a new phone").font(.caption).foregroundStyle(.secondary)
        }.padding()
    }
}

private struct HomeView: View {
    @EnvironmentObject private var session: SessionController
    let snapshot: HomeSnapshot
    let syncing: Bool

    var body: some View {
        NavigationStack {
            List {
                if snapshot.cached { Text("Offline — showing saved data").foregroundStyle(.orange) }
                if snapshot.pendingDraftCount > 0 {
                    Text("\(snapshot.pendingDraftCount) Hifz entr\(snapshot.pendingDraftCount == 1 ? "y" : "ies") waiting or needing attention")
                        .foregroundStyle(.orange)
                }
                Section("Students (\(snapshot.students.count))") {
                    ForEach(snapshot.students) { student in
                        NavigationLink {
                            HifzEntryView(
                                student: student,
                                recentEntries: snapshot.hifzEntries.filter { $0.studentId == student.admNo }
                            )
                        } label: {
                            VStack(alignment: .leading) {
                                Text(student.name).font(.headline)
                                Text("\(student.admNo) · \(student.standard ?? "")").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle(snapshot.profile.name)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Sign out") { Task { await session.logout() } } }
                ToolbarItem(placement: .topBarTrailing) { Button(syncing ? "Syncing…" : "Sync") { Task { await session.sync() } }.disabled(syncing) }
            }
        }
    }
}

private struct HifzEntryView: View {
    @EnvironmentObject private var session: SessionController
    @Environment(\.dismiss) private var dismiss
    let student: StudentSummary
    let recentEntries: [HifzEntrySummary]

    @State private var entryDate = Date()
    @State private var mode = "New Verses"
    @State private var surahName = ""
    @State private var startVerse = ""
    @State private var endVerse = ""
    @State private var notes = ""
    @State private var saving = false

    private var valid: Bool {
        guard !surahName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let start = Int(startVerse), let end = Int(endVerse) else { return false }
        return start >= 1 && end >= start && end <= 286
    }

    var body: some View {
        Form {
            Section("New Hifz entry") {
                DatePicker("Date", selection: $entryDate, in: Calendar.current.date(byAdding: .day, value: -6, to: Date())!...Date(), displayedComponents: .date)
                Picker("Activity", selection: $mode) {
                    Text("New verses").tag("New Verses")
                    Text("Revision").tag("Recent Revision")
                }.pickerStyle(.segmented)
                TextField("Surah", text: $surahName)
                TextField("Start verse", text: $startVerse).keyboardType(.numberPad)
                TextField("End verse", text: $endVerse).keyboardType(.numberPad)
                TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(2...4)
                Button(saving ? "Saving…" : "Save entry") {
                    Task { await save() }
                }
                .disabled(!valid || saving)
            }

            if !recentEntries.isEmpty {
                Section("Recent entries") {
                    ForEach(recentEntries.prefix(8)) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(entry.surahName) · \(entry.startVerse)–\(entry.endVerse)").font(.headline)
                            Text("\(entry.entryDate) · \(entry.mode)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(student.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() async {
        guard valid, let start = Int(startVerse), let end = Int(endVerse) else { return }
        saving = true
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let saved = await session.saveHifzDraft(
            studentId: student.admNo,
            entryDate: formatter.string(from: entryDate),
            mode: mode,
            surahName: surahName.trimmingCharacters(in: .whitespacesAndNewlines),
            startVerse: start,
            endVerse: end,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        saving = false
        if saved { dismiss() }
    }
}

private struct FailureView: View {
    @EnvironmentObject private var session: SessionController
    let message: String
    let cached: HomeSnapshot?
    var body: some View {
        VStack(spacing: 16) {
            Text("Couldn’t finish setup").font(.title2.bold())
            Text(message).multilineTextAlignment(.center)
            if let cached { Button("Use saved data") { session.useCached(cached) }.buttonStyle(.borderedProminent) }
            Button("Back to sign in") { session.backToSignIn() }.buttonStyle(.bordered)
        }.padding(24)
    }
}
