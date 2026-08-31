package `in`.ribath.mentor.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

class OfflineDatabase(context: Context) : SQLiteOpenHelper(context, "ribath_mentor_v1.db", null, 8) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE profile (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL)")
        db.execSQL("CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT NOT NULL, standard TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE tombstones (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(entity_type, entity_id))")
        createHifzTables(db)
        createAttendanceTables(db)
        createMentorWorkspaceTables(db)
        createReportTables(db)
        createChatTables(db)
        createFinanceTables(db)
        createStudentDetailTables(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createHifzTables(db)
        if (oldVersion < 3) createAttendanceTables(db)
        if (oldVersion < 4) createMentorWorkspaceTables(db)
        if (oldVersion < 5) createReportTables(db)
        if (oldVersion < 6) createChatTables(db)
        if (oldVersion < 7) createFinanceTables(db)
        if (oldVersion < 8) createStudentDetailTables(db)
    }

    fun replaceBootstrap(payload: JSONObject) {
        writableDatabase.inTransaction {
            delete("profile", null, null)
            delete("students", null, null)
            delete("tombstones", null, null)
            delete("hifz_entries", null, null)

            val profile = payload.getJSONObject("profile")
            insertOrThrow("profile", null, ContentValues().apply {
                put("singleton", 1)
                put("id", profile.getString("id"))
                put("name", profile.optString("name", "Mentor"))
                put("email", profile.optString("email", ""))
                put("role", profile.optString("role", "usthad"))
            })

            val students = payload.optJSONArray("students")
            if (students != null) for (index in 0 until students.length()) {
                upsertStudent(this, students.getJSONObject(index), 0)
            }
            val hifzEntries = payload.optJSONArray("hifzEntries")
            if (hifzEntries != null) for (index in 0 until hifzEntries.length()) {
                upsertHifzEntry(this, hifzEntries.getJSONObject(index))
            }
            putMetadata(this, "academic_year", payload.optJSONObject("academicYear")?.optString("name", "") ?: "")
            putMetadata(this, "portal", payload.optString("portal", "staff"))
            putMetadata(this, "admin_summary", payload.optJSONObject("dashboardSummary")?.toString() ?: "{}")
            putMetadata(this, "sync_cursor", payload.optLong("syncCursor", 0).toString())
        }
    }

    fun applyChanges(payload: JSONObject) {
        writableDatabase.inTransaction {
            val changes = payload.optJSONArray("changes")
            if (changes != null) for (index in 0 until changes.length()) {
                val change = changes.getJSONObject(index)
                val type = change.optString("entity_type")
                val id = change.optString("entity_id")
                val operation = change.optString("operation")
                val version = change.optLong("entity_version", 0)
                if (type == "student" && operation == "upsert") {
                    change.optJSONObject("payload")?.let { upsertStudent(this, it, version) }
                } else if (type == "student" && operation == "delete") {
                    delete("students", "id = ?", arrayOf(id))
                    insertWithOnConflict("tombstones", null, ContentValues().apply {
                        put("entity_type", type); put("entity_id", id); put("version", version)
                    }, SQLiteDatabase.CONFLICT_REPLACE)
                } else if (type == "hifz_log" && operation == "upsert") {
                    change.optJSONObject("payload")?.let { upsertHifzEntry(this, it, version) }
                    change.optJSONObject("payload")?.optString("student_id")?.takeIf { it.isNotBlank() }?.let { studentId ->
                        update("hifz_register_cache", ContentValues().apply { put("stale", 1) }, "student_id=?", arrayOf(studentId))
                    }
                } else if (type == "hifz_log" && operation == "delete") {
                    delete("hifz_entries", "id = ?", arrayOf(id))
                    update("hifz_register_cache", ContentValues().apply { put("stale", 1) }, null, null)
                } else if (type == "attendance_session") {
                    val state = change.optJSONObject("payload")
                    val scheduleId = state?.optString("schedule_id").orEmpty()
                    val date = state?.optString("date").orEmpty()
                    if (scheduleId.isNotBlank() && date.isNotBlank()) {
                        update("attendance_sessions", ContentValues().apply { put("stale", 1) }, "schedule_id=? AND session_date=?", arrayOf(scheduleId, date))
                    }
                } else if (type == "mentor_leaves" || type == "mentor_assignments") {
                    putMetadata(this, "mentor_workspace_stale", "1")
                } else if (type == "chat_message") {
                    putMetadata(this, "chat_workspace_stale", "1")
                    change.optJSONObject("payload")?.optString("conversation_id")?.takeIf { it.isNotBlank() }?.let {
                        putMetadata(this, "chat_conversation_stale:$it", "1")
                    }
                } else if (type.startsWith("finance_")) {
                    putMetadata(this, "finance_workspace_stale", "1")
                }
            }
            putMetadata(this, "sync_cursor", payload.optLong("nextCursor", cursor()).toString())
        }
    }

    fun snapshot(cached: Boolean): HomeSnapshot? {
        val profile = readableDatabase.rawQuery("SELECT id,name,email,role FROM profile WHERE singleton=1", null).use { cursor ->
            if (!cursor.moveToFirst()) return null
            MentorProfile(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3))
        }
        val students = mutableListOf<StudentSummary>()
        readableDatabase.rawQuery("SELECT id,name,standard FROM students ORDER BY name", null).use { cursor ->
            while (cursor.moveToNext()) students += StudentSummary(cursor.getString(0), cursor.getString(1), cursor.getString(2))
        }
        val entries = mutableListOf<HifzEntrySummary>()
        readableDatabase.rawQuery(
            "SELECT id,student_id,entry_date,mode,surah_name,start_v,end_v,notes,version FROM hifz_entries ORDER BY entry_date DESC,id DESC",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) entries += HifzEntrySummary(
                cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3),
                cursor.getString(4), cursor.getInt(5), cursor.getInt(6), cursor.getString(7), cursor.getLong(8),
            )
        }
        val pendingCount = readableDatabase.rawQuery("SELECT COUNT(*) FROM pending_hifz_mutations WHERE status IN ('pending','rejected')", null)
            .use { if (it.moveToFirst()) it.getInt(0) else 0 }
        val admin = runCatching { JSONObject(metadata("admin_summary") ?: "{}") }.getOrDefault(JSONObject())
        return HomeSnapshot(
            profile, metadata("academic_year") ?: "", students, entries, pendingCount,
            metadata("portal") ?: if (profile.role in setOf("admin", "controller")) "admin" else "staff",
            AdminDashboardSummary(
                totalStudents = admin.optInt("totalStudents"),
                onCampus = admin.optInt("onCampus"),
                outCampus = admin.optInt("outCampus"),
                totalStaff = admin.optInt("totalStaff"),
                activeStaff = admin.optInt("activeStaff"),
                pendingDelegations = admin.optInt("pendingDelegations"),
            ),
            cursor(), cached,
        )
    }

    fun queueHifzDraft(draft: HifzDraft) {
        writableDatabase.insertOrThrow("pending_hifz_mutations", null, ContentValues().apply {
            put("mutation_id", draft.mutationId)
            put("student_id", draft.studentId)
            put("entry_date", draft.entryDate)
            put("mode", draft.mode)
            put("surah_name", draft.surahName)
            put("start_v", draft.startVerse)
            put("end_v", draft.endVerse)
            put("notes", draft.notes)
            put("status", "pending")
        })
    }

    fun pendingHifzDrafts(): List<HifzDraft> {
        val drafts = mutableListOf<HifzDraft>()
        readableDatabase.rawQuery(
            "SELECT mutation_id,student_id,entry_date,mode,surah_name,start_v,end_v,notes FROM pending_hifz_mutations WHERE status='pending' ORDER BY created_at,mutation_id",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) drafts += HifzDraft(
                cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3),
                cursor.getString(4), cursor.getInt(5), cursor.getInt(6), cursor.getString(7),
            )
        }
        return drafts
    }

    fun markHifzDraftApplied(mutationId: String, entry: JSONObject) {
        writableDatabase.inTransaction {
            upsertHifzEntry(this, entry)
            delete("pending_hifz_mutations", "mutation_id=?", arrayOf(mutationId))
        }
    }

    fun markHifzDraftRejected(mutationId: String, error: String) {
        writableDatabase.update("pending_hifz_mutations", ContentValues().apply {
            put("status", "rejected")
            put("last_error", error.take(1000))
        }, "mutation_id=?", arrayOf(mutationId))
    }

    fun saveStudentProfile(studentId: String, payload: JSONObject) {
        writableDatabase.insertWithOnConflict("student_profile_cache", null, ContentValues().apply {
            put("student_id", studentId)
            put("payload_json", payload.toString())
            put("fetched_at", Instant.now().epochSecond)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun studentProfilePayload(studentId: String): JSONObject? = readableDatabase.rawQuery(
        "SELECT payload_json FROM student_profile_cache WHERE student_id=? LIMIT 1", arrayOf(studentId),
    ).use { if (it.moveToFirst()) runCatching { JSONObject(it.getString(0)) }.getOrNull() else null }

    fun saveHifzRegister(studentId: String, month: String, payload: JSONObject) {
        writableDatabase.insertWithOnConflict("hifz_register_cache", null, ContentValues().apply {
            put("student_id", studentId)
            put("month", month)
            put("payload_json", payload.toString())
            put("fetched_at", Instant.now().epochSecond)
            put("stale", 0)
        }, SQLiteDatabase.CONFLICT_REPLACE)
        putMetadata(writableDatabase, "last_hifz_register", "$studentId|$month")
    }

    fun hifzRegisterPayload(studentId: String, month: String): JSONObject? = readableDatabase.rawQuery(
        "SELECT payload_json FROM hifz_register_cache WHERE student_id=? AND month=? LIMIT 1", arrayOf(studentId, month),
    ).use { if (it.moveToFirst()) runCatching { JSONObject(it.getString(0)) }.getOrNull() else null }

    fun lastHifzRegisterKey(): Pair<String, String>? = metadata("last_hifz_register")?.split('|')
        ?.takeIf { it.size == 2 && it[0].isNotBlank() && it[1].isNotBlank() }
        ?.let { it[0] to it[1] }

    fun queueHifzRegisterDraft(draft: HifzRegisterDraft) {
        val payload = hifzRegisterDraftJson(draft)
        writableDatabase.inTransaction {
            insertOrThrow("pending_hifz_register_mutations", null, ContentValues().apply {
                put("mutation_id", draft.mutationId)
                put("student_id", draft.studentId)
                put("month", draft.month)
                put("entry_date", draft.entryDate)
                put("payload_json", payload.toString())
                put("status", "pending")
            })
            val cached = rawQuery(
                "SELECT payload_json FROM hifz_register_cache WHERE student_id=? AND month=? LIMIT 1",
                arrayOf(draft.studentId, draft.month),
            ).use { if (it.moveToFirst()) runCatching { JSONObject(it.getString(0)) }.getOrNull() else null }
            if (cached != null) {
                applyOptimisticHifzRegister(cached, draft)
                update("hifz_register_cache", ContentValues().apply {
                    put("payload_json", cached.toString())
                    put("fetched_at", Instant.now().epochSecond)
                }, "student_id=? AND month=?", arrayOf(draft.studentId, draft.month))
            }
        }
    }

    fun pendingHifzRegisterDrafts(): List<HifzRegisterDraft> {
        val drafts = mutableListOf<HifzRegisterDraft>()
        readableDatabase.rawQuery(
            "SELECT payload_json FROM pending_hifz_register_mutations WHERE status='pending' ORDER BY created_at,mutation_id", null,
        ).use { cursor ->
            while (cursor.moveToNext()) runCatching { parseHifzRegisterDraft(JSONObject(cursor.getString(0))) }.getOrNull()?.let(drafts::add)
        }
        return drafts
    }

    fun hifzRegisterMutationState(studentId: String, month: String): Triple<Int, Int, String?> {
        var pending = 0
        var conflicts = 0
        var latestError: String? = null
        readableDatabase.rawQuery(
            "SELECT status,last_error FROM pending_hifz_register_mutations WHERE student_id=? AND month=? ORDER BY created_at DESC,mutation_id DESC",
            arrayOf(studentId, month),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                when (cursor.getString(0)) {
                    "pending" -> pending++
                    "conflict", "rejected" -> conflicts++
                }
                if (latestError == null && !cursor.isNull(1)) latestError = cursor.getString(1)
            }
        }
        return Triple(pending, conflicts, latestError)
    }

    fun markHifzRegisterApplied(draft: HifzRegisterDraft, response: JSONObject) {
        writableDatabase.inTransaction {
            response.optJSONObject("monthRegister")?.let { register ->
                insertWithOnConflict("hifz_register_cache", null, ContentValues().apply {
                    put("student_id", draft.studentId)
                    put("month", draft.month)
                    put("payload_json", register.toString())
                    put("fetched_at", Instant.now().epochSecond)
                    put("stale", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            delete("pending_hifz_register_mutations", "mutation_id=?", arrayOf(draft.mutationId))
        }
    }

    fun markHifzRegisterRejected(mutationId: String, code: String?, error: String) {
        writableDatabase.update("pending_hifz_register_mutations", ContentValues().apply {
            put("status", if (code in setOf("HIFZ_ENTRY_CHANGED", "HIFZ_ELIGIBILITY_CHANGED")) "conflict" else "rejected")
            put("error_code", code)
            put("last_error", error.take(1000))
        }, "mutation_id=?", arrayOf(mutationId))
    }

    fun discardHifzRegisterConflict(mutationId: String) {
        writableDatabase.delete(
            "pending_hifz_register_mutations",
            "mutation_id=? AND status IN ('conflict','rejected')",
            arrayOf(mutationId),
        )
    }

    fun latestHifzRegisterConflictId(studentId: String, month: String): String? = readableDatabase.rawQuery(
        "SELECT mutation_id FROM pending_hifz_register_mutations WHERE student_id=? AND month=? AND status IN ('conflict','rejected') ORDER BY created_at DESC,mutation_id DESC LIMIT 1",
        arrayOf(studentId, month),
    ).use { if (it.moveToFirst()) it.getString(0) else null }

    fun replaceAttendanceDay(date: String, payload: JSONObject) {
        writableDatabase.inTransaction {
            delete("attendance_sessions", "session_date=?", arrayOf(date))
            val sessions = payload.optJSONArray("data") ?: JSONArray()
            for (index in 0 until sessions.length()) {
                val item = sessions.getJSONObject(index)
                val cancellation = item.optJSONObject("attendance_cancellation")
                val cancelled = cancellation != null
                    && jsonListSize(cancellation, "cancelled_standards") == 0
                    && jsonListSize(cancellation, "cancelled_students") == 0
                insertWithOnConflict("attendance_sessions", null, ContentValues().apply {
                    put("schedule_id", item.optString("id"))
                    put("session_date", date)
                    put("name", item.optString("name", "Class"))
                    put("class_type", item.optString("class_type"))
                    put("start_time", item.optString("start_time").take(8))
                    put("end_time", item.optString("end_time").take(8))
                    put("student_count", item.optInt("student_count"))
                    put("schedule_revision", item.optLong("mobile_revision", 1))
                    put("session_revision", item.optLong("session_revision", 0))
                    put("cancelled", if (cancelled) 1 else 0)
                    put("cancellation_reason", cancellation?.optString("reason")?.ifBlank { null })
                    put("stale", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
        }
    }

    fun attendanceDay(date: String): List<AttendanceSession> {
        val rows = mutableListOf<AttendanceSession>()
        readableDatabase.rawQuery(
            """SELECT session.schedule_id,session.session_date,session.name,session.class_type,
                    session.start_time,session.end_time,session.student_count,
                    session.schedule_revision,session.session_revision,session.cancelled,
                    session.cancellation_reason,
                    (SELECT pending.status FROM pending_attendance_mutations pending
                     WHERE pending.schedule_id=session.schedule_id AND pending.session_date=session.session_date
                     ORDER BY pending.created_at DESC LIMIT 1),
                    (SELECT pending.last_error FROM pending_attendance_mutations pending
                     WHERE pending.schedule_id=session.schedule_id AND pending.session_date=session.session_date
                     ORDER BY pending.created_at DESC LIMIT 1)
             FROM attendance_sessions session
             WHERE session.session_date=?
             ORDER BY session.start_time,session.name""",
            arrayOf(date),
        ).use { cursor ->
            while (cursor.moveToNext()) rows += AttendanceSession(
                id = cursor.getString(0), date = cursor.getString(1), name = cursor.getString(2),
                classType = cursor.getString(3), startTime = cursor.getString(4), endTime = cursor.getString(5),
                studentCount = cursor.getInt(6), scheduleRevision = cursor.getLong(7), sessionRevision = cursor.getLong(8),
                cancelled = cursor.getInt(9) == 1, cancellationReason = cursor.getString(10),
                syncStatus = cursor.getString(11), syncError = cursor.getString(12),
            )
        }
        return rows
    }

    fun replaceAttendanceRoster(scheduleId: String, date: String, payload: JSONObject) {
        writableDatabase.inTransaction {
            delete("attendance_roster", "schedule_id=? AND session_date=?", arrayOf(scheduleId, date))
            val savedMarks = mutableMapOf<String, String>()
            val marks = payload.optJSONArray("marks") ?: JSONArray()
            for (index in 0 until marks.length()) {
                val mark = marks.getJSONObject(index)
                savedMarks[mark.optString("student_id")] = normalizeAttendanceStatus(mark.optString("status"))
            }
            val students = payload.optJSONArray("students") ?: JSONArray()
            for (index in 0 until students.length()) {
                val student = students.getJSONObject(index)
                val studentId = student.optString("adm_no", student.optString("id"))
                val locked = student.optBoolean("is_locked_outside")
                val onLeave = student.optBoolean("is_on_leave")
                val status = savedMarks[studentId]
                    ?: if (onLeave) "Leave" else if (locked) "Outside" else "Present"
                insertWithOnConflict("attendance_roster", null, ContentValues().apply {
                    put("schedule_id", scheduleId); put("session_date", date); put("student_id", studentId)
                    put("name", student.optString("name", "Student")); put("standard", student.optString("standard"))
                    put("photo_url", student.optString("photo_url").ifBlank { null }); put("locked", if (locked) 1 else 0)
                    put("on_campus_leave", if (onLeave) 1 else 0); put("leave_type", student.optString("leave_type").ifBlank { null })
                    put("status", status)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            val state = payload.optJSONObject("sessionState") ?: JSONObject()
            val cancellation = payload.optJSONObject("cancellation")
            update("attendance_sessions", ContentValues().apply {
                put("schedule_revision", state.optLong("scheduleRevision", 1))
                put("session_revision", state.optLong("sessionRevision", 0))
                put("roster_state_hash", state.optString("rosterStateHash"))
                put("cancelled", if (cancellation?.optBoolean("is_cancelled") == true) 1 else 0)
                put("cancellation_reason", cancellation?.optString("reason")?.ifBlank { null })
                put("stale", 0)
            }, "schedule_id=? AND session_date=?", arrayOf(scheduleId, date))
        }
    }

    fun attendanceRoster(scheduleId: String, date: String): AttendanceRoster? {
        val session = readableDatabase.rawQuery(
            """SELECT schedule_revision,session_revision,COALESCE(roster_state_hash,''),cancelled,cancellation_reason,
                    (SELECT status FROM pending_attendance_mutations WHERE schedule_id=? AND session_date=? ORDER BY created_at DESC LIMIT 1),
                    (SELECT last_error FROM pending_attendance_mutations WHERE schedule_id=? AND session_date=? ORDER BY created_at DESC LIMIT 1)
             FROM attendance_sessions WHERE schedule_id=? AND session_date=?""",
            arrayOf(scheduleId, date, scheduleId, date, scheduleId, date),
        ).use { cursor ->
            if (!cursor.moveToFirst()) return null
            listOf(cursor.getLong(0), cursor.getLong(1), cursor.getString(2), cursor.getInt(3), cursor.getString(4), cursor.getString(5), cursor.getString(6))
        }
        val students = mutableListOf<AttendanceStudent>()
        readableDatabase.rawQuery(
            """SELECT student_id,name,standard,photo_url,locked,on_campus_leave,leave_type,status
             FROM attendance_roster WHERE schedule_id=? AND session_date=? ORDER BY name,student_id""",
            arrayOf(scheduleId, date),
        ).use { cursor ->
            while (cursor.moveToNext()) students += AttendanceStudent(
                id = cursor.getString(0), name = cursor.getString(1), standard = cursor.getString(2), photoUrl = cursor.getString(3),
                locked = cursor.getInt(4) == 1, onCampusLeave = cursor.getInt(5) == 1,
                leaveType = cursor.getString(6), status = cursor.getString(7),
            )
        }
        return AttendanceRoster(
            scheduleId, date, session[0] as Long, session[1] as Long, session[2] as String,
            students, (session[3] as Int) == 1, session[4] as String?, session[5] as String?, session[6] as String?,
        )
    }

    fun queueAttendanceDraft(draft: AttendanceDraft) {
        writableDatabase.inTransaction {
            insertOrThrow("pending_attendance_mutations", null, ContentValues().apply {
                put("mutation_id", draft.mutationId); put("schedule_id", draft.scheduleId); put("session_date", draft.date)
                put("schedule_revision", draft.scheduleRevision); put("session_revision", draft.sessionRevision)
                put("roster_state_hash", draft.rosterStateHash); put("marks_json", JSONObject(draft.marks).toString())
                put("status", "pending")
            })
            draft.marks.forEach { (studentId, status) ->
                update("attendance_roster", ContentValues().apply { put("status", status) },
                    "schedule_id=? AND session_date=? AND student_id=?", arrayOf(draft.scheduleId, draft.date, studentId))
            }
        }
    }

    fun pendingAttendanceDrafts(): List<AttendanceDraft> {
        val drafts = mutableListOf<AttendanceDraft>()
        readableDatabase.rawQuery(
            """SELECT mutation_id,schedule_id,session_date,schedule_revision,session_revision,roster_state_hash,marks_json
             FROM pending_attendance_mutations WHERE status='pending' ORDER BY created_at,mutation_id""", null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val marksJson = JSONObject(cursor.getString(6))
                val marks = mutableMapOf<String, String>()
                marksJson.keys().forEach { studentId -> marks[studentId] = marksJson.optString(studentId) }
                drafts += AttendanceDraft(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getLong(3), cursor.getLong(4), cursor.getString(5), marks)
            }
        }
        return drafts
    }

    fun markAttendanceDraftApplied(mutationId: String, response: JSONObject) {
        writableDatabase.inTransaction {
            val attendance = response.optJSONObject("attendance") ?: JSONObject()
            val scheduleId = attendance.optString("scheduleId")
            val date = attendance.optString("date")
            update("attendance_sessions", ContentValues().apply {
                put("session_revision", attendance.optLong("sessionRevision")); put("stale", 0)
            }, "schedule_id=? AND session_date=?", arrayOf(scheduleId, date))
            val marks = attendance.optJSONArray("marks") ?: JSONArray()
            for (index in 0 until marks.length()) {
                val mark = marks.getJSONObject(index)
                update("attendance_roster", ContentValues().apply { put("status", normalizeAttendanceStatus(mark.optString("status"))) },
                    "schedule_id=? AND session_date=? AND student_id=?", arrayOf(scheduleId, date, mark.optString("studentId")))
            }
            delete("pending_attendance_mutations", "mutation_id=?", arrayOf(mutationId))
        }
    }

    fun markAttendanceDraftRejected(mutationId: String, code: String?, error: String) {
        writableDatabase.update("pending_attendance_mutations", ContentValues().apply {
            put("status", if (code in setOf("SESSION_CANCELLED", "SESSION_CHANGED", "ROSTER_CHANGED")) "conflict" else "rejected")
            put("error_code", code); put("last_error", error.take(1000))
        }, "mutation_id=?", arrayOf(mutationId))
    }

    fun discardAttendanceConflict(scheduleId: String, date: String) {
        writableDatabase.delete(
            "pending_attendance_mutations",
            "schedule_id=? AND session_date=? AND status IN ('conflict','rejected')",
            arrayOf(scheduleId, date),
        )
    }

    fun replaceMentorWorkspace(payload: JSONObject) {
        writableDatabase.inTransaction {
            delete("leave_students", null, null)
            delete("mentor_leaves", null, null)
            delete("institutional_leaves_cache", null, null)
            delete("mentor_assignments", null, null)

            val students = payload.optJSONArray("students") ?: JSONArray()
            for (index in 0 until students.length()) {
                val student = students.getJSONObject(index)
                insertWithOnConflict("leave_students", null, ContentValues().apply {
                    put("student_id", student.optString("id")); put("name", student.optString("name", "Student"))
                    put("standard", student.optString("standard")); put("photo_url", nullableString(student, "photoUrl"))
                    put("presence_state_hash", student.optString("presenceStateHash")); put("active_leave_id", nullableString(student, "activeLeaveId"))
                    put("is_outside", if (student.optBoolean("isOutside")) 1 else 0)
                    put("is_on_campus_leave", if (student.optBoolean("isOnCampusLeave")) 1 else 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }

            val leaves = payload.optJSONArray("leaves") ?: JSONArray()
            for (index in 0 until leaves.length()) upsertMentorLeave(this, leaves.getJSONObject(index))

            val institutional = payload.optJSONArray("institutionalLeaves") ?: JSONArray()
            for (index in 0 until institutional.length()) {
                val item = institutional.getJSONObject(index)
                val targetClasses = item.optJSONArray("targetClasses") ?: JSONArray()
                val targetStudents = item.optJSONArray("targetStudentIds") ?: JSONArray()
                val targetSummary = when {
                    item.optBoolean("entireInstitution") -> "Entire institution"
                    targetStudents.length() > 0 -> "${targetStudents.length()} selected students"
                    targetClasses.length() > 0 -> (0 until targetClasses.length()).joinToString(", ") { targetClasses.optString(it) }
                    else -> "Authorized students"
                }
                insertWithOnConflict("institutional_leaves_cache", null, ContentValues().apply {
                    put("id", item.optString("id")); put("name", item.optString("name", "Institutional leave"))
                    put("start_datetime", item.optString("startDatetime")); put("end_datetime", item.optString("endDatetime"))
                    put("campus_location", item.optString("campusLocation")); put("entire_institution", if (item.optBoolean("entireInstitution")) 1 else 0)
                    put("target_summary", targetSummary)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }

            val assignments = payload.optJSONArray("assignments") ?: JSONArray()
            for (index in 0 until assignments.length()) {
                val item = assignments.getJSONObject(index)
                insertWithOnConflict("mentor_assignments", null, ContentValues().apply {
                    put("id", item.optString("id")); put("original_mentor_id", item.optString("originalMentorId"))
                    put("original_mentor_name", item.optString("originalMentorName", "Mentor")); put("original_mentor_photo", nullableString(item, "originalMentorPhoto"))
                    put("student_id", nullableString(item, "studentId")); put("student_name", nullableString(item, "studentName"))
                    put("student_count", item.optInt("studentCount")); put("reason", nullableString(item, "reason")); put("updated_at", nullableString(item, "updatedAt"))
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            putMetadata(this, "mentor_workspace_stale", "0")
        }
    }

    fun mentorWorkspace(cached: Boolean): MentorWorkspace {
        val students = mutableListOf<LeaveStudent>()
        readableDatabase.rawQuery(
            "SELECT student_id,name,standard,photo_url,presence_state_hash,active_leave_id,is_outside,is_on_campus_leave FROM leave_students ORDER BY name,student_id", null,
        ).use { cursor -> while (cursor.moveToNext()) students += LeaveStudent(
            cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4), cursor.getString(5), cursor.getInt(6) == 1, cursor.getInt(7) == 1,
        ) }

        val leaves = mutableListOf<MentorLeave>()
        readableDatabase.rawQuery(
            """SELECT leave_row.id,leave_row.student_id,leave_row.student_name,leave_row.standard,leave_row.leave_type,
                      leave_row.start_datetime,leave_row.end_datetime,leave_row.reason_category,leave_row.remarks,
                      leave_row.companion_name,leave_row.companion_relationship,leave_row.status,
                      leave_row.actual_return_datetime,leave_row.return_status,leave_row.mobile_revision,leave_row.updated_at,
                      pending.status,pending.last_error,pending.mutation_id
               FROM mentor_leaves leave_row
               LEFT JOIN pending_leave_mutations pending ON pending.leave_id=leave_row.id
                 AND pending.created_at=(SELECT MAX(p2.created_at) FROM pending_leave_mutations p2 WHERE p2.leave_id=leave_row.id)
               ORDER BY leave_row.start_datetime DESC,leave_row.id""", null,
        ).use { cursor -> while (cursor.moveToNext()) leaves += MentorLeave(
            id = cursor.getString(0), studentId = cursor.getString(1), studentName = cursor.getString(2), standard = cursor.getString(3),
            leaveType = cursor.getString(4), startDatetime = cursor.getString(5), endDatetime = cursor.getString(6), reasonCategory = cursor.getString(7),
            remarks = cursor.getString(8), companionName = cursor.getString(9), companionRelationship = cursor.getString(10), status = cursor.getString(11),
            actualReturnDatetime = cursor.getString(12), returnStatus = cursor.getString(13), mobileRevision = cursor.getLong(14), updatedAt = cursor.getString(15),
            syncStatus = cursor.getString(16), syncError = cursor.getString(17), mutationId = cursor.getString(18),
        ) }

        val institutional = mutableListOf<InstitutionalLeave>()
        readableDatabase.rawQuery("SELECT id,name,start_datetime,end_datetime,campus_location,entire_institution,target_summary FROM institutional_leaves_cache ORDER BY start_datetime DESC", null)
            .use { cursor -> while (cursor.moveToNext()) institutional += InstitutionalLeave(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4), cursor.getInt(5) == 1, cursor.getString(6)) }

        val assignments = mutableListOf<MentorAssignment>()
        readableDatabase.rawQuery("SELECT id,original_mentor_id,original_mentor_name,original_mentor_photo,student_id,student_name,student_count,reason,updated_at FROM mentor_assignments ORDER BY updated_at DESC,id", null)
            .use { cursor -> while (cursor.moveToNext()) assignments += MentorAssignment(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4), cursor.getString(5), cursor.getInt(6), cursor.getString(7), cursor.getString(8)) }

        return MentorWorkspace(students, leaves, institutional, assignments, pendingLeaveMutations(), cached)
    }

    fun hasMentorWorkspace(): Boolean = metadata("mentor_workspace_stale") != null

    fun saveStudentReport(cacheKey: String, reportType: String, startDate: String, endDate: String, payload: JSONObject) {
        writableDatabase.insertWithOnConflict("student_report_cache", null, ContentValues().apply {
            put("cache_key", cacheKey); put("report_type", reportType); put("start_date", startDate); put("end_date", endDate)
            put("payload_json", payload.toString()); put("fetched_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun studentReport(cacheKey: String): JSONObject? = readableDatabase.rawQuery(
        "SELECT report_type,start_date,end_date,payload_json FROM student_report_cache WHERE cache_key=? LIMIT 1", arrayOf(cacheKey),
    ).use { cursor ->
        if (!cursor.moveToFirst()) null else JSONObject(cursor.getString(3)).apply {
            put("_reportType", cursor.getString(0)); put("_startDate", cursor.getString(1)); put("_endDate", cursor.getString(2))
        }
    }

    fun replaceChatWorkspace(payload: JSONObject) {
        writableDatabase.inTransaction {
            delete("chat_conversations", null, null)
            delete("chat_staff", null, null)
            delete("chat_messages", "id NOT LIKE 'local:%'", null)
            val conversations = payload.optJSONArray("conversations") ?: JSONArray()
            for (index in 0 until conversations.length()) upsertChatConversation(this, conversations.getJSONObject(index))
            val messages = payload.optJSONArray("messages") ?: JSONArray()
            for (index in 0 until messages.length()) upsertChatMessage(this, messages.getJSONObject(index))
            val staff = payload.optJSONArray("staff") ?: JSONArray()
            for (index in 0 until staff.length()) {
                val item = staff.getJSONObject(index)
                insertWithOnConflict("chat_staff", null, ContentValues().apply {
                    put("id", item.optString("id")); put("name", item.optString("name", "Staff")); put("photo_url", nullableString(item, "photoUrl")); put("role", item.optString("role", "staff"))
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            putMetadata(this, "chat_current_staff_id", payload.optString("currentStaffId"))
            putMetadata(this, "chat_workspace_stale", "0")
        }
    }

    fun replaceChatMessages(payload: JSONObject) {
        writableDatabase.inTransaction {
            val conversationId = payload.optString("conversationId")
            val messages = payload.optJSONArray("messages") ?: JSONArray()
            for (index in 0 until messages.length()) upsertChatMessage(this, messages.getJSONObject(index))
            if (conversationId.isNotBlank()) putMetadata(this, "chat_conversation_stale:$conversationId", "0")
        }
    }

    fun chatWorkspace(cached: Boolean): ChatWorkspace {
        val conversations = mutableListOf<ChatConversation>()
        readableDatabase.rawQuery(
            "SELECT id,type,name,photo_url,other_staff_id,member_count,last_message,last_message_at,last_message_sender,unread_count,created_at FROM chat_conversations ORDER BY COALESCE(last_message_at,created_at) DESC,id", null,
        ).use { cursor -> while (cursor.moveToNext()) conversations += ChatConversation(
            id = cursor.getString(0), type = cursor.getString(1), name = cursor.getString(2), photoUrl = cursor.getString(3), otherStaffId = cursor.getString(4),
            memberCount = if (cursor.isNull(5)) null else cursor.getInt(5), lastMessage = cursor.getString(6), lastMessageAt = cursor.getString(7),
            lastMessageSender = cursor.getString(8), unreadCount = cursor.getInt(9), createdAt = cursor.getString(10),
        ) }
        val staff = mutableListOf<ChatStaff>()
        readableDatabase.rawQuery("SELECT id,name,photo_url,role FROM chat_staff ORDER BY name,id", null).use { cursor ->
            while (cursor.moveToNext()) staff += ChatStaff(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3))
        }
        val pendingCount = readableDatabase.rawQuery("SELECT COUNT(*) FROM pending_chat_mutations WHERE status IN ('pending','rejected')", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }
        return ChatWorkspace(metadata("chat_current_staff_id").orEmpty(), conversations, staff, pendingCount, cached)
    }

    fun hasChatWorkspace(): Boolean = metadata("chat_workspace_stale") != null

    fun chatMessages(conversationId: String): List<ChatMessage> {
        val rows = mutableListOf<ChatMessage>()
        readableDatabase.rawQuery(
            "SELECT id,conversation_id,sender_id,sender_name,sender_photo,content,image_url,is_deleted,created_at,mutation_id,sync_status,sync_error FROM chat_messages WHERE conversation_id=? ORDER BY created_at,id", arrayOf(conversationId),
        ).use { cursor -> while (cursor.moveToNext()) rows += ChatMessage(
            id = cursor.getString(0), conversationId = cursor.getString(1), senderId = cursor.getString(2), senderName = cursor.getString(3), senderPhoto = cursor.getString(4),
            content = cursor.getString(5), imageUrl = cursor.getString(6), deleted = cursor.getInt(7) == 1, createdAt = cursor.getString(8),
            mutationId = cursor.getString(9), syncStatus = cursor.getString(10), syncError = cursor.getString(11),
        ) }
        return rows
    }

    fun latestServerChatMessageAt(conversationId: String): String? = readableDatabase.rawQuery(
        "SELECT created_at FROM chat_messages WHERE conversation_id=? AND id NOT LIKE 'local:%' ORDER BY created_at DESC,id DESC LIMIT 1", arrayOf(conversationId),
    ).use { if (it.moveToFirst()) it.getString(0) else null }

    fun queueChatDraft(draft: ChatDraft, senderId: String, senderName: String) {
        writableDatabase.inTransaction {
            insertOrThrow("pending_chat_mutations", null, ContentValues().apply {
                put("mutation_id", draft.mutationId); put("conversation_id", draft.conversationId); put("content", draft.content); put("status", "pending")
            })
            insertWithOnConflict("chat_messages", null, ContentValues().apply {
                put("id", "local:${draft.mutationId}"); put("conversation_id", draft.conversationId); put("sender_id", senderId); put("sender_name", senderName)
                put("content", draft.content); put("is_deleted", 0); put("created_at", Instant.now().toString()); put("mutation_id", draft.mutationId); put("sync_status", "pending")
            }, SQLiteDatabase.CONFLICT_REPLACE)
            update("chat_conversations", ContentValues().apply { put("last_message", draft.content); put("last_message_at", Instant.now().toString()); put("last_message_sender", senderName) }, "id=?", arrayOf(draft.conversationId))
        }
    }

    fun pendingChatDrafts(): List<ChatDraft> {
        val drafts = mutableListOf<ChatDraft>()
        readableDatabase.rawQuery("SELECT mutation_id,conversation_id,content FROM pending_chat_mutations WHERE status='pending' ORDER BY created_at,mutation_id", null).use { cursor ->
            while (cursor.moveToNext()) drafts += ChatDraft(cursor.getString(0), cursor.getString(1), cursor.getString(2))
        }
        return drafts
    }

    fun markChatDraftApplied(mutationId: String, response: JSONObject) {
        writableDatabase.inTransaction {
            delete("chat_messages", "id=?", arrayOf("local:$mutationId"))
            response.optJSONObject("message")?.let { upsertChatMessage(this, it) }
            delete("pending_chat_mutations", "mutation_id=?", arrayOf(mutationId))
        }
    }

    fun markChatDraftRejected(mutationId: String, error: String) {
        writableDatabase.inTransaction {
            update("pending_chat_mutations", ContentValues().apply { put("status", "rejected"); put("last_error", error.take(1000)) }, "mutation_id=?", arrayOf(mutationId))
            update("chat_messages", ContentValues().apply { put("sync_status", "rejected"); put("sync_error", error.take(1000)) }, "id=?", arrayOf("local:$mutationId"))
        }
    }

    fun discardRejectedChatMessage(mutationId: String): String? {
        val conversationId = readableDatabase.rawQuery("SELECT conversation_id FROM pending_chat_mutations WHERE mutation_id=? AND status='rejected'", arrayOf(mutationId)).use { if (it.moveToFirst()) it.getString(0) else null }
        writableDatabase.inTransaction {
            delete("pending_chat_mutations", "mutation_id=? AND status='rejected'", arrayOf(mutationId))
            delete("chat_messages", "id=? AND sync_status='rejected'", arrayOf("local:$mutationId"))
        }
        return conversationId
    }

    fun markChatReadLocal(conversationId: String) {
        writableDatabase.update("chat_conversations", ContentValues().apply { put("unread_count", 0) }, "id=?", arrayOf(conversationId))
    }

    fun saveFinanceWorkspace(month: String, payload: JSONObject) {
        writableDatabase.inTransaction {
            insertWithOnConflict("finance_cache", null, ContentValues().apply {
                put("cache_key", "workspace:$month"); put("payload_json", payload.toString()); put("fetched_at", System.currentTimeMillis())
            }, SQLiteDatabase.CONFLICT_REPLACE)
            putMetadata(this, "finance_month", month)
            putMetadata(this, "finance_workspace_stale", "0")
        }
    }

    fun financeWorkspacePayload(month: String): JSONObject? = financePayload("workspace:$month")

    fun saveFinanceAccount(studentId: String, payload: JSONObject) {
        writableDatabase.insertWithOnConflict("finance_cache", null, ContentValues().apply {
            put("cache_key", "account:$studentId"); put("payload_json", payload.toString()); put("fetched_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun financeAccountPayload(studentId: String): JSONObject? = financePayload("account:$studentId")

    fun financeCachedMonth(): String? = metadata("finance_month")

    fun hasFinanceWorkspace(): Boolean = financeCachedMonth()?.let { financeWorkspacePayload(it) != null } == true

    fun clearFinanceCache() {
        writableDatabase.inTransaction {
            delete("finance_cache", null, null)
            delete("metadata", "key IN (?,?,?)", arrayOf("finance_month", "finance_workspace_stale", "finance_access"))
        }
    }

    private fun financePayload(key: String): JSONObject? = readableDatabase.rawQuery(
        "SELECT payload_json FROM finance_cache WHERE cache_key=? LIMIT 1", arrayOf(key),
    ).use { if (it.moveToFirst()) runCatching { JSONObject(it.getString(0)) }.getOrNull() else null }

    fun queueLeaveDraft(draft: LeaveDraft) {
        val payload = JSONObject().apply {
            put("mutationId", draft.mutationId); put("operation", draft.operation); put("studentId", draft.studentId)
            put("leaveId", draft.leaveId); put("leaveType", draft.leaveType); put("startDatetime", draft.startDatetime)
            put("endDatetime", draft.endDatetime); put("reasonCategory", draft.reasonCategory); put("remarks", draft.remarks)
            put("companionName", draft.companionName); put("companionRelationship", draft.companionRelationship)
            put("expectedPresenceStateHash", draft.expectedPresenceStateHash); put("expectedLeaveRevision", draft.expectedLeaveRevision)
            put("returnDatetime", draft.returnDatetime)
        }
        writableDatabase.insertOrThrow("pending_leave_mutations", null, ContentValues().apply {
            put("mutation_id", draft.mutationId); put("operation", draft.operation); put("student_id", draft.studentId); put("leave_id", draft.leaveId)
            put("payload_json", payload.toString()); put("status", "pending")
        })
    }

    fun pendingLeaveDrafts(): List<LeaveDraft> = pendingLeaveMutations().filter { it.status == "pending" }.map { it.draft }

    fun pendingLeaveMutations(): List<PendingLeaveMutation> {
        val rows = mutableListOf<PendingLeaveMutation>()
        readableDatabase.rawQuery("SELECT payload_json,status,error_code,last_error FROM pending_leave_mutations ORDER BY created_at,mutation_id", null).use { cursor ->
            while (cursor.moveToNext()) {
                val json = JSONObject(cursor.getString(0))
                val draft = LeaveDraft(
                    mutationId = json.optString("mutationId"), operation = json.optString("operation"), studentId = nullableString(json, "studentId"),
                    leaveId = nullableString(json, "leaveId"), leaveType = nullableString(json, "leaveType"), startDatetime = nullableString(json, "startDatetime"),
                    endDatetime = nullableString(json, "endDatetime"), reasonCategory = nullableString(json, "reasonCategory"), remarks = nullableString(json, "remarks"),
                    companionName = nullableString(json, "companionName"), companionRelationship = nullableString(json, "companionRelationship"),
                    expectedPresenceStateHash = nullableString(json, "expectedPresenceStateHash"),
                    expectedLeaveRevision = if (json.isNull("expectedLeaveRevision")) null else json.optLong("expectedLeaveRevision"),
                    returnDatetime = nullableString(json, "returnDatetime"),
                )
                rows += PendingLeaveMutation(draft, cursor.getString(1), cursor.getString(2), cursor.getString(3))
            }
        }
        return rows
    }

    fun markLeaveDraftApplied(mutationId: String, response: JSONObject) {
        writableDatabase.inTransaction {
            response.optJSONObject("leave")?.let { upsertMentorLeave(this, it) }
            delete("pending_leave_mutations", "mutation_id=?", arrayOf(mutationId))
        }
    }

    fun markLeaveDraftRejected(mutationId: String, code: String?, error: String) {
        writableDatabase.update("pending_leave_mutations", ContentValues().apply {
            put("status", if (code in setOf("PRESENCE_CHANGED", "LEAVE_CHANGED", "NOT_AUTHORIZED")) "conflict" else "rejected")
            put("error_code", code); put("last_error", error.take(1000))
        }, "mutation_id=?", arrayOf(mutationId))
    }

    fun discardLeaveConflict(mutationId: String) {
        writableDatabase.delete("pending_leave_mutations", "mutation_id=? AND status IN ('conflict','rejected')", arrayOf(mutationId))
    }

    fun cursor(): Long = metadata("sync_cursor")?.toLongOrNull() ?: 0

    private fun metadata(key: String): String? = readableDatabase.rawQuery(
        "SELECT value FROM metadata WHERE key=?", arrayOf(key)
    ).use { if (it.moveToFirst()) it.getString(0) else null }

    private fun putMetadata(db: SQLiteDatabase, key: String, value: String) {
        db.insertWithOnConflict("metadata", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertStudent(db: SQLiteDatabase, json: JSONObject, version: Long) {
        val id = json.optString("adm_no", json.optString("id"))
        if (id.isBlank()) return
        db.insertWithOnConflict("students", null, ContentValues().apply {
            put("id", id)
            put("name", json.optString("name", "Student"))
            put("standard", json.optString("standard", json.optString("attendance_standard", "")))
            put("version", version)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertHifzEntry(db: SQLiteDatabase, json: JSONObject, fallbackVersion: Long = 0) {
        val id = json.optString("id")
        if (id.isBlank()) return
        db.insertWithOnConflict("hifz_entries", null, ContentValues().apply {
            put("id", id)
            put("student_id", json.optString("student_id"))
            put("entry_date", json.optString("entry_date").take(10))
            put("mode", json.optString("mode"))
            put("surah_name", json.optString("surah_name"))
            put("start_v", json.optInt("start_v"))
            put("end_v", json.optInt("end_v"))
            put("notes", json.optString("notes").ifBlank { null })
            put("version", json.optLong("entity_version", fallbackVersion))
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun createHifzTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS hifz_entries (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, entry_date TEXT NOT NULL, mode TEXT NOT NULL, surah_name TEXT NOT NULL, start_v INTEGER NOT NULL, end_v INTEGER NOT NULL, notes TEXT, version INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_hifz_entries_student_date ON hifz_entries(student_id,entry_date DESC)")
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_hifz_mutations (mutation_id TEXT PRIMARY KEY, student_id TEXT NOT NULL, entry_date TEXT NOT NULL, mode TEXT NOT NULL, surah_name TEXT NOT NULL, start_v INTEGER NOT NULL, end_v INTEGER NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_hifz_status_created ON pending_hifz_mutations(status,created_at)")
    }

    private fun createAttendanceTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS attendance_sessions (schedule_id TEXT NOT NULL, session_date TEXT NOT NULL, name TEXT NOT NULL, class_type TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, student_count INTEGER NOT NULL DEFAULT 0, schedule_revision INTEGER NOT NULL DEFAULT 1, session_revision INTEGER NOT NULL DEFAULT 0, roster_state_hash TEXT, cancelled INTEGER NOT NULL DEFAULT 0, cancellation_reason TEXT, stale INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(schedule_id,session_date))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date_time ON attendance_sessions(session_date,start_time)")
        db.execSQL("CREATE TABLE IF NOT EXISTS attendance_roster (schedule_id TEXT NOT NULL, session_date TEXT NOT NULL, student_id TEXT NOT NULL, name TEXT NOT NULL, standard TEXT NOT NULL, photo_url TEXT, locked INTEGER NOT NULL DEFAULT 0, on_campus_leave INTEGER NOT NULL DEFAULT 0, leave_type TEXT, status TEXT NOT NULL DEFAULT 'Present', PRIMARY KEY(schedule_id,session_date,student_id))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_attendance_roster_session ON attendance_roster(schedule_id,session_date,name)")
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_attendance_mutations (mutation_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, session_date TEXT NOT NULL, schedule_revision INTEGER NOT NULL, session_revision INTEGER NOT NULL, roster_state_hash TEXT NOT NULL, marks_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error_code TEXT, last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_attendance_status_created ON pending_attendance_mutations(status,created_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_attendance_session ON pending_attendance_mutations(schedule_id,session_date,created_at DESC)")
    }

    private fun createMentorWorkspaceTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS leave_students (student_id TEXT PRIMARY KEY, name TEXT NOT NULL, standard TEXT NOT NULL, photo_url TEXT, presence_state_hash TEXT NOT NULL, active_leave_id TEXT, is_outside INTEGER NOT NULL DEFAULT 0, is_on_campus_leave INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE IF NOT EXISTS mentor_leaves (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, standard TEXT NOT NULL, leave_type TEXT NOT NULL, start_datetime TEXT NOT NULL, end_datetime TEXT, reason_category TEXT, remarks TEXT, companion_name TEXT, companion_relationship TEXT, status TEXT NOT NULL, actual_return_datetime TEXT, return_status TEXT, mobile_revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_mentor_leaves_status_start ON mentor_leaves(status,start_datetime DESC)")
        db.execSQL("CREATE TABLE IF NOT EXISTS institutional_leaves_cache (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_datetime TEXT NOT NULL, end_datetime TEXT NOT NULL, campus_location TEXT NOT NULL, entire_institution INTEGER NOT NULL DEFAULT 0, target_summary TEXT NOT NULL)")
        db.execSQL("CREATE TABLE IF NOT EXISTS mentor_assignments (id TEXT PRIMARY KEY, original_mentor_id TEXT NOT NULL, original_mentor_name TEXT NOT NULL, original_mentor_photo TEXT, student_id TEXT, student_name TEXT, student_count INTEGER NOT NULL DEFAULT 0, reason TEXT, updated_at TEXT)")
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_leave_mutations (mutation_id TEXT PRIMARY KEY, operation TEXT NOT NULL, student_id TEXT, leave_id TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error_code TEXT, last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_leave_status_created ON pending_leave_mutations(status,created_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_leave_leave ON pending_leave_mutations(leave_id,created_at DESC)")
    }

    private fun createReportTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS student_report_cache (cache_key TEXT PRIMARY KEY, report_type TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, payload_json TEXT NOT NULL, fetched_at INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_student_report_fetched ON student_report_cache(fetched_at DESC)")
    }

    private fun createChatTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS chat_conversations (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, photo_url TEXT, other_staff_id TEXT, member_count INTEGER, last_message TEXT, last_message_at TEXT, last_message_sender TEXT, unread_count INTEGER NOT NULL DEFAULT 0, created_at TEXT)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_chat_conversations_recent ON chat_conversations(last_message_at DESC,created_at DESC)")
        db.execSQL("CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, sender_name TEXT NOT NULL, sender_photo TEXT, content TEXT, image_url TEXT, is_deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, mutation_id TEXT, sync_status TEXT, sync_error TEXT)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_time ON chat_messages(conversation_id,created_at,id)")
        db.execSQL("CREATE TABLE IF NOT EXISTS chat_staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, photo_url TEXT, role TEXT NOT NULL)")
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_chat_mutations (mutation_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_chat_status_created ON pending_chat_mutations(status,created_at)")
    }

    private fun createFinanceTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS finance_cache (cache_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, fetched_at INTEGER NOT NULL)")
    }

    private fun createStudentDetailTables(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS student_profile_cache (student_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, fetched_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE IF NOT EXISTS hifz_register_cache (student_id TEXT NOT NULL, month TEXT NOT NULL, payload_json TEXT NOT NULL, fetched_at INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id,month))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_hifz_register_fetched ON hifz_register_cache(fetched_at DESC)")
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_hifz_register_mutations (mutation_id TEXT PRIMARY KEY, student_id TEXT NOT NULL, month TEXT NOT NULL, entry_date TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error_code TEXT, last_error TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_hifz_register_status_created ON pending_hifz_register_mutations(status,created_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_hifz_register_student_month ON pending_hifz_register_mutations(student_id,month,created_at DESC)")
    }

    private fun hifzRegisterDraftJson(draft: HifzRegisterDraft) = JSONObject().apply {
        fun changeJson(change: HifzRegisterChange) = JSONObject().apply {
            put("id", change.id ?: JSONObject.NULL)
            put("surahName", change.surahName ?: JSONObject.NULL)
            put("startVerse", change.startVerse ?: JSONObject.NULL)
            put("endVerse", change.endVerse ?: JSONObject.NULL)
            put("juzNumber", change.juzNumber ?: JSONObject.NULL)
            put("juzPortion", change.juzPortion ?: JSONObject.NULL)
        }
        put("mutationId", draft.mutationId)
        put("studentId", draft.studentId)
        put("month", draft.month)
        put("entryDate", draft.entryDate)
        put("sessionId", draft.sessionId ?: JSONObject.NULL)
        put("mode", draft.mode)
        put("creates", JSONArray().apply { draft.creates.forEach { put(changeJson(it)) } })
        put("updates", JSONArray().apply { draft.updates.forEach { put(changeJson(it)) } })
        put("deleteIds", JSONArray().apply { draft.deleteIds.forEach(::put) })
        put("expectedVersions", JSONObject().apply { draft.expectedVersions.forEach(::put) })
    }

    private fun parseHifzRegisterDraft(json: JSONObject): HifzRegisterDraft {
        fun changes(key: String): List<HifzRegisterChange> = buildList {
            val rows = json.optJSONArray(key) ?: JSONArray()
            for (index in 0 until rows.length()) {
                val item = rows.optJSONObject(index) ?: continue
                add(HifzRegisterChange(
                    id = nullableString(item, "id"),
                    surahName = nullableString(item, "surahName"),
                    startVerse = if (item.isNull("startVerse")) null else item.optInt("startVerse"),
                    endVerse = if (item.isNull("endVerse")) null else item.optInt("endVerse"),
                    juzNumber = if (item.isNull("juzNumber")) null else item.optInt("juzNumber"),
                    juzPortion = nullableString(item, "juzPortion"),
                ))
            }
        }
        val versions = mutableMapOf<String, Long>()
        val versionsJson = json.optJSONObject("expectedVersions") ?: JSONObject()
        versionsJson.keys().forEach { id -> versions[id] = versionsJson.optLong(id) }
        return HifzRegisterDraft(
            mutationId = json.optString("mutationId"), studentId = json.optString("studentId"), month = json.optString("month"),
            entryDate = json.optString("entryDate"), sessionId = nullableString(json, "sessionId"), mode = json.optString("mode"),
            creates = changes("creates"), updates = changes("updates"),
            deleteIds = buildList { val rows = json.optJSONArray("deleteIds") ?: JSONArray(); for (index in 0 until rows.length()) add(rows.optString(index)) },
            expectedVersions = versions,
        )
    }

    private fun applyOptimisticHifzRegister(register: JSONObject, draft: HifzRegisterDraft) {
        val day = (register.optJSONArray("days") ?: return).let { days ->
            (0 until days.length()).mapNotNull(days::optJSONObject).firstOrNull { it.optString("date") == draft.entryDate }
        } ?: return
        val key = when (draft.mode) {
            "New Verses" -> "newHifz"
            "Recent Revision" -> "recentRevision"
            "Juz Revision" -> "juzRevision"
            "Juz Revision (New)" -> "newJuzRevision"
            "Juz Revision (Old)" -> "oldJuzRevision"
            else -> return
        }
        val entries = day.optJSONObject("entries") ?: JSONObject().also { day.put("entries", it) }
        val rows = entries.optJSONArray(key) ?: JSONArray().also { entries.put(key, it) }
        val deleteIds = draft.deleteIds.toSet()
        val kept = JSONArray()
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            if (row.optString("id") !in deleteIds) kept.put(row)
        }
        draft.updates.forEach { change ->
            for (index in 0 until kept.length()) {
                val row = kept.optJSONObject(index) ?: continue
                if (row.optString("id") == change.id) {
                    change.surahName?.let { row.put("surah_name", it) }
                    change.startVerse?.let { row.put("start_v", it) }
                    change.endVerse?.let { row.put("end_v", it) }
                    change.juzNumber?.let { row.put("juz_number", it) }
                    change.juzPortion?.let { row.put("juz_portion", it) }
                    row.put("sync_status", "pending")
                }
            }
        }
        draft.creates.forEachIndexed { index, change ->
            kept.put(JSONObject().apply {
                put("id", "local:${draft.mutationId}:$index")
                put("student_id", draft.studentId)
                put("entry_date", draft.entryDate)
                put("session_id", draft.sessionId ?: JSONObject.NULL)
                put("mode", draft.mode)
                put("surah_name", change.surahName ?: JSONObject.NULL)
                put("start_v", change.startVerse ?: JSONObject.NULL)
                put("end_v", change.endVerse ?: JSONObject.NULL)
                put("juz_number", change.juzNumber ?: JSONObject.NULL)
                put("juz_portion", change.juzPortion ?: JSONObject.NULL)
                put("entity_version", 0)
                put("sync_status", "pending")
            })
        }
        entries.put(key, kept)
    }

    private fun upsertChatConversation(db: SQLiteDatabase, item: JSONObject) {
        val id = item.optString("id")
        if (id.isBlank()) return
        db.insertWithOnConflict("chat_conversations", null, ContentValues().apply {
            put("id", id); put("type", item.optString("type", "private")); put("name", item.optString("name", "Conversation")); put("photo_url", nullableString(item, "photoUrl"))
            put("other_staff_id", nullableString(item, "otherStaffId")); if (item.isNull("memberCount")) putNull("member_count") else put("member_count", item.optInt("memberCount"))
            put("last_message", nullableString(item, "lastMessage")); put("last_message_at", nullableString(item, "lastMessageAt")); put("last_message_sender", nullableString(item, "lastMessageSender"))
            put("unread_count", item.optInt("unreadCount")); put("created_at", nullableString(item, "createdAt"))
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertChatMessage(db: SQLiteDatabase, item: JSONObject) {
        val id = item.optString("id")
        if (id.isBlank()) return
        val mutationId = nullableString(item, "mutationId")
        if (mutationId != null) {
            db.delete("chat_messages", "id=?", arrayOf("local:$mutationId"))
            db.delete("pending_chat_mutations", "mutation_id=?", arrayOf(mutationId))
        }
        db.insertWithOnConflict("chat_messages", null, ContentValues().apply {
            put("id", id); put("conversation_id", item.optString("conversationId")); put("sender_id", item.optString("senderId")); put("sender_name", item.optString("senderName", "Staff"))
            put("sender_photo", nullableString(item, "senderPhoto")); put("content", nullableString(item, "content")); put("image_url", nullableString(item, "imageUrl"))
            put("is_deleted", if (item.optBoolean("deleted")) 1 else 0); put("created_at", item.optString("createdAt")); put("mutation_id", mutationId); putNull("sync_status"); putNull("sync_error")
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertMentorLeave(db: SQLiteDatabase, item: JSONObject) {
        val id = item.optString("id")
        if (id.isBlank()) return
        db.insertWithOnConflict("mentor_leaves", null, ContentValues().apply {
            put("id", id); put("student_id", item.optString("studentId")); put("student_name", item.optString("studentName", "Student"))
            put("standard", item.optString("standard")); put("leave_type", item.optString("leaveType")); put("start_datetime", item.optString("startDatetime"))
            put("end_datetime", nullableString(item, "endDatetime")); put("reason_category", nullableString(item, "reasonCategory")); put("remarks", nullableString(item, "remarks"))
            put("companion_name", nullableString(item, "companionName")); put("companion_relationship", nullableString(item, "companionRelationship")); put("status", item.optString("status"))
            put("actual_return_datetime", nullableString(item, "actualReturnDatetime")); put("return_status", nullableString(item, "returnStatus")); put("mobile_revision", item.optLong("mobileRevision", 1)); put("updated_at", nullableString(item, "updatedAt"))
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun nullableString(json: JSONObject, key: String): String? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optString(key).takeIf { it.isNotBlank() && it != "null" }
    }

    private fun jsonListSize(json: JSONObject, key: String): Int {
        val value = json.opt(key)
        return when (value) {
            is JSONArray -> value.length()
            is String -> runCatching { JSONArray(value).length() }.getOrDefault(0)
            else -> 0
        }
    }

    private fun normalizeAttendanceStatus(value: String) = when (value.trim().lowercase()) {
        "absent" -> "Absent"
        "late" -> "Late"
        "outside" -> "Outside"
        "leave", "on leave", "on_leave" -> "Leave"
        else -> "Present"
    }

    private inline fun SQLiteDatabase.inTransaction(block: SQLiteDatabase.() -> Unit) {
        beginTransaction()
        try {
            block()
            setTransactionSuccessful()
        } finally {
            endTransaction()
        }
    }
}
