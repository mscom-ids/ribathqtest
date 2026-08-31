package `in`.ribath.mentor.data

data class StoredSession(val deviceId: String, val refreshToken: String)

data class LoginSession(
    val accessToken: String,
    val refreshToken: String,
    val deviceId: String,
)

data class MentorProfile(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
)

data class StudentSummary(
    val id: String,
    val name: String,
    val standard: String,
)

data class NewStudentInput(
    val admissionNumber: String,
    val name: String,
    val dateOfBirth: String,
    val standard: String,
    val gender: String?,
    val parentPhone: String?,
)

data class HifzEntrySummary(
    val id: String,
    val studentId: String,
    val entryDate: String,
    val mode: String,
    val surahName: String,
    val startVerse: Int,
    val endVerse: Int,
    val notes: String?,
    val version: Long,
)

data class HifzDraft(
    val mutationId: String,
    val studentId: String,
    val entryDate: String,
    val mode: String,
    val surahName: String,
    val startVerse: Int,
    val endVerse: Int,
    val notes: String?,
)

data class StudentDetailField(val label: String, val value: String)

data class StudentDetailSection(
    val key: String,
    val title: String,
    val fields: List<StudentDetailField>,
)

data class MentorStudentProfile(
    val id: String,
    val name: String,
    val photoUrl: String?,
    val status: String,
    val standard: String,
    val division: String?,
    val hifzStage: String,
    val sections: List<StudentDetailSection>,
    val cached: Boolean,
)

data class HifzRegisterEntry(
    val id: String,
    val mode: String,
    val entryDate: String,
    val surahName: String?,
    val startVerse: Int?,
    val endVerse: Int?,
    val juzNumber: Int?,
    val juzPortion: String?,
    val notes: String?,
    val recordedBy: String?,
    val version: Long,
    val syncStatus: String? = null,
    val syncError: String? = null,
)

data class HifzDayAttendance(
    val status: String,
    val sessionId: String,
    val sessionName: String,
    val sessionStart: String,
    val sessionEnd: String,
)

data class HifzEligibility(
    val allowed: Boolean,
    val reason: String?,
    val sessionId: String?,
    val attendanceStatus: String?,
)

data class HifzRegisterDay(
    val date: String,
    val attendance: HifzDayAttendance?,
    val eligibility: HifzEligibility,
    val entries: Map<String, List<HifzRegisterEntry>>,
)

data class HifzRegisterSummary(
    val newHifzPages: Double = 0.0,
    val revisionDays: Int = 0,
    val juzRevised: Double = 0.0,
    val completedJuz: Int = 0,
    val completionPercent: Double = 0.0,
    val newJuzRevisionTotal: Double = 0.0,
    val oldJuzRevisionTotal: Double = 0.0,
    val cycleProgress: Double = 0.0,
)

data class HifzMonthRegister(
    val studentId: String,
    val studentName: String,
    val standard: String,
    val division: String?,
    val hifzStage: String,
    val month: String,
    val summary: HifzRegisterSummary,
    val days: List<HifzRegisterDay>,
    val pendingCount: Int,
    val conflictCount: Int,
    val latestError: String?,
    val cached: Boolean,
)

data class HifzRegisterChange(
    val id: String? = null,
    val surahName: String? = null,
    val startVerse: Int? = null,
    val endVerse: Int? = null,
    val juzNumber: Int? = null,
    val juzPortion: String? = null,
)

data class HifzRegisterDraft(
    val mutationId: String,
    val studentId: String,
    val month: String,
    val entryDate: String,
    val sessionId: String?,
    val mode: String,
    val creates: List<HifzRegisterChange>,
    val updates: List<HifzRegisterChange>,
    val deleteIds: List<String>,
    val expectedVersions: Map<String, Long>,
)

data class AttendanceSession(
    val id: String,
    val date: String,
    val name: String,
    val classType: String,
    val startTime: String,
    val endTime: String,
    val studentCount: Int,
    val scheduleRevision: Long,
    val sessionRevision: Long,
    val cancelled: Boolean,
    val cancellationReason: String?,
    val syncStatus: String? = null,
    val syncError: String? = null,
)

data class AttendanceStudent(
    val id: String,
    val name: String,
    val standard: String,
    val photoUrl: String?,
    val locked: Boolean,
    val onCampusLeave: Boolean,
    val leaveType: String?,
    val status: String,
)

