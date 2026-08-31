package `in`.ribath.mentor.ui

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import `in`.ribath.mentor.data.HomeSnapshot
import `in`.ribath.mentor.data.AttendanceRoster
import `in`.ribath.mentor.data.AttendanceSession
import `in`.ribath.mentor.data.ChatConversation
import `in`.ribath.mentor.data.ChatMessage
import `in`.ribath.mentor.data.ChatWorkspace
import `in`.ribath.mentor.data.FinanceChargeInput
import `in`.ribath.mentor.data.FinancePaymentInput
import `in`.ribath.mentor.data.FinanceStudentBalance
import `in`.ribath.mentor.data.FinanceWorkspace
import `in`.ribath.mentor.data.LeaveStudent
import `in`.ribath.mentor.data.MentorLeave
import `in`.ribath.mentor.data.MentorWorkspace
import `in`.ribath.mentor.data.MobileRepository
import `in`.ribath.mentor.data.NewStudentInput
import `in`.ribath.mentor.data.StudentProgressReport
import `in`.ribath.mentor.data.StudentFinanceAccount
import `in`.ribath.mentor.data.StudentSummary
import `in`.ribath.mentor.data.MentorStudentProfile
import `in`.ribath.mentor.data.HifzMonthRegister
import `in`.ribath.mentor.data.HifzRegisterChange
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate

sealed interface AppState {
    data object Restoring : AppState
    data object SignedOut : AppState
    data class SettingUp(val message: String) : AppState
    data class Ready(val snapshot: HomeSnapshot, val syncing: Boolean = false) : AppState
    data class Failure(val message: String, val cached: HomeSnapshot? = null) : AppState
}

data class AttendanceUiState(
    val date: String = LocalDate.now().toString(),
    val sessions: List<AttendanceSession> = emptyList(),
    val roster: AttendanceRoster? = null,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
)

data class LeavesUiState(
    val workspace: MentorWorkspace = MentorWorkspace(),
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
)

