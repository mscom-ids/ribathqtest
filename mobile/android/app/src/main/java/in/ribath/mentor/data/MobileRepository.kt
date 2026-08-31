package `in`.ribath.mentor.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import `in`.ribath.mentor.BuildConfig
import org.json.JSONObject
import java.util.UUID

class MobileRepository(context: Context) {
    private val applicationContext = context.applicationContext
    private val api = MobileApiClient(BuildConfig.API_BASE_URL)
    private val secureStore = SecureSessionStore(applicationContext)
    private val database = OfflineDatabase(applicationContext)
    @Volatile private var accessToken: String? = null

    fun cachedSnapshot(): HomeSnapshot? = database.snapshot(cached = true)

    fun cachedMentorWorkspace(): MentorWorkspace = database.mentorWorkspace(cached = !isOnline())

    fun cachedFinanceWorkspace(month: String): FinanceWorkspace? =
        database.financeWorkspacePayload(month)?.let { parseFinanceWorkspace(month, it, cached = true) }

    fun cachedStudentProfile(studentId: String): MentorStudentProfile? =
        database.studentProfilePayload(studentId)?.let { parseStudentProfile(it, cached = true) }

    fun cachedHifzMonth(studentId: String, month: String): HifzMonthRegister? =
        database.hifzRegisterPayload(studentId, month)?.let { parseHifzMonth(it, cached = true) }

    fun isOnline(): Boolean {
        val manager = applicationContext.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    suspend fun login(email: String, password: String): HomeSnapshot {
        check(isOnline()) { "Connect to the internet to sign in" }
        val session = api.login(email.trim().lowercase(), password, secureStore.installationId())
        accessToken = session.accessToken
        secureStore.save(StoredSession(session.deviceId, session.refreshToken))
        return bootstrap(session.deviceId)
    }

    suspend fun restore(): HomeSnapshot? {
        val stored = secureStore.read() ?: return cachedSnapshot()
        if (!isOnline()) return cachedSnapshot()
        return try {
            val refreshed = api.refresh(stored)
            accessToken = refreshed.accessToken
            secureStore.save(StoredSession(refreshed.deviceId, refreshed.refreshToken))
            bootstrap(refreshed.deviceId)
        } catch (error: ApiException) {
            if (error.status == 401 || error.status == 403) {
                accessToken = null
                secureStore.clear()
                null
            } else {
                cachedSnapshot()
            }
        }
    }

    suspend fun synchronize(): HomeSnapshot {
        check(isOnline()) { "No internet connection. Your saved data is still available." }
        val stored = ensureAccessSession()
        pullChanges(stored)
        flushChatDrafts(stored)
        flushLeaveDrafts(stored)
        refreshMentorWorkspace(stored)
        if (database.hasChatWorkspace()) refreshChatWorkspace(stored)
        database.financeCachedMonth()?.let { month ->
            try {
                refreshFinanceWorkspace(stored, month)
            } catch (error: ApiException) {
                if (error.status == 403) database.clearFinanceCache() else throw error
            }
        }
        pullChanges(stored)
        flushAttendanceDrafts(stored)
        flushHifzRegisterDrafts(stored)
        flushHifzDrafts(stored)
        pullChanges(stored)
        database.lastHifzRegisterKey()?.let { (studentId, month) ->
            runCatching { refreshHifzMonth(stored, studentId, month) }
        }
        return checkNotNull(database.snapshot(cached = false))
    }

    suspend fun mentorWorkspace(): MentorWorkspace {
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching { refreshMentorWorkspace(stored) }
                .onFailure { if (!database.hasMentorWorkspace()) throw it }
        }
        return database.mentorWorkspace(cached = !isOnline())
    }

    suspend fun createLeave(
        student: LeaveStudent,
        leaveType: String,
        startDatetime: String,
        endDatetime: String?,
        reasonCategory: String,
        remarks: String?,
        companionName: String?,
        companionRelationship: String?,
    ): MentorWorkspace {
        database.queueLeaveDraft(LeaveDraft(
            mutationId = UUID.randomUUID().toString(), operation = "create", studentId = student.id,
            leaveType = leaveType, startDatetime = startDatetime, endDatetime = endDatetime,
            reasonCategory = reasonCategory, remarks = remarks, companionName = companionName,
            companionRelationship = companionRelationship, expectedPresenceStateHash = student.presenceStateHash,
        ))
        if (isOnline()) {
            val stored = ensureAccessSession()
            flushLeaveDrafts(stored)
            refreshMentorWorkspace(stored)
        }
        return database.mentorWorkspace(cached = !isOnline())
    }