data class AttendanceRoster(
    val scheduleId: String,
    val date: String,
    val scheduleRevision: Long,
    val sessionRevision: Long,
    val rosterStateHash: String,
    val students: List<AttendanceStudent>,
    val cancelled: Boolean = false,
    val cancellationReason: String? = null,
    val syncStatus: String? = null,
    val syncError: String? = null,
)

data class AttendanceDraft(
    val mutationId: String,
    val scheduleId: String,
    val date: String,
    val scheduleRevision: Long,
    val sessionRevision: Long,
    val rosterStateHash: String,
    val marks: Map<String, String>,
)

data class LeaveStudent(
    val id: String,
    val name: String,
    val standard: String,
    val photoUrl: String?,
    val presenceStateHash: String,
    val activeLeaveId: String?,
    val isOutside: Boolean,
    val isOnCampusLeave: Boolean,
)

data class MentorLeave(
    val id: String,
    val studentId: String,
    val studentName: String,
    val standard: String,
    val leaveType: String,
    val startDatetime: String,
    val endDatetime: String?,
    val reasonCategory: String?,
    val remarks: String?,
    val companionName: String?,
    val companionRelationship: String?,
    val status: String,
    val actualReturnDatetime: String?,
    val returnStatus: String?,
    val mobileRevision: Long,
    val updatedAt: String?,
    val syncStatus: String? = null,
    val syncError: String? = null,
    val mutationId: String? = null,
)

data class InstitutionalLeave(
    val id: String,
    val name: String,
    val startDatetime: String,
    val endDatetime: String,
    val campusLocation: String,
    val entireInstitution: Boolean,
    val targetSummary: String,
)

data class MentorAssignment(
    val id: String,
    val originalMentorId: String,
    val originalMentorName: String,
    val originalMentorPhoto: String?,
    val studentId: String?,
    val studentName: String?,
    val studentCount: Int,
    val reason: String?,
    val updatedAt: String?,
)

data class LeaveDraft(
    val mutationId: String,
    val operation: String,
    val studentId: String? = null,
    val leaveId: String? = null,
    val leaveType: String? = null,
    val startDatetime: String? = null,
    val endDatetime: String? = null,
    val reasonCategory: String? = null,
    val remarks: String? = null,
    val companionName: String? = null,
    val companionRelationship: String? = null,
    val expectedPresenceStateHash: String? = null,
    val expectedLeaveRevision: Long? = null,
    val returnDatetime: String? = null,
)

data class PendingLeaveMutation(
    val draft: LeaveDraft,
    val status: String,
    val errorCode: String?,
    val error: String?,
)

data class MentorWorkspace(
    val students: List<LeaveStudent> = emptyList(),
    val leaves: List<MentorLeave> = emptyList(),
    val institutionalLeaves: List<InstitutionalLeave> = emptyList(),
    val assignments: List<MentorAssignment> = emptyList(),
    val pendingMutations: List<PendingLeaveMutation> = emptyList(),
    val cached: Boolean = true,
)

data class ReportStudent(
    val id: String,
    val name: String,
    val standard: String,
    val batchYear: String?,
    val mentorName: String?,
    val parentPhone: String?,
)

data class ReportAttendanceTotals(
    val cancelled: Int,
    val attended: Int,
    val notAttended: Int,
    val effective: Int,
    val scheduled: Int,
)

data class ReportPerformance(
    val newVersePoints: Double,
    val recentRevisionPoints: Double,
    val juzPoints: Double,
    val juzMax: Double,
    val attendancePoints: Double,
    val attendancePercentage: Double,
    val totalPoints: Double,
    val totalMax: Double,
    val percentage: Double,
    val grade: String,
    val pointDays: Double,
)

data class ReportHifzActivity(
    val newPages: Double,
    val revisionDays: Int,
    val juzRevised: Double,
    val completedLifetimeJuz: Int,
    val newJuzRevision: Double,
    val oldJuzRevision: Double,
)

data class ReportLog(
    val id: String,
    val date: String,
    val mode: String,
    val surahName: String?,
    val startVerse: Int?,
    val endVerse: Int?,
)

data class StudentProgressReport(
    val cacheKey: String,
    val reportType: String,
    val startDate: String,
    val endDate: String,
    val academicYear: String,
    val hifzStage: String,
    val student: ReportStudent,
    val attendance: ReportAttendanceTotals?,
    val performance: ReportPerformance?,
    val activity: ReportHifzActivity,
    val logs: List<ReportLog>,
    val cached: Boolean,
)