data class ReportsUiState(
    val report: StudentProgressReport? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

data class ChatUiState(
    val workspace: ChatWorkspace = ChatWorkspace(),
    val activeConversationId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val loading: Boolean = false,
    val sending: Boolean = false,
    val error: String? = null,
)

data class FinanceUiState(
    val workspace: FinanceWorkspace? = null,
    val account: StudentFinanceAccount? = null,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val online: Boolean = false,
)

data class StudentUiState(
    val summary: StudentSummary? = null,
    val profile: MentorStudentProfile? = null,
    val register: HifzMonthRegister? = null,
    val month: String = java.time.YearMonth.now().toString(),
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val online: Boolean = false,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = MobileRepository(application)
    private val mutableState = MutableStateFlow<AppState>(AppState.Restoring)
    val state: StateFlow<AppState> = mutableState.asStateFlow()
    private val mutableAttendance = MutableStateFlow(AttendanceUiState())
    val attendance: StateFlow<AttendanceUiState> = mutableAttendance.asStateFlow()
    private val mutableLeaves = MutableStateFlow(LeavesUiState())
    val leaves: StateFlow<LeavesUiState> = mutableLeaves.asStateFlow()
    private val mutableReports = MutableStateFlow(ReportsUiState())
    val reports: StateFlow<ReportsUiState> = mutableReports.asStateFlow()
    private val mutableChat = MutableStateFlow(ChatUiState())
    val chat: StateFlow<ChatUiState> = mutableChat.asStateFlow()
    private val mutableFinance = MutableStateFlow(FinanceUiState())
    val finance: StateFlow<FinanceUiState> = mutableFinance.asStateFlow()
    private val mutableStudent = MutableStateFlow(StudentUiState())
    val student: StateFlow<StudentUiState> = mutableStudent.asStateFlow()
    private val connectivityManager = application.getSystemService(ConnectivityManager::class.java)
    @Volatile private var wasOnline = repository.isOnline()
    @Volatile private var reconnectSyncing = false
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = updateConnectionState()
        override fun onLost(network: Network) = updateConnectionState()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = updateConnectionState()
    }

    init {
        runCatching { connectivityManager.registerDefaultNetworkCallback(networkCallback) }
        viewModelScope.launch {
            val restored = runCatching { repository.restore() }.getOrNull()
            mutableState.value = restored?.let { AppState.Ready(it) } ?: AppState.SignedOut
        }
    }

    private fun updateConnectionState() {
        val online = repository.isOnline()
        val reconnected = online && !wasOnline
        wasOnline = online
        viewModelScope.launch {
            mutableFinance.value = mutableFinance.value.copy(online = online)
            mutableStudent.value = mutableStudent.value.copy(online = online)
            if (reconnected) synchronizeAfterReconnect()
        }
    }

    private suspend fun synchronizeAfterReconnect() {
        val current = (mutableState.value as? AppState.Ready)?.snapshot ?: return
        if (reconnectSyncing) return
        reconnectSyncing = true
        try {
            mutableState.value = AppState.Ready(current, syncing = true)
            runCatching { repository.synchronize() }.onSuccess { snapshot ->
                mutableState.value = AppState.Ready(snapshot)
                if (snapshot.portal == "staff") mutableLeaves.value = mutableLeaves.value.copy(workspace = repository.cachedMentorWorkspace(), loading = false, error = null)
            }.onFailure {
                mutableState.value = AppState.Ready(current, syncing = false)
            }
            val opened = mutableStudent.value.summary
            val month = mutableStudent.value.month
            if (opened != null) {
                val profileRequest = viewModelScope.async { runCatching { repository.studentProfile(opened.id) } }
                val registerRequest = viewModelScope.async { runCatching { repository.hifzMonth(opened.id, month) } }
                val profile = profileRequest.await().getOrNull()
                val register = registerRequest.await().getOrNull()
                if (mutableStudent.value.summary?.id == opened.id && mutableStudent.value.month == month) {
                    mutableStudent.value = mutableStudent.value.copy(
                        profile = profile ?: mutableStudent.value.profile,
                        register = register ?: mutableStudent.value.register,
                        saving = false,
                        online = true,
                    )
                }
            }
        } finally {
            reconnectSyncing = false
        }
    }

    override fun onCleared() {
        runCatching { connectivityManager.unregisterNetworkCallback(networkCallback) }
        super.onCleared()
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            mutableState.value = AppState.SettingUp("Setting up your mentor data…")
            runCatching { repository.login(email, password) }
                .onSuccess { mutableState.value = AppState.Ready(it) }
                .onFailure { mutableState.value = AppState.Failure(it.message ?: "Sign in failed") }
        }
    }

    fun sync() {
        val current = (mutableState.value as? AppState.Ready)?.snapshot ?: return
        viewModelScope.launch {
            mutableState.value = AppState.Ready(current, syncing = true)
            runCatching { repository.synchronize() }
                .onSuccess {
                    mutableState.value = AppState.Ready(it)
                    if (it.portal == "staff") mutableLeaves.value = mutableLeaves.value.copy(workspace = repository.cachedMentorWorkspace(), loading = false, error = null)
                }
                .onFailure { mutableState.value = AppState.Failure(it.message ?: "Sync failed", current) }
        }
    }

    fun loadMentorWorkspace() {
        viewModelScope.launch {
            mutableLeaves.value = mutableLeaves.value.copy(loading = true, error = null)
            runCatching { repository.mentorWorkspace() }
                .onSuccess { mutableLeaves.value = LeavesUiState(workspace = it) }
                .onFailure { error -> mutableLeaves.value = mutableLeaves.value.copy(loading = false, error = error.message ?: "Mentor data could not be loaded") }
        }
    }

    fun createLeave(
        student: LeaveStudent,
        leaveType: String,
        startDatetime: String,
        endDatetime: String?,
        reasonCategory: String,
        remarks: String?,
        companionName: String?,
        companionRelationship: String?,
    ) {
        viewModelScope.launch {
            mutableLeaves.value = mutableLeaves.value.copy(saving = true, error = null)
            runCatching { repository.createLeave(student, leaveType, startDatetime, endDatetime, reasonCategory, remarks, companionName, companionRelationship) }
                .onSuccess { mutableLeaves.value = LeavesUiState(workspace = it) }
                .onFailure { error -> mutableLeaves.value = mutableLeaves.value.copy(saving = false, error = error.message ?: "Leave could not be saved") }
        }
    }

    fun returnLeave(leave: MentorLeave, returnDatetime: String) {
        viewModelScope.launch {
            mutableLeaves.value = mutableLeaves.value.copy(saving = true, error = null)
            runCatching { repository.returnLeave(leave, returnDatetime) }
                .onSuccess { mutableLeaves.value = LeavesUiState(workspace = it) }
                .onFailure { error -> mutableLeaves.value = mutableLeaves.value.copy(saving = false, error = error.message ?: "Return could not be saved") }
        }
    }

    fun discardLeaveConflict(mutationId: String) {
        viewModelScope.launch {
            mutableLeaves.value = mutableLeaves.value.copy(loading = true, error = null)
            runCatching { repository.discardLeaveConflict(mutationId) }
                .onSuccess { mutableLeaves.value = LeavesUiState(workspace = it) }
                .onFailure { error -> mutableLeaves.value = mutableLeaves.value.copy(loading = false, error = error.message ?: "Conflict could not be refreshed") }
        }
    }

    fun generateStudentReport(studentId: String, reportType: String, startDate: String, endDate: String) {
        viewModelScope.launch {
            mutableReports.value = ReportsUiState(loading = true)
            runCatching { repository.studentProgressReport(studentId, reportType, startDate, endDate) }
                .onSuccess { mutableReports.value = ReportsUiState(report = it) }
                .onFailure { error -> mutableReports.value = ReportsUiState(error = error.message ?: "Report could not be generated") }
        }
    }

    fun loadChat() {
        viewModelScope.launch {
            mutableChat.value = mutableChat.value.copy(loading = true, error = null)
            runCatching { repository.chatWorkspace() }
                .onSuccess { workspace ->
                    mutableChat.value = mutableChat.value.copy(workspace = workspace, loading = false)
                    mutableChat.value.activeConversationId?.let { refreshChatMessages(it) }
                }
                .onFailure { error -> mutableChat.value = mutableChat.value.copy(loading = false, error = error.message ?: "Chat could not be loaded") }
        }
    }

    fun openChatConversation(conversation: ChatConversation) {
        viewModelScope.launch {
            mutableChat.value = mutableChat.value.copy(activeConversationId = conversation.id, loading = true, error = null)
            runCatching {
                val messages = repository.chatMessages(conversation.id)
                val workspace = repository.markChatRead(conversation.id)
                workspace to messages
            }.onSuccess { (workspace, messages) -> mutableChat.value = mutableChat.value.copy(workspace = workspace, messages = messages, loading = false) }
                .onFailure { error -> mutableChat.value = mutableChat.value.copy(loading = false, error = error.message ?: "Messages could not be loaded") }
        }
    }

    fun closeChatConversation() {
        mutableChat.value = mutableChat.value.copy(activeConversationId = null, messages = emptyList(), error = null)
    }

    fun refreshActiveChat() {
        val conversationId = mutableChat.value.activeConversationId ?: return
        refreshChatMessages(conversationId)
    }

    private fun refreshChatMessages(conversationId: String) {
        if (conversationId != mutableChat.value.activeConversationId) return
        viewModelScope.launch {
            runCatching { repository.chatMessages(conversationId) }
                .onSuccess { if (mutableChat.value.activeConversationId == conversationId) mutableChat.value = mutableChat.value.copy(messages = it, error = null) }
                .onFailure { error -> if (mutableChat.value.messages.isEmpty()) mutableChat.value = mutableChat.value.copy(error = error.message ?: "Messages could not be refreshed") }
        }
    }

    fun sendChatMessage(content: String) {
        val conversationId = mutableChat.value.activeConversationId ?: return
        viewModelScope.launch {
            mutableChat.value = mutableChat.value.copy(sending = true, error = null)
            runCatching { repository.sendChatMessage(conversationId, content) }
                .onSuccess { mutableChat.value = mutableChat.value.copy(messages = it, sending = false) }
                .onFailure { error -> mutableChat.value = mutableChat.value.copy(sending = false, error = error.message ?: "Message could not be saved") }
        }
    }

    fun startPrivateChat(otherStaffId: String) {
        viewModelScope.launch {
            mutableChat.value = mutableChat.value.copy(loading = true, error = null)
            runCatching { repository.startPrivateChat(otherStaffId) }
                .onSuccess { (workspace, conversationId) ->
                    mutableChat.value = mutableChat.value.copy(workspace = workspace, activeConversationId = conversationId, messages = emptyList(), loading = false)
                    refreshChatMessages(conversationId)
                }
                .onFailure { error -> mutableChat.value = mutableChat.value.copy(loading = false, error = error.message ?: "Conversation could not be started") }
        }
    }

    fun discardRejectedChatMessage(mutationId: String) {
        mutableChat.value = mutableChat.value.copy(messages = repository.discardRejectedChatMessage(mutationId))
    }

    fun loadFinance(month: String) {
        viewModelScope.launch {
            mutableFinance.value = mutableFinance.value.copy(loading = true, error = null, notice = null)
            runCatching { repository.financeWorkspace(month) }
                .onSuccess { mutableFinance.value = FinanceUiState(workspace = it, online = repository.isOnline()) }
                .onFailure { error -> mutableFinance.value = mutableFinance.value.copy(loading = false, online = repository.isOnline(), error = error.message ?: "Finance could not be loaded") }
        }
    }

    fun openFinanceAccount(student: FinanceStudentBalance) {
        viewModelScope.launch {
            mutableFinance.value = mutableFinance.value.copy(loading = true, error = null, notice = null)
            runCatching { repository.financeAccount(student.id) }
                .onSuccess { mutableFinance.value = mutableFinance.value.copy(account = it, loading = false) }
                .onFailure { error -> mutableFinance.value = mutableFinance.value.copy(loading = false, error = error.message ?: "Student account could not be loaded") }
        }
    }

    fun closeFinanceAccount() {
        mutableFinance.value = mutableFinance.value.copy(account = null, error = null, notice = null)
    }

    fun addFinanceCharge(input: FinanceChargeInput) {
        val month = mutableFinance.value.workspace?.month ?: return
        viewModelScope.launch {
            mutableFinance.value = mutableFinance.value.copy(saving = true, error = null, notice = null)
            runCatching { repository.addFinanceCharge(input, month) }
                .onSuccess { account -> mutableFinance.value = mutableFinance.value.copy(
                    workspace = repository.cachedFinanceWorkspace(month) ?: mutableFinance.value.workspace,
                    account = account, saving = false, notice = "Charge recorded securely.",
                ) }
                .onFailure { error -> mutableFinance.value = mutableFinance.value.copy(saving = false, error = error.message ?: "Charge could not be recorded") }
        }
    }

    fun recordFinancePayment(input: FinancePaymentInput) {
        val month = mutableFinance.value.workspace?.month ?: return
        viewModelScope.launch {
            mutableFinance.value = mutableFinance.value.copy(saving = true, error = null, notice = null)
            runCatching { repository.recordFinancePayment(input, month) }
                .onSuccess { account -> mutableFinance.value = mutableFinance.value.copy(
                    workspace = repository.cachedFinanceWorkspace(month) ?: mutableFinance.value.workspace,
                    account = account, saving = false, notice = "Payment recorded securely.",
                ) }
                .onFailure { error -> mutableFinance.value = mutableFinance.value.copy(saving = false, error = error.message ?: "Payment could not be recorded") }
        }
    }

    fun loadAttendanceDay(date: String = mutableAttendance.value.date) {
        viewModelScope.launch {
            mutableAttendance.value = mutableAttendance.value.copy(date = date, roster = null, loading = true, error = null)
            runCatching { repository.attendanceDay(date) }
                .onSuccess { sessions -> mutableAttendance.value = mutableAttendance.value.copy(sessions = sessions, loading = false) }
                .onFailure { error -> mutableAttendance.value = mutableAttendance.value.copy(loading = false, error = error.message ?: "Attendance could not be loaded") }
        }
    }

    fun openAttendanceSession(session: AttendanceSession) {
        viewModelScope.launch {
            mutableAttendance.value = mutableAttendance.value.copy(loading = true, error = null)
            runCatching { repository.attendanceRoster(session.id, session.date) }
                .onSuccess { roster -> mutableAttendance.value = mutableAttendance.value.copy(roster = roster, loading = false) }
                .onFailure { error -> mutableAttendance.value = mutableAttendance.value.copy(loading = false, error = error.message ?: "Roster could not be loaded") }
        }
    }

    fun closeAttendanceSession() {
        mutableAttendance.value = mutableAttendance.value.copy(roster = null, error = null)
    }

    fun saveAttendance(marks: Map<String, String>) {
        val roster = mutableAttendance.value.roster ?: return
        viewModelScope.launch {
            mutableAttendance.value = mutableAttendance.value.copy(saving = true, error = null)
            runCatching { repository.saveAttendance(roster, marks) }
                .onSuccess { saved ->
                    val sessions = repository.attendanceDay(saved.date)
                    mutableAttendance.value = mutableAttendance.value.copy(roster = saved, sessions = sessions, saving = false)
                }
                .onFailure { error -> mutableAttendance.value = mutableAttendance.value.copy(saving = false, error = error.message ?: "Attendance could not be saved") }
        }
    }

    fun discardAttendanceConflict() {
        val roster = mutableAttendance.value.roster ?: return
        viewModelScope.launch {
            mutableAttendance.value = mutableAttendance.value.copy(loading = true, error = null)
            runCatching { repository.discardAttendanceConflict(roster) }
                .onSuccess { refreshed -> mutableAttendance.value = mutableAttendance.value.copy(roster = refreshed, loading = false) }
                .onFailure { error -> mutableAttendance.value = mutableAttendance.value.copy(loading = false, error = error.message ?: "Conflict could not be refreshed") }
        }
    }

    fun openStudent(summary: StudentSummary) {
        val month = java.time.YearMonth.now().toString()
        val cachedProfile = repository.cachedStudentProfile(summary.id)
        val cachedRegister = repository.cachedHifzMonth(summary.id, month)
        mutableStudent.value = StudentUiState(
            summary = summary, profile = cachedProfile, register = cachedRegister, month = month,
            loading = cachedProfile == null || cachedRegister == null, online = repository.isOnline(),
        )
        viewModelScope.launch {
            val profileRequest = async { runCatching { repository.studentProfile(summary.id) } }
            val registerRequest = async { runCatching { repository.hifzMonth(summary.id, month) } }
            val profileResult = profileRequest.await()
            val registerResult = registerRequest.await()
            if (mutableStudent.value.summary?.id != summary.id || mutableStudent.value.month != month) return@launch
            mutableStudent.value = mutableStudent.value.copy(
                profile = profileResult.getOrNull() ?: cachedProfile,
                register = registerResult.getOrNull() ?: cachedRegister,
                loading = false,
                online = repository.isOnline(),
                error = profileResult.exceptionOrNull()?.message ?: registerResult.exceptionOrNull()?.message,
            )
        }
    }

    fun closeStudent() {
        mutableStudent.value = StudentUiState()
    }

    fun loadStudentMonth(month: String) {
        val summary = mutableStudent.value.summary ?: return
        val cached = repository.cachedHifzMonth(summary.id, month)
        mutableStudent.value = mutableStudent.value.copy(month = month, register = cached, loading = cached == null, error = null, online = repository.isOnline())
        viewModelScope.launch {
            runCatching { repository.hifzMonth(summary.id, month) }
                .onSuccess { if (mutableStudent.value.summary?.id == summary.id && mutableStudent.value.month == month) mutableStudent.value = mutableStudent.value.copy(register = it, loading = false, online = repository.isOnline()) }
                .onFailure { error -> if (mutableStudent.value.summary?.id == summary.id && mutableStudent.value.month == month) mutableStudent.value = mutableStudent.value.copy(loading = false, online = repository.isOnline(), error = error.message ?: "Hifz register could not be loaded") }
        }
    }

    fun saveHifzRegisterChange(
        date: String,
        sessionId: String?,
        mode: String,
        creates: List<HifzRegisterChange> = emptyList(),
        updates: List<HifzRegisterChange> = emptyList(),
        deleteIds: List<String> = emptyList(),
        expectedVersions: Map<String, Long> = emptyMap(),
    ) {
        val summary = mutableStudent.value.summary ?: return
        val month = mutableStudent.value.month
        val online = repository.isOnline()
        val optimistic = runCatching {
            repository.queueHifzRegisterChange(summary.id, month, date, sessionId, mode, creates, updates, deleteIds, expectedVersions)
        }.getOrElse { error ->
            mutableStudent.value = mutableStudent.value.copy(error = error.message ?: "Hifz change could not be saved")
            return
        }
        mutableStudent.value = mutableStudent.value.copy(register = optimistic, saving = online, error = null, online = online)
        if (!online) return
        viewModelScope.launch {
            runCatching { repository.syncQueuedHifzRegister(summary.id, month) }
                .onSuccess { if (mutableStudent.value.summary?.id == summary.id && mutableStudent.value.month == month) mutableStudent.value = mutableStudent.value.copy(register = it, saving = false, online = repository.isOnline()) }
                .onFailure { error -> if (mutableStudent.value.summary?.id == summary.id && mutableStudent.value.month == month) mutableStudent.value = mutableStudent.value.copy(register = repository.cachedHifzMonth(summary.id, month) ?: optimistic, saving = false, online = repository.isOnline(), error = error.message ?: "Hifz change could not be saved") }
        }
    }

    fun discardHifzConflict() {
        val summary = mutableStudent.value.summary ?: return
        val month = mutableStudent.value.month
        mutableStudent.value = mutableStudent.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repository.discardHifzRegisterConflict(summary.id, month) }
                .onSuccess { mutableStudent.value = mutableStudent.value.copy(register = it, loading = false, online = true) }
                .onFailure { error -> mutableStudent.value = mutableStudent.value.copy(loading = false, online = repository.isOnline(), error = error.message ?: "The server copy could not be restored") }
        }
    }

    fun useCachedData() {
        val cached = (mutableState.value as? AppState.Failure)?.cached ?: return
        mutableState.value = AppState.Ready(cached)
    }

    fun backToSignIn() {
        mutableState.value = AppState.SignedOut
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            mutableState.value = AppState.SignedOut
        }
    }

    fun saveHifzDraft(
        studentId: String,
        entryDate: String,
        mode: String,
        surahName: String,
        startVerse: Int,
        endVerse: Int,
        notes: String?,
    ) {
        val current = (mutableState.value as? AppState.Ready)?.snapshot ?: return
        viewModelScope.launch {
            mutableState.value = AppState.Ready(current, syncing = true)
            runCatching { repository.saveHifzDraft(studentId, entryDate, mode, surahName, startVerse, endVerse, notes) }
                .onSuccess { mutableState.value = AppState.Ready(it) }
                .onFailure { mutableState.value = AppState.Failure(it.message ?: "Draft could not be saved", current) }
        }
    }

    fun createStudent(input: NewStudentInput, onSuccess: () -> Unit) {
        val current = (mutableState.value as? AppState.Ready)?.snapshot ?: return
        viewModelScope.launch {
            mutableState.value = AppState.Ready(current, syncing = true)
            runCatching { repository.createStudent(input) }
                .onSuccess {
                    mutableState.value = AppState.Ready(it)
                    onSuccess()
                }
                .onFailure { mutableState.value = AppState.Failure(it.message ?: "Student could not be created", current) }
        }
    }
}
