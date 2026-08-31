package `in`.ribath.mentor.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.nio.charset.StandardCharsets

class MobileApiClient(private val baseUrl: String) {
    suspend fun login(email: String, password: String, installationId: String): LoginSession {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("installationId", installationId)
            .put("platform", "android")
            .put("deviceName", android.os.Build.MODEL)
            .put("appVersion", "0.6.0")
            .put("osVersion", android.os.Build.VERSION.RELEASE)
            .put("pushToken", JSONObject.NULL)
        val json = request("POST", "/auth/login", body)
        return LoginSession(json.getString("accessToken"), json.getString("refreshToken"), json.getJSONObject("device").getString("id"))
    }

    suspend fun refresh(session: StoredSession): LoginSession {
        val json = request("POST", "/auth/refresh", JSONObject()
            .put("deviceId", session.deviceId)
            .put("refreshToken", session.refreshToken))
        return LoginSession(json.getString("accessToken"), json.getString("refreshToken"), session.deviceId)
    }

    suspend fun bootstrap(accessToken: String, deviceId: String): JSONObject =
        request("GET", "/bootstrap", accessToken = accessToken, deviceId = deviceId)

    suspend fun sync(accessToken: String, deviceId: String, cursor: Long): JSONObject =
        request("GET", "/sync?cursor=$cursor&limit=250", accessToken = accessToken, deviceId = deviceId)

    suspend fun attendanceDay(accessToken: String, deviceId: String, date: String): JSONObject =
        request("GET", "/attendance/day?date=$date", accessToken = accessToken, deviceId = deviceId)

    suspend fun attendanceRoster(accessToken: String, deviceId: String, scheduleId: String, date: String): JSONObject =
        request("GET", "/attendance/sessions/$scheduleId?date=$date", accessToken = accessToken, deviceId = deviceId)

    suspend fun mentorWorkspace(accessToken: String, deviceId: String): JSONObject =
        request("GET", "/mentor/workspace", accessToken = accessToken, deviceId = deviceId)

    suspend fun studentProfile(accessToken: String, deviceId: String, studentId: String): JSONObject =
        request(
            "GET",
            "/students/${URLEncoder.encode(studentId, StandardCharsets.UTF_8.toString())}/profile",
            accessToken = accessToken,
            deviceId = deviceId,
        )

    suspend fun studentHifzMonth(accessToken: String, deviceId: String, studentId: String, month: String): JSONObject =
        request(
            "GET",
            "/students/${URLEncoder.encode(studentId, StandardCharsets.UTF_8.toString())}/hifz-month?month=${URLEncoder.encode(month, StandardCharsets.UTF_8.toString())}",
            accessToken = accessToken,
            deviceId = deviceId,
        )

    suspend fun studentProgressReport(
        accessToken: String,
        deviceId: String,
        studentId: String,
        reportType: String,
        startDate: String,
        endDate: String,
    ): JSONObject {
        fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
        val query = "student_id=${encode(studentId)}&type=${encode(reportType)}&start_date=${encode(startDate)}&end_date=${encode(endDate)}"
        return request("GET", "/reports/student-progress?$query", accessToken = accessToken, deviceId = deviceId)
    }

    suspend fun chatWorkspace(accessToken: String, deviceId: String): JSONObject =
        request("GET", "/chat/workspace", accessToken = accessToken, deviceId = deviceId)

    suspend fun chatMessages(accessToken: String, deviceId: String, conversationId: String, after: String?): JSONObject {
        val cursor = after?.let { "?after=${URLEncoder.encode(it, StandardCharsets.UTF_8.toString())}" }.orEmpty()
        return request("GET", "/chat/conversations/$conversationId/messages$cursor", accessToken = accessToken, deviceId = deviceId)
    }

    suspend fun startPrivateChat(accessToken: String, deviceId: String, otherStaffId: String): JSONObject =
        request("POST", "/chat/conversations/private", JSONObject().put("otherStaffId", otherStaffId), accessToken, deviceId)