data class ChatConversation(
    val id: String,
    val type: String,
    val name: String,
    val photoUrl: String?,
    val otherStaffId: String?,
    val memberCount: Int?,
    val lastMessage: String?,
    val lastMessageAt: String?,
    val lastMessageSender: String?,
    val unreadCount: Int,
    val createdAt: String?,
)

data class ChatMessage(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val senderName: String,
    val senderPhoto: String?,
    val content: String?,
    val imageUrl: String?,
    val deleted: Boolean,
    val createdAt: String,
    val mutationId: String?,
    val syncStatus: String? = null,
    val syncError: String? = null,
)

data class ChatStaff(
    val id: String,
    val name: String,
    val photoUrl: String?,
    val role: String,
)

data class ChatDraft(
    val mutationId: String,
    val conversationId: String,
    val content: String,
)

data class ChatWorkspace(
    val currentStaffId: String = "",
    val conversations: List<ChatConversation> = emptyList(),
    val staff: List<ChatStaff> = emptyList(),
    val pendingCount: Int = 0,
    val cached: Boolean = true,
)

data class FinanceCapabilities(
    val canViewOverview: Boolean = false,
    val canViewDues: Boolean = false,
    val canViewTransactions: Boolean = false,
    val canAddCharge: Boolean = false,
    val canCollectPayment: Boolean = false,
)

data class FinanceCategory(
    val id: String,
    val name: String,
    val description: String?,
    val active: Boolean,
)

data class FinancePaymentAccount(
    val id: String,
    val name: String,
    val type: String,
    val active: Boolean,
)

data class FinanceStudentBalance(
    val id: String,
    val name: String,
    val standard: String,
    val division: String?,
    val totalDue: Double,
    val overdue: Double,
    val currentMonthDue: Double,
    val creditBalance: Double,
    val status: String,
)

data class FinanceActivity(
    val id: String,
    val type: String,
    val studentId: String?,
    val studentName: String,
    val description: String,
    val amount: Double,
    val createdAt: String?,
    val recordedBy: String?,
)

data class FinanceOpenItem(
    val id: String,
    val type: String,
    val categoryName: String?,
    val description: String,
    val amount: Double,
    val paidAmount: Double,
    val balance: Double,
    val dueDate: String?,
    val month: String?,
    val status: String,
)

data class FinancePaymentAllocation(
    val obligationId: String,
    val description: String?,
    val amount: Double,
)

data class FinancePayment(
    val id: String,
    val amount: Double,
    val status: String,
    val method: String,
    val accountName: String?,
    val receiptNumber: String?,
    val notes: String?,
    val date: String?,
    val createdAt: String?,
    val allocations: List<FinancePaymentAllocation>,
)

data class StudentFinanceAccount(
    val student: FinanceStudentBalance,
    val totalDue: Double,
    val overdue: Double,
    val creditBalance: Double,
    val openItems: List<FinanceOpenItem>,
    val payments: List<FinancePayment>,
    val activeFeeAmount: Double?,
    val activeFeeLabel: String?,
    val activeFeeFrom: String?,
    val cached: Boolean,
)

data class FinanceWorkspace(
    val month: String = "",
    val capabilities: FinanceCapabilities = FinanceCapabilities(),
    val students: List<FinanceStudentBalance> = emptyList(),
    val recentActivity: List<FinanceActivity> = emptyList(),
    val categories: List<FinanceCategory> = emptyList(),
    val accounts: List<FinancePaymentAccount> = emptyList(),
    val cached: Boolean = true,
)

data class FinanceChargeInput(
    val studentId: String,
    val categoryId: String,
    val amount: String,
    val date: String,
    val description: String?,
    val idempotencyKey: String,
)

data class FinancePaymentInput(
    val studentId: String,
    val amount: String,
    val method: String,
    val paymentAccountId: String?,
    val referenceNumber: String?,
    val date: String,
    val notes: String?,
    val allocations: List<FinancePaymentAllocation>,
    val idempotencyKey: String,
)

data class AdminDashboardSummary(
    val totalStudents: Int = 0,
    val onCampus: Int = 0,
    val outCampus: Int = 0,
    val totalStaff: Int = 0,
    val activeStaff: Int = 0,
    val pendingDelegations: Int = 0,
)

data class HomeSnapshot(
    val mentor: MentorProfile,
    val academicYear: String,
    val students: List<StudentSummary>,
    val hifzEntries: List<HifzEntrySummary>,
    val pendingDraftCount: Int,
    val portal: String,
    val adminSummary: AdminDashboardSummary,
    val cursor: Long,
    val cached: Boolean,
)