    suspend fun returnLeave(leave: MentorLeave, returnDatetime: String): MentorWorkspace {
        database.queueLeaveDraft(LeaveDraft(
            mutationId = UUID.randomUUID().toString(), operation = "return", leaveId = leave.id,
            studentId = leave.studentId, expectedLeaveRevision = leave.mobileRevision,
            returnDatetime = returnDatetime,
        ))
        if (isOnline()) {
            val stored = ensureAccessSession()
            flushLeaveDrafts(stored)
            refreshMentorWorkspace(stored)
        }
        return database.mentorWorkspace(cached = !isOnline())
    }

    suspend fun discardLeaveConflict(mutationId: String): MentorWorkspace {
        check(isOnline()) { "Connect to the internet before discarding a conflicted leave change." }
        val stored = ensureAccessSession()
        refreshMentorWorkspace(stored)
        database.discardLeaveConflict(mutationId)
        return database.mentorWorkspace(cached = false)
    }

    suspend fun studentProgressReport(studentId: String, reportType: String, startDate: String, endDate: String): StudentProgressReport {
        val cacheKey = "$studentId|$reportType|$startDate|$endDate"
        var payload = database.studentReport(cacheKey)
        var cached = true
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                val response = authorized(stored) { token -> api.studentProgressReport(token, stored.deviceId, studentId, reportType, startDate, endDate) }
                response.getJSONObject("data")
            }.onSuccess { fresh ->
                database.saveStudentReport(cacheKey, reportType, startDate, endDate, fresh)
                payload = fresh
                cached = false
            }.onFailure { if (payload == null) throw it }
        }
        val report = payload ?: error("This report is not saved on this device yet. Connect once to generate it.")
        return parseStudentProgressReport(cacheKey, reportType, startDate, endDate, report, cached)
    }

    suspend fun chatWorkspace(): ChatWorkspace {
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                flushChatDrafts(stored)
                refreshChatWorkspace(stored)
            }.onFailure { if (!database.hasChatWorkspace()) throw it }
        }
        return database.chatWorkspace(cached = !isOnline())
    }

    suspend fun chatMessages(conversationId: String): List<ChatMessage> {
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                flushChatDrafts(stored)
                val response = authorized(stored) { token -> api.chatMessages(token, stored.deviceId, conversationId, database.latestServerChatMessageAt(conversationId)) }
                database.replaceChatMessages(response)
            }.onFailure { if (database.chatMessages(conversationId).isEmpty()) throw it }
        }
        return database.chatMessages(conversationId)
    }

    suspend fun sendChatMessage(conversationId: String, content: String): List<ChatMessage> {
        val snapshot = cachedSnapshot() ?: error("Sign in again")
        val draft = ChatDraft(UUID.randomUUID().toString(), conversationId, content.trim())
        require(draft.content.isNotBlank()) { "Message cannot be empty" }
        require(draft.content.length <= 4000) { "Message is too long" }
        database.queueChatDraft(draft, snapshot.mentor.id, snapshot.mentor.name)
        if (isOnline()) flushChatDrafts(ensureAccessSession())
        return database.chatMessages(conversationId)
    }

    suspend fun startPrivateChat(otherStaffId: String): Pair<ChatWorkspace, String> {
        check(isOnline()) { "Connect to the internet to start a new conversation." }
        val stored = ensureAccessSession()
        val response = authorized(stored) { token -> api.startPrivateChat(token, stored.deviceId, otherStaffId) }
        refreshChatWorkspace(stored)
        return database.chatWorkspace(cached = false) to response.getString("conversationId")
    }

    suspend fun markChatRead(conversationId: String): ChatWorkspace {
        database.markChatReadLocal(conversationId)
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching { authorized(stored) { token -> api.markChatRead(token, stored.deviceId, conversationId) } }
        }
        return database.chatWorkspace(cached = !isOnline())
    }

    fun discardRejectedChatMessage(mutationId: String): List<ChatMessage> {
        val conversationId = database.discardRejectedChatMessage(mutationId)
        return conversationId?.let(database::chatMessages).orEmpty()
    }

    suspend fun financeWorkspace(month: String): FinanceWorkspace {
        var payload = database.financeWorkspacePayload(month)
        var cached = true
        if (isOnline()) {
            val stored = ensureAccessSession()
            try {
                refreshFinanceWorkspace(stored, month)
                payload = database.financeWorkspacePayload(month)
                cached = false
            } catch (error: ApiException) {
                if (error.status == 403) {
                    database.clearFinanceCache()
                    throw error
                }
                if (payload == null) throw error
            } catch (error: Throwable) {
                if (payload == null) throw error
            }
        }
        return parseFinanceWorkspace(month, payload ?: error("Finance is not saved on this device yet. Connect once to load it."), cached)
    }

    suspend fun financeAccount(studentId: String): StudentFinanceAccount {
        var payload = database.financeAccountPayload(studentId)
        var cached = true
        if (isOnline()) {
            val stored = ensureAccessSession()
            try {
                val response = authorized(stored) { token -> api.financeAccount(token, stored.deviceId, studentId) }
                response.optJSONObject("account")?.let { database.saveFinanceAccount(studentId, it); payload = it; cached = false }
            } catch (error: ApiException) {
                if (error.status == 403) database.clearFinanceCache()
                if (payload == null || error.status == 403) throw error
            } catch (error: Throwable) {
                if (payload == null) throw error
            }
        }
        return parseFinanceAccount(payload ?: error("This account is not saved on this device yet. Connect once to load it."), cached)
    }

    suspend fun addFinanceCharge(input: FinanceChargeInput, month: String): StudentFinanceAccount {
        check(isOnline()) { "Finance changes require an internet connection and are never queued offline." }
        val stored = ensureAccessSession()
        val response = authorized(stored) { token -> api.submitFinanceCharge(token, stored.deviceId, input) }
        val account = response.optJSONObject("account") ?: error("The updated student account was not returned.")
        database.saveFinanceAccount(input.studentId, account)
        runCatching { refreshFinanceWorkspace(stored, month) }
        return parseFinanceAccount(account, cached = false)
    }

    suspend fun recordFinancePayment(input: FinancePaymentInput, month: String): StudentFinanceAccount {
        check(isOnline()) { "Finance changes require an internet connection and are never queued offline." }
        val stored = ensureAccessSession()
        val response = authorized(stored) { token -> api.submitFinancePayment(token, stored.deviceId, input) }
        val account = response.optJSONObject("account") ?: error("The updated student account was not returned.")
        database.saveFinanceAccount(input.studentId, account)
        runCatching { refreshFinanceWorkspace(stored, month) }
        return parseFinanceAccount(account, cached = false)
    }

    suspend fun attendanceDay(date: String): List<AttendanceSession> {
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                val response = authorized(stored) { token -> api.attendanceDay(token, stored.deviceId, date) }
                database.replaceAttendanceDay(date, response)
            }.onFailure { if (database.attendanceDay(date).isEmpty()) throw it }
        }
        return database.attendanceDay(date)
    }

    suspend fun attendanceRoster(scheduleId: String, date: String): AttendanceRoster {
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                val response = authorized(stored) { token -> api.attendanceRoster(token, stored.deviceId, scheduleId, date) }
                database.replaceAttendanceRoster(scheduleId, date, response)
            }.onFailure { if (database.attendanceRoster(scheduleId, date) == null) throw it }
        }
        return database.attendanceRoster(scheduleId, date) ?: error("This attendance roster is not saved on this device yet. Connect once to download it.")
    }

    suspend fun saveAttendance(roster: AttendanceRoster, marks: Map<String, String>): AttendanceRoster {
        val draft = AttendanceDraft(
            mutationId = UUID.randomUUID().toString(), scheduleId = roster.scheduleId, date = roster.date,
            scheduleRevision = roster.scheduleRevision, sessionRevision = roster.sessionRevision,
            rosterStateHash = roster.rosterStateHash, marks = marks,
        )
        database.queueAttendanceDraft(draft)
        if (isOnline()) {
            val stored = ensureAccessSession()
            flushAttendanceDrafts(stored)
        }
        return checkNotNull(database.attendanceRoster(roster.scheduleId, roster.date))
    }

    suspend fun discardAttendanceConflict(roster: AttendanceRoster): AttendanceRoster {
        check(isOnline()) { "Connect to the internet before replacing a conflicted attendance draft." }
        attendanceRoster(roster.scheduleId, roster.date)
        database.discardAttendanceConflict(roster.scheduleId, roster.date)
        return checkNotNull(database.attendanceRoster(roster.scheduleId, roster.date))
    }

    suspend fun studentProfile(studentId: String): MentorStudentProfile {
        var payload = database.studentProfilePayload(studentId)
        var cached = true
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                val response = authorized(stored) { token -> api.studentProfile(token, stored.deviceId, studentId) }
                response.getJSONObject("profile")
            }.onSuccess { fresh ->
                database.saveStudentProfile(studentId, fresh)
                payload = fresh
                cached = false
            }.onFailure { if (payload == null) throw it }
        }
        return parseStudentProfile(payload ?: error("This student profile is not saved on this device yet. Connect once to download it."), cached)
    }

    suspend fun hifzMonth(studentId: String, month: String): HifzMonthRegister {
        require(month.matches(Regex("^\\d{4}-\\d{2}$"))) { "Month must use YYYY-MM format." }
        var payload = database.hifzRegisterPayload(studentId, month)
        var cached = true
        if (isOnline()) {
            val stored = ensureAccessSession()
            runCatching {
                flushHifzRegisterDrafts(stored)
                refreshHifzMonth(stored, studentId, month)
            }.onSuccess {
                payload = database.hifzRegisterPayload(studentId, month)
                cached = false
            }.onFailure { if (payload == null) throw it }
        }
        return parseHifzMonth(
            payload ?: error("This Hifz month is not saved on this device yet. Connect once to download it."),
            cached,
        )
    }

    suspend fun saveHifzRegisterChange(
        studentId: String,
        month: String,
        entryDate: String,
        sessionId: String?,
        mode: String,
        creates: List<HifzRegisterChange> = emptyList(),
        updates: List<HifzRegisterChange> = emptyList(),
        deleteIds: List<String> = emptyList(),
        expectedVersions: Map<String, Long> = emptyMap(),
    ): HifzMonthRegister {
        queueHifzRegisterChange(studentId, month, entryDate, sessionId, mode, creates, updates, deleteIds, expectedVersions)
        if (isOnline()) return syncQueuedHifzRegister(studentId, month)
        return parseHifzMonth(
            database.hifzRegisterPayload(studentId, month) ?: error("The Hifz register cache is unavailable."),
            cached = true,
        )
    }

    fun queueHifzRegisterChange(
        studentId: String,
        month: String,
        entryDate: String,
        sessionId: String?,
        mode: String,
        creates: List<HifzRegisterChange> = emptyList(),
        updates: List<HifzRegisterChange> = emptyList(),
        deleteIds: List<String> = emptyList(),
        expectedVersions: Map<String, Long> = emptyMap(),
    ): HifzMonthRegister {
        require(creates.isNotEmpty() || updates.isNotEmpty() || deleteIds.isNotEmpty()) { "There is no Hifz change to save." }
        database.queueHifzRegisterDraft(HifzRegisterDraft(
            mutationId = UUID.randomUUID().toString(), studentId = studentId, month = month,
            entryDate = entryDate, sessionId = sessionId, mode = mode,
            creates = creates, updates = updates, deleteIds = deleteIds, expectedVersions = expectedVersions,
        ))
        return parseHifzMonth(
            database.hifzRegisterPayload(studentId, month) ?: error("The Hifz register cache is unavailable."),
            cached = true,
        )
    }

    suspend fun syncQueuedHifzRegister(studentId: String, month: String): HifzMonthRegister {
        check(isOnline()) { "The change is saved on this device and will sync when connection returns." }
        flushHifzRegisterDrafts(ensureAccessSession())
        return parseHifzMonth(checkNotNull(database.hifzRegisterPayload(studentId, month)), cached = false)
    }

    suspend fun discardHifzRegisterConflict(studentId: String, month: String): HifzMonthRegister {
        check(isOnline()) { "Connect to the internet before replacing a conflicted Hifz change." }
        val stored = ensureAccessSession()
        refreshHifzMonth(stored, studentId, month)
        database.latestHifzRegisterConflictId(studentId, month)?.let(database::discardHifzRegisterConflict)
        return parseHifzMonth(checkNotNull(database.hifzRegisterPayload(studentId, month)), cached = false)
    }

    private suspend fun pullChanges(stored: StoredSession) {
        var hasMore: Boolean
        do {
            val response = authorized(stored) { token -> api.sync(token, stored.deviceId, database.cursor()) }
            database.applyChanges(response)
            hasMore = response.optBoolean("hasMore", false)
        } while (hasMore)
    }

    private suspend fun refreshMentorWorkspace(stored: StoredSession) {
        val snapshot = database.snapshot(cached = false)
        if (snapshot?.portal != "staff") return
        val response = authorized(stored) { token -> api.mentorWorkspace(token, stored.deviceId) }
        database.replaceMentorWorkspace(response)
    }

    private suspend fun refreshChatWorkspace(stored: StoredSession) {
        val snapshot = database.snapshot(cached = false)
        if (snapshot?.portal != "staff") return
        val response = authorized(stored) { token -> api.chatWorkspace(token, stored.deviceId) }
        database.replaceChatWorkspace(response)
    }

    private suspend fun refreshFinanceWorkspace(stored: StoredSession, month: String) {
        val response = authorized(stored) { token -> api.financeWorkspace(token, stored.deviceId, month) }
        database.saveFinanceWorkspace(month, response)
    }

    private suspend fun refreshHifzMonth(stored: StoredSession, studentId: String, month: String) {
        val response = authorized(stored) { token -> api.studentHifzMonth(token, stored.deviceId, studentId, month) }
        database.saveHifzRegister(studentId, month, response)
    }

    suspend fun saveHifzDraft(
        studentId: String,
        entryDate: String,
        mode: String,
        surahName: String,
        startVerse: Int,
        endVerse: Int,
        notes: String?,
    ): HomeSnapshot {
        val draft = HifzDraft(UUID.randomUUID().toString(), studentId, entryDate, mode, surahName, startVerse, endVerse, notes)
        database.queueHifzDraft(draft)
        if (isOnline()) {
            val stored = ensureAccessSession()
            flushHifzDrafts(stored)
        }
        return checkNotNull(database.snapshot(cached = !isOnline()))
    }

    suspend fun createStudent(input: NewStudentInput): HomeSnapshot {
        check(isOnline()) { "Connect to the internet to add a student" }
        val stored = ensureAccessSession()
        authorized(stored) { token -> api.createStudent(token, stored.deviceId, input) }
        return bootstrap(stored.deviceId)
    }

    suspend fun logout() {
        val stored = secureStore.read()
        if (stored != null && isOnline()) runCatching { api.logout(stored) }
        accessToken = null
        secureStore.clear()
    }

    private suspend fun bootstrap(deviceId: String): HomeSnapshot {
        val stored = secureStore.read() ?: error("Sign in again")
        val response = authorized(stored) { token -> api.bootstrap(token, deviceId) }
        database.replaceBootstrap(response)
        return checkNotNull(database.snapshot(cached = false))
    }

    private suspend fun ensureAccessSession(): StoredSession {
        val stored = secureStore.read() ?: error("Sign in again")
        if (accessToken == null) {
            val refreshed = api.refresh(stored)
            accessToken = refreshed.accessToken
            secureStore.save(StoredSession(stored.deviceId, refreshed.refreshToken))
        }
        return stored
    }

    private suspend fun <T> authorized(stored: StoredSession, request: suspend (String) -> T): T {
        val token = accessToken ?: run {
            val refreshed = api.refresh(stored)
            accessToken = refreshed.accessToken
            secureStore.save(StoredSession(refreshed.deviceId, refreshed.refreshToken))
            refreshed.accessToken
        }
        return try {
            request(token)
        } catch (error: ApiException) {
            if (error.status != 401) throw error
            val latestStored = secureStore.read() ?: throw error
            val refreshed = api.refresh(latestStored)
            accessToken = refreshed.accessToken
            secureStore.save(StoredSession(refreshed.deviceId, refreshed.refreshToken))
            request(refreshed.accessToken)
        }
    }

    private suspend fun flushAttendanceDrafts(stored: StoredSession) {
        for (draft in database.pendingAttendanceDrafts()) {
            try {
                val response = authorized(stored) { token -> api.submitAttendance(token, stored.deviceId, draft) }
                database.markAttendanceDraftApplied(draft.mutationId, response)
            } catch (error: ApiException) {
                if (error.status in setOf(400, 403, 409)) {
                    database.markAttendanceDraftRejected(draft.mutationId, error.code, error.message)
                } else {
                    throw error
                }
            }
        }
    }

    private suspend fun flushLeaveDrafts(stored: StoredSession) {
        for (draft in database.pendingLeaveDrafts()) {
            try {
                val response = authorized(stored) { token -> api.submitLeave(token, stored.deviceId, draft) }
                database.markLeaveDraftApplied(draft.mutationId, response)
            } catch (error: ApiException) {
                if (error.status in setOf(400, 403, 409)) {
                    database.markLeaveDraftRejected(draft.mutationId, error.code, error.message)
                } else {
                    throw error
                }
            }
        }
    }

    private suspend fun flushChatDrafts(stored: StoredSession) {
        for (draft in database.pendingChatDrafts()) {
            try {
                val response = authorized(stored) { token -> api.submitChatMessage(token, stored.deviceId, draft) }
                database.markChatDraftApplied(draft.mutationId, response)
            } catch (error: ApiException) {
                if (error.status in setOf(400, 403, 409)) database.markChatDraftRejected(draft.mutationId, error.message) else throw error
            }
        }
    }

    private suspend fun flushHifzDrafts(stored: StoredSession) {
        for (draft in database.pendingHifzDrafts()) {
            try {
                val response = authorized(stored) { token -> api.submitHifz(token, stored.deviceId, draft) }
                database.markHifzDraftApplied(draft.mutationId, response.getJSONObject("entry"))
            } catch (error: ApiException) {
                if (error.status in setOf(400, 403, 409)) {
                    database.markHifzDraftRejected(draft.mutationId, error.message)
                } else {
                    throw error
                }
            }
        }
    }

    private suspend fun flushHifzRegisterDrafts(stored: StoredSession) {
        for (draft in database.pendingHifzRegisterDrafts()) {
            try {
                val response = authorized(stored) { token -> api.submitHifzRegister(token, stored.deviceId, draft) }
                database.markHifzRegisterApplied(draft, response)
            } catch (error: ApiException) {
                if (error.status in setOf(400, 403, 409)) {
                    database.markHifzRegisterRejected(draft.mutationId, error.code, error.message)
                    runCatching { refreshHifzMonth(stored, draft.studentId, draft.month) }
                } else {
                    throw error
                }
            }
        }
    }

    private fun parseFinanceWorkspace(month: String, payload: JSONObject, cached: Boolean): FinanceWorkspace {
        val capabilitiesJson = payload.optJSONObject("capabilities") ?: JSONObject()
        val studentsJson = payload.optJSONArray("students")
        val activityJson = payload.optJSONArray("recent_activity")
        val setupJson = payload.optJSONObject("setup") ?: JSONObject()
        val categoriesJson = setupJson.optJSONArray("categories")
        val accountsJson = setupJson.optJSONArray("accounts")
        return FinanceWorkspace(
            month = month,
            capabilities = FinanceCapabilities(
                canViewOverview = capabilitiesJson.optBoolean("can_view_overview"),
                canViewDues = capabilitiesJson.optBoolean("can_view_dues"),
                canViewTransactions = capabilitiesJson.optBoolean("can_view_transactions"),
                canAddCharge = capabilitiesJson.optBoolean("can_add_charge"),
                canCollectPayment = capabilitiesJson.optBoolean("can_collect_payment"),
            ),
            students = buildList {
                if (studentsJson != null) for (index in 0 until studentsJson.length()) {
                    studentsJson.optJSONObject(index)?.let { add(parseFinanceStudent(it)) }
                }
            },
            recentActivity = buildList {
                if (activityJson != null) for (index in 0 until activityJson.length()) {
                    val item = activityJson.optJSONObject(index) ?: continue
                    add(FinanceActivity(
                        id = item.optString("id", "$index"), type = item.optString("type"),
                        studentId = nullableJsonString(item, "student_id"), studentName = item.optString("student_name", "Student"),
                        description = item.optString("description", item.optString("category_name", "Finance item")),
                        amount = item.optDouble("amount"), createdAt = nullableJsonString(item, "created_at") ?: nullableJsonString(item, "date"),
                        recordedBy = nullableJsonString(item, "recorded_by_name"),
                    ))
                }
            },
            categories = buildList {
                if (categoriesJson != null) for (index in 0 until categoriesJson.length()) {
                    val item = categoriesJson.optJSONObject(index) ?: continue
                    add(FinanceCategory(item.optString("id"), item.optString("name", "Charge"), nullableJsonString(item, "description"), item.optBoolean("is_active", true)))
                }
            },
            accounts = buildList {
                if (accountsJson != null) for (index in 0 until accountsJson.length()) {
                    val item = accountsJson.optJSONObject(index) ?: continue
                    add(FinancePaymentAccount(
                        item.optString("id"), item.optString("account_name", item.optString("account_holder", "Account")),
                        item.optString("account_type"), item.optBoolean("is_active", true),
                    ))
                }
            },
            cached = cached,
        )
    }

    private fun parseFinanceStudent(item: JSONObject) = FinanceStudentBalance(
        id = item.optString("student_id", item.optString("adm_no", item.optString("id"))),
        name = item.optString("name", "Student"), standard = item.optString("standard"), division = nullableJsonString(item, "division"),
        totalDue = item.optDouble("total_due", item.optDouble("outstanding")), overdue = item.optDouble("overdue"),
        currentMonthDue = item.optDouble("current_month_due"), creditBalance = item.optDouble("credit_balance"), status = item.optString("status", "clear"),
    )

    private fun parseFinanceAccount(payload: JSONObject, cached: Boolean): StudentFinanceAccount {
        val student = parseFinanceStudent(payload.optJSONObject("student") ?: JSONObject())
        val summary = payload.optJSONObject("summary") ?: JSONObject()
        val openItemsJson = payload.optJSONArray("open_items")
        val paymentsJson = payload.optJSONArray("payments")
        val rule = payload.optJSONObject("active_fee_rule")
        return StudentFinanceAccount(
            student = student,
            totalDue = summary.optDouble("total_due", summary.optDouble("outstanding")),
            overdue = summary.optDouble("overdue"), creditBalance = summary.optDouble("credit_balance", summary.optDouble("credits")),
            openItems = buildList {
                if (openItemsJson != null) for (index in 0 until openItemsJson.length()) {
                    val item = openItemsJson.optJSONObject(index) ?: continue
                    add(FinanceOpenItem(
                        id = item.optString("obligation_id", item.optString("id")), type = item.optString("type", "charge"),
                        categoryName = nullableJsonString(item, "category_name"), description = item.optString("description", "Finance item"),
                        amount = item.optDouble("amount"), paidAmount = item.optDouble("paid_amount"), balance = item.optDouble("balance"),
                        dueDate = nullableJsonString(item, "due_date"), month = nullableJsonString(item, "month"), status = item.optString("status", "open"),
                    ))
                }
            },
            payments = buildList {
                if (paymentsJson != null) for (index in 0 until paymentsJson.length()) {
                    val item = paymentsJson.optJSONObject(index) ?: continue
                    val allocationsJson = item.optJSONArray("allocations")
                    add(FinancePayment(
                        id = item.optString("id"), amount = item.optDouble("amount"), status = item.optString("status"),
                        method = item.optString("payment_method", item.optString("method", "payment")), accountName = nullableJsonString(item, "account_name"),
                        receiptNumber = nullableJsonString(item, "receipt_number") ?: nullableJsonString(item, "reference_number"), notes = nullableJsonString(item, "notes"),
                        date = nullableJsonString(item, "date"), createdAt = nullableJsonString(item, "created_at"),
                        allocations = buildList {
                            if (allocationsJson != null) for (allocationIndex in 0 until allocationsJson.length()) {
                                val allocation = allocationsJson.optJSONObject(allocationIndex) ?: continue
                                add(FinancePaymentAllocation(
                                    obligationId = allocation.optString("obligation_id", allocation.optString("item_id", allocation.optString("open_item_id"))),
                                    description = nullableJsonString(allocation, "description"), amount = allocation.optDouble("amount"),
                                ))
                            }
                        },
                    ))
                }
            },
            activeFeeAmount = rule?.optDouble("amount"), activeFeeLabel = rule?.let { nullableJsonString(it, "label") ?: nullableJsonString(it, "source") },
            activeFeeFrom = rule?.let { nullableJsonString(it, "effective_from") }, cached = cached,
        )
    }

    private fun nullableJsonString(json: JSONObject, key: String): String? =
        if (!json.has(key) || json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() && it != "null" }

    private fun parseStudentProgressReport(
        cacheKey: String,
        reportType: String,
        startDate: String,
        endDate: String,
        payload: JSONObject,
        cached: Boolean,
    ): StudentProgressReport {
        val studentJson = payload.optJSONObject("student") ?: JSONObject()
        val attendanceJson = payload.optJSONObject("attendance_totals")
        val performanceJson = payload.optJSONObject("performance")
        val activityJson = payload.optJSONObject("hifz_activity") ?: JSONObject()
        val logsJson = payload.optJSONArray("period_logs")
        val logs = buildList {
            if (logsJson != null) for (index in 0 until logsJson.length()) {
                val item = logsJson.optJSONObject(index) ?: continue
                add(ReportLog(
                    id = item.optString("id", "$index"), date = item.optString("entry_date").take(10), mode = item.optString("mode", "Entry"),
                    surahName = item.optString("surah_name").ifBlank { null },
                    startVerse = if (item.isNull("start_v")) null else item.optInt("start_v"),
                    endVerse = if (item.isNull("end_v")) null else item.optInt("end_v"),
                ))
            }
        }
        return StudentProgressReport(
            cacheKey = cacheKey, reportType = reportType, startDate = startDate, endDate = endDate,
            academicYear = payload.optString("academic_year"), hifzStage = payload.optString("hifz_stage", "MEMORIZING"),
            student = ReportStudent(
                id = studentJson.optString("adm_no"), name = studentJson.optString("name", "Student"), standard = studentJson.optString("standard"),
                batchYear = studentJson.optString("batch_year").ifBlank { null },
                mentorName = studentJson.optString("hifz_mentor").ifBlank { studentJson.optString("school_mentor").ifBlank { studentJson.optString("madrasa_mentor").ifBlank { null } } },
                parentPhone = studentJson.optString("parent_phone").ifBlank { null },
            ),
            attendance = attendanceJson?.let { ReportAttendanceTotals(
                cancelled = it.optInt("cancelledClasses"), attended = it.optInt("attendedClasses"), notAttended = it.optInt("notAttendedClasses"),
                effective = it.optInt("effectiveClasses"), scheduled = it.optInt("plannedClasses"),
            ) },
            performance = performanceJson?.let { ReportPerformance(
                newVersePoints = it.optDouble("newVersePoints"), recentRevisionPoints = it.optDouble("recentRevisionPoints"),
                juzPoints = it.optDouble("juzPoints"), juzMax = it.optDouble("juzMax"), attendancePoints = it.optDouble("attendancePoints"),
                attendancePercentage = it.optDouble("attendancePercentage"), totalPoints = it.optDouble("totalPoints"), totalMax = it.optDouble("totalMax"),
                percentage = it.optDouble("percentage"), grade = it.optString("grade", "NO GRADE"), pointDays = it.optDouble("totalClassDays"),
            ) },
            activity = ReportHifzActivity(
                newPages = activityJson.optDouble("new_pages_recited"), revisionDays = payload.optInt("revision_days"),
                juzRevised = activityJson.optDouble("juz_recited"), completedLifetimeJuz = activityJson.optInt("completed_lifetime_juz"),
                newJuzRevision = activityJson.optDouble("new_juz_revision"), oldJuzRevision = activityJson.optDouble("old_juz_revision"),
            ),
            logs = logs,
            cached = cached,
        )
    }

    private fun parseStudentProfile(payload: JSONObject, cached: Boolean): MentorStudentProfile {
        val sectionsJson = payload.optJSONArray("sections")
        return MentorStudentProfile(
            id = payload.optString("id"), name = payload.optString("name", "Student"),
            photoUrl = nullableJsonString(payload, "photoUrl"), status = payload.optString("status", "active"),
            standard = payload.optString("standard"), division = nullableJsonString(payload, "division"),
            hifzStage = payload.optString("hifzStage", "MEMORIZING"),
            sections = buildList {
                if (sectionsJson != null) for (sectionIndex in 0 until sectionsJson.length()) {
                    val section = sectionsJson.optJSONObject(sectionIndex) ?: continue
                    val fieldsJson = section.optJSONArray("fields")
                    add(StudentDetailSection(
                        key = section.optString("key", "$sectionIndex"), title = section.optString("title", "Details"),
                        fields = buildList {
                            if (fieldsJson != null) for (fieldIndex in 0 until fieldsJson.length()) {
                                val field = fieldsJson.optJSONObject(fieldIndex) ?: continue
                                val value = nullableJsonString(field, "value") ?: continue
                                add(StudentDetailField(field.optString("label", "Detail"), value))
                            }
                        },
                    ))
                }
            },
            cached = cached,
        )
    }

    private fun parseHifzMonth(payload: JSONObject, cached: Boolean): HifzMonthRegister {
        val student = payload.optJSONObject("student") ?: JSONObject()
        val summary = payload.optJSONObject("summary") ?: JSONObject()
        val daysJson = payload.optJSONArray("days")
        val studentId = student.optString("id", student.optString("admNo"))
        val month = payload.optString("month")
        val mutationState = database.hifzRegisterMutationState(studentId, month)
        fun parseEntry(item: JSONObject) = HifzRegisterEntry(
            id = item.optString("id"), mode = item.optString("mode"), entryDate = item.optString("entry_date").take(10),
            surahName = nullableJsonString(item, "surah_name"), startVerse = if (item.isNull("start_v")) null else item.optInt("start_v"),
            endVerse = if (item.isNull("end_v")) null else item.optInt("end_v"), juzNumber = if (item.isNull("juz_number")) null else item.optInt("juz_number"),
            juzPortion = nullableJsonString(item, "juz_portion"), notes = nullableJsonString(item, "notes"),
            recordedBy = nullableJsonString(item, "recorded_by_name"), version = item.optLong("entity_version"),
            syncStatus = nullableJsonString(item, "sync_status"), syncError = nullableJsonString(item, "sync_error"),
        )
        return HifzMonthRegister(
            studentId = studentId, studentName = student.optString("name", "Student"),
            standard = student.optString("class"), division = nullableJsonString(student, "division"),
            hifzStage = student.optString("hifzStage", "MEMORIZING"), month = month,
            summary = HifzRegisterSummary(
                newHifzPages = summary.optDouble("newHifzPages"), revisionDays = summary.optInt("revisionDays"),
                juzRevised = summary.optDouble("juzRevised"), completedJuz = summary.optInt("completedJuz"),
                completionPercent = summary.optDouble("completionPercent"), newJuzRevisionTotal = summary.optDouble("newJuzRevisionTotal"),
                oldJuzRevisionTotal = summary.optDouble("oldJuzRevisionTotal"), cycleProgress = summary.optDouble("cycleProgress"),
            ),
            days = buildList {
                if (daysJson != null) for (dayIndex in 0 until daysJson.length()) {
                    val day = daysJson.optJSONObject(dayIndex) ?: continue
                    val attendance = day.optJSONObject("attendance")
                    val eligibility = day.optJSONObject("eligibility") ?: JSONObject()
                    val entries = day.optJSONObject("entries") ?: JSONObject()
                    val byMode = linkedMapOf<String, List<HifzRegisterEntry>>()
                    listOf("newHifz", "recentRevision", "juzRevision", "newJuzRevision", "oldJuzRevision").forEach { key ->
                        val rows = entries.optJSONArray(key) ?: org.json.JSONArray()
                        byMode[key] = buildList { for (entryIndex in 0 until rows.length()) rows.optJSONObject(entryIndex)?.let { add(parseEntry(it)) } }
                    }
                    add(HifzRegisterDay(
                        date = day.optString("date"),
                        attendance = attendance?.let { HifzDayAttendance(
                            status = it.optString("status"), sessionId = it.optString("sessionId"), sessionName = it.optString("sessionName"),
                            sessionStart = it.optString("sessionStart"), sessionEnd = it.optString("sessionEnd"),
                        ) },
                        eligibility = HifzEligibility(
                            allowed = eligibility.optBoolean("allowed"), reason = nullableJsonString(eligibility, "reason"),
                            sessionId = nullableJsonString(eligibility, "sessionId"), attendanceStatus = nullableJsonString(eligibility, "attendanceStatus"),
                        ),
                        entries = byMode,
                    ))
                }
            },
            pendingCount = mutationState.first, conflictCount = mutationState.second, latestError = mutationState.third,
            cached = cached,
        )
    }
}