    suspend fun markChatRead(accessToken: String, deviceId: String, conversationId: String): JSONObject =
        request("PUT", "/chat/conversations/$conversationId/read", JSONObject(), accessToken, deviceId)

    suspend fun submitChatMessage(accessToken: String, deviceId: String, draft: ChatDraft): JSONObject =
        request("POST", "/mutations/chat-messages", JSONObject()
            .put("mutationId", draft.mutationId)
            .put("conversationId", draft.conversationId)
            .put("content", draft.content), accessToken, deviceId)

    suspend fun financeWorkspace(accessToken: String, deviceId: String, month: String): JSONObject =
        request(
            "GET",
            "/finance/workspace?month=${URLEncoder.encode(month, StandardCharsets.UTF_8.toString())}&limit=1000",
            accessToken = accessToken,
            deviceId = deviceId,
        )

    suspend fun financeAccount(accessToken: String, deviceId: String, studentId: String): JSONObject =
        request(
            "GET",
            "/finance/students/${URLEncoder.encode(studentId, StandardCharsets.UTF_8.toString())}/account",
            accessToken = accessToken,
            deviceId = deviceId,
        )

    suspend fun submitFinanceCharge(accessToken: String, deviceId: String, input: FinanceChargeInput): JSONObject =
        request("POST", "/finance/charges", JSONObject()
            .put("student_id", input.studentId)
            .put("category_id", input.categoryId)
            .put("amount", input.amount)
            .put("date", input.date)
            .put("description", input.description ?: JSONObject.NULL)
            .put("idempotency_key", input.idempotencyKey), accessToken, deviceId)

    suspend fun submitFinancePayment(accessToken: String, deviceId: String, input: FinancePaymentInput): JSONObject {
        val allocations = org.json.JSONArray()
        input.allocations.forEach { item ->
            allocations.put(JSONObject().put("obligation_id", item.obligationId).put("amount", item.amount.toString()))
        }
        return request("POST", "/finance/payments", JSONObject()
            .put("student_id", input.studentId)
            .put("amount", input.amount)
            .put("method", input.method)
            .put("payment_account_id", input.paymentAccountId ?: JSONObject.NULL)
            .put("reference_number", input.referenceNumber ?: JSONObject.NULL)
            .put("date", input.date)
            .put("notes", input.notes ?: JSONObject.NULL)
            .put("allocations", allocations)
            .put("idempotency_key", input.idempotencyKey), accessToken, deviceId)
    }

    suspend fun submitAttendance(accessToken: String, deviceId: String, draft: AttendanceDraft): JSONObject {
        val marks = org.json.JSONArray()
        draft.marks.toSortedMap().forEach { (studentId, status) ->
            marks.put(JSONObject().put("studentId", studentId).put("status", status))
        }
        return request("POST", "/mutations/attendance", JSONObject()
            .put("mutationId", draft.mutationId)
            .put("scheduleId", draft.scheduleId)
            .put("date", draft.date)
            .put("scheduleRevision", draft.scheduleRevision)
            .put("sessionRevision", draft.sessionRevision)
            .put("rosterStateHash", draft.rosterStateHash)
            .put("marks", marks), accessToken, deviceId)
    }

    suspend fun submitLeave(accessToken: String, deviceId: String, draft: LeaveDraft): JSONObject {
        val body = JSONObject().put("mutationId", draft.mutationId).put("operation", draft.operation)
        if (draft.operation == "create") {
            body.put("studentId", draft.studentId)
                .put("leaveType", draft.leaveType)
                .put("startDatetime", draft.startDatetime)
                .put("endDatetime", draft.endDatetime ?: JSONObject.NULL)
                .put("reasonCategory", draft.reasonCategory)
                .put("remarks", draft.remarks ?: JSONObject.NULL)
                .put("companionName", draft.companionName ?: JSONObject.NULL)
                .put("companionRelationship", draft.companionRelationship ?: JSONObject.NULL)
                .put("expectedPresenceStateHash", draft.expectedPresenceStateHash)
        } else {
            body.put("leaveId", draft.leaveId)
                .put("expectedLeaveRevision", draft.expectedLeaveRevision)
                .put("returnDatetime", draft.returnDatetime)
        }
        return request("POST", "/mutations/leaves", body, accessToken, deviceId)
    }

