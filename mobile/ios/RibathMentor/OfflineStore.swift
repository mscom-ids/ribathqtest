import Foundation
import SQLite3

actor OfflineStore {
    private var db: OpaquePointer?

    init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let path = directory.appendingPathComponent("ribath-mentor-v1.sqlite").path
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { return }
        execute("PRAGMA journal_mode=WAL")
        execute("PRAGMA foreign_keys=ON")
        execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        execute("CREATE TABLE IF NOT EXISTS profile (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL)")
        execute("CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, standard TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)")
        execute("CREATE TABLE IF NOT EXISTS tombstones (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(entity_type, entity_id))")
        execute("CREATE TABLE IF NOT EXISTS hifz_entries (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, entry_date TEXT NOT NULL, mode TEXT NOT NULL, surah_name TEXT NOT NULL, start_v INTEGER NOT NULL, end_v INTEGER NOT NULL, notes TEXT, version INTEGER NOT NULL DEFAULT 0)")
        execute("CREATE INDEX IF NOT EXISTS idx_hifz_entries_student_date ON hifz_entries(student_id,entry_date DESC)")
        execute("CREATE TABLE IF NOT EXISTS pending_hifz_mutations (mutation_id TEXT PRIMARY KEY, student_id TEXT NOT NULL, entry_date TEXT NOT NULL, mode TEXT NOT NULL, surah_name TEXT NOT NULL, start_v INTEGER NOT NULL, end_v INTEGER NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        execute("CREATE INDEX IF NOT EXISTS idx_pending_hifz_status_created ON pending_hifz_mutations(status,created_at)")
    }

    deinit { sqlite3_close(db) }

    func replace(with bootstrap: BootstrapResponse) throws {
        try transaction {
            try run("DELETE FROM profile")
            try run("DELETE FROM students")
            try run("DELETE FROM tombstones")
            try run("DELETE FROM hifz_entries")
            try run("INSERT INTO profile(singleton,id,name,email,role) VALUES(1,?,?,?,?)", [bootstrap.profile.id, bootstrap.profile.name, bootstrap.profile.email, bootstrap.profile.role])
            for student in bootstrap.students { try upsert(student: student, version: 0) }
            for entry in bootstrap.hifzEntries { try upsert(entry: entry) }
            try setMetadata("academic_year", bootstrap.academicYear.name)
            try setMetadata("sync_cursor", String(bootstrap.syncCursor))
        }
    }

    func apply(_ response: SyncResponse) throws {
        try transaction {
            for change in response.changes {
                if change.entityType == "student" {
                    if change.operation == "delete" {
                        try run("DELETE FROM students WHERE id=?", [change.entityId])
                        try run("INSERT OR REPLACE INTO tombstones(entity_type,entity_id,version) VALUES('student',?,?)", [change.entityId, change.entityVersion])
                    } else if change.operation == "upsert", let payload = change.payload {
                        let id = payload["adm_no"]?.string ?? payload["id"]?.string ?? change.entityId
                        let student = StudentSummary(admNo: id, name: payload["name"]?.string ?? "Student", standard: payload["standard"]?.string)
                        try upsert(student: student, version: change.entityVersion)
                    }
                } else if change.entityType == "hifz_log" {
                    if change.operation == "delete" {
                        try run("DELETE FROM hifz_entries WHERE id=?", [change.entityId])
                    } else if change.operation == "upsert", let payload = change.payload {
                        let entry = HifzEntrySummary(
                            id: payload["id"]?.string ?? change.entityId,
                            studentId: payload["student_id"]?.string ?? "",
                            entryDate: payload["entry_date"]?.string ?? "",
                            mode: payload["mode"]?.string ?? "",
                            surahName: payload["surah_name"]?.string ?? "",
                            startVerse: payload["start_v"]?.integer ?? 0,
                            endVerse: payload["end_v"]?.integer ?? 0,
                            notes: payload["notes"]?.string,
                            version: change.entityVersion
                        )
                        try upsert(entry: entry)
                    }
                }
            }
            try setMetadata("sync_cursor", String(response.nextCursor))
        }
    }

    func snapshot(cached: Bool) throws -> HomeSnapshot? {
        guard let row = try first("SELECT id,name,email,role FROM profile WHERE singleton=1") else { return nil }
        let profile = MentorProfile(id: row[0], email: row[2], name: row[1], role: row[3])
        let students = try rows("SELECT id,name,standard FROM students ORDER BY name").map {
            StudentSummary(admNo: $0[0], name: $0[1], standard: $0[2])
        }
        let entries = try rows("SELECT id,student_id,entry_date,mode,surah_name,start_v,end_v,notes,version FROM hifz_entries ORDER BY entry_date DESC,id DESC").map {
            HifzEntrySummary(id: $0[0], studentId: $0[1], entryDate: $0[2], mode: $0[3], surahName: $0[4], startVerse: Int($0[5]) ?? 0, endVerse: Int($0[6]) ?? 0, notes: $0[7].isEmpty ? nil : $0[7], version: Int64($0[8]) ?? 0)
        }
        let pending = Int(try first("SELECT COUNT(*) FROM pending_hifz_mutations WHERE status IN ('pending','rejected')")?.first ?? "0") ?? 0
        return HomeSnapshot(profile: profile, academicYear: try metadata("academic_year") ?? "", students: students, hifzEntries: entries, pendingDraftCount: pending, cursor: cursor(), cached: cached)
    }

    func queue(_ draft: HifzDraft) throws {
        try run(
            "INSERT INTO pending_hifz_mutations(mutation_id,student_id,entry_date,mode,surah_name,start_v,end_v,notes,status) VALUES(?,?,?,?,?,?,?,?, 'pending')",
            [draft.mutationId, draft.studentId, draft.entryDate, draft.mode, draft.surahName, Int64(draft.startVerse), Int64(draft.endVerse), draft.notes ?? ""]
        )
    }

    func pendingDrafts() throws -> [HifzDraft] {
        try rows("SELECT mutation_id,student_id,entry_date,mode,surah_name,start_v,end_v,notes FROM pending_hifz_mutations WHERE status='pending' ORDER BY created_at,mutation_id").map {
            HifzDraft(mutationId: $0[0], studentId: $0[1], entryDate: $0[2], mode: $0[3], surahName: $0[4], startVerse: Int($0[5]) ?? 0, endVerse: Int($0[6]) ?? 0, notes: $0[7].isEmpty ? nil : $0[7])
        }
    }

    func markApplied(mutationId: String, entry: HifzEntrySummary) throws {
        try transaction {
            try upsert(entry: entry)
            try run("DELETE FROM pending_hifz_mutations WHERE mutation_id=?", [mutationId])
        }
    }

    func markRejected(mutationId: String, error: String) throws {
        try run("UPDATE pending_hifz_mutations SET status='rejected',last_error=? WHERE mutation_id=?", [String(error.prefix(1000)), mutationId])
    }

    func cursor() -> Int64 { (try? metadata("sync_cursor")).flatMap(Int64.init) ?? 0 }

    private func upsert(student: StudentSummary, version: Int64) throws {
        try run("INSERT OR REPLACE INTO students(id,name,standard,version) VALUES(?,?,?,?)", [student.admNo, student.name, student.standard ?? "", version])
    }

    private func upsert(entry: HifzEntrySummary) throws {
        try run("INSERT OR REPLACE INTO hifz_entries(id,student_id,entry_date,mode,surah_name,start_v,end_v,notes,version) VALUES(?,?,?,?,?,?,?,?,?)", [entry.id, entry.studentId, entry.entryDate, entry.mode, entry.surahName, Int64(entry.startVerse), Int64(entry.endVerse), entry.notes ?? "", entry.version])
    }

    private func setMetadata(_ key: String, _ value: String) throws { try run("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)", [key, value]) }
    private func metadata(_ key: String) throws -> String? { try first("SELECT value FROM metadata WHERE key=?", [key])?.first }

    private func transaction(_ body: () throws -> Void) throws {
        try run("BEGIN IMMEDIATE")
        do { try body(); try run("COMMIT") } catch { try? run("ROLLBACK"); throw error }
    }

    private func execute(_ sql: String) { sqlite3_exec(db, sql, nil, nil, nil) }

    private func run(_ sql: String, _ values: [Any] = []) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw SQLiteError() }
        defer { sqlite3_finalize(statement) }
        bind(values, to: statement)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw SQLiteError() }
    }

    private func first(_ sql: String, _ values: [Any] = []) throws -> [String]? { try rows(sql, values).first }

    private func rows(_ sql: String, _ values: [Any] = []) throws -> [[String]] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw SQLiteError() }
        defer { sqlite3_finalize(statement) }
        bind(values, to: statement)
        var result: [[String]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            result.append((0..<sqlite3_column_count(statement)).map { index in
                sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
            })
        }
        return result
    }

    private func bind(_ values: [Any], to statement: OpaquePointer?) {
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            if let integer = value as? Int64 { sqlite3_bind_int64(statement, index, integer) }
            else { sqlite3_bind_text(statement, index, String(describing: value), -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
        }
    }
}

struct SQLiteError: LocalizedError { var errorDescription: String? { "Local data could not be saved" } }