    suspend fun submitHifz(accessToken: String, deviceId: String, draft: HifzDraft): JSONObject =
        request("POST", "/mutations/hifz-entries", JSONObject()
            .put("mutationId", draft.mutationId)
            .put("studentId", draft.studentId)
            .put("entryDate", draft.entryDate)
            .put("mode", draft.mode)
            .put("surahName", draft.surahName)
            .put("startVerse", draft.startVerse)
            .put("endVerse", draft.endVerse)
            .put("notes", draft.notes ?: JSONObject.NULL), accessToken, deviceId)

    suspend fun submitHifzRegister(accessToken: String, deviceId: String, draft: HifzRegisterDraft): JSONObject {
        fun changeJson(change: HifzRegisterChange) = JSONObject().apply {
            change.id?.let { put("id", it) }
            put("surah_name", change.surahName ?: JSONObject.NULL)
            put("start_v", change.startVerse ?: JSONObject.NULL)
            put("end_v", change.endVerse ?: JSONObject.NULL)
            put("juz_number", change.juzNumber ?: JSONObject.NULL)
            put("juz_portion", change.juzPortion ?: JSONObject.NULL)
        }
        val creates = org.json.JSONArray().apply { draft.creates.forEach { put(changeJson(it)) } }
        val updates = org.json.JSONArray().apply { draft.updates.forEach { put(changeJson(it)) } }
        val deletes = org.json.JSONArray().apply { draft.deleteIds.forEach { put(it) } }
        val versions = JSONObject().apply { draft.expectedVersions.forEach { (id, version) -> put(id, version) } }
        return request("POST", "/mutations/hifz-register", JSONObject()
            .put("mutation_id", draft.mutationId)
            .put("student_id", draft.studentId)
            .put("entry_date", draft.entryDate)
            .put("session_id", draft.sessionId ?: JSONObject.NULL)
            .put("mode", draft.mode)
            .put("creates", creates)
            .put("updates", updates)
            .put("delete_ids", deletes)
            .put("expected_versions", versions), accessToken, deviceId)
    }

    suspend fun createStudent(accessToken: String, deviceId: String, input: NewStudentInput): JSONObject =
        request("POST", "/mutations/students", JSONObject()
            .put("admissionNumber", input.admissionNumber)
            .put("name", input.name)
            .put("dateOfBirth", input.dateOfBirth)
            .put("standard", input.standard)
            .put("gender", input.gender ?: JSONObject.NULL)
            .put("parentPhone", input.parentPhone ?: JSONObject.NULL), accessToken, deviceId)

    suspend fun logout(session: StoredSession) {
        request("POST", "/auth/logout", JSONObject().put("deviceId", session.deviceId).put("refreshToken", session.refreshToken))
    }

    private suspend fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
        deviceId: String? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            if (accessToken != null) setRequestProperty("Authorization", "Bearer $accessToken")
            if (deviceId != null) setRequestProperty("x-device-id", deviceId)
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.bufferedWriter().use { it.write(body.toString()) }
            }
        }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        val json = runCatching { JSONObject(text) }.getOrElse { JSONObject().put("error", "Invalid server response") }
        if (connection.responseCode !in 200..299) throw ApiException(
            connection.responseCode,
            json.optString("error", "Request failed"),
            json.optString("code").ifBlank { null },
        )
        json
    }
}

class ApiException(val status: Int, override val message: String, val code: String? = null) : Exception(message)
