package `in`.ribath.mentor.ui

import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.ribath.mentor.data.HomeSnapshot
import `in`.ribath.mentor.data.ChatConversation
import `in`.ribath.mentor.data.FinanceChargeInput
import `in`.ribath.mentor.data.FinancePaymentAllocation
import `in`.ribath.mentor.data.FinancePaymentInput
import `in`.ribath.mentor.data.FinanceStudentBalance
import `in`.ribath.mentor.data.LeaveStudent
import `in`.ribath.mentor.data.MentorLeave
import `in`.ribath.mentor.data.NewStudentInput
import `in`.ribath.mentor.data.StudentSummary
import `in`.ribath.mentor.R
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.text.NumberFormat
import java.time.Instant
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.UUID
import java.util.Locale

private data class PortalDestination(val label: String, val icon: ImageVector)
private data class LeaveFormInput(
    val student: LeaveStudent,
    val leaveType: String,
    val startDatetime: String,
    val endDatetime: String?,
    val reasonCategory: String,
    val remarks: String?,
    val companionName: String?,
    val companionRelationship: String?,
)

@Composable
fun RibathMentorApp(viewModel: AppViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val attendance by viewModel.attendance.collectAsStateWithLifecycle()
    val leaves by viewModel.leaves.collectAsStateWithLifecycle()
    val reports by viewModel.reports.collectAsStateWithLifecycle()
    val chat by viewModel.chat.collectAsStateWithLifecycle()
    val finance by viewModel.finance.collectAsStateWithLifecycle()
    val studentDetail by viewModel.student.collectAsStateWithLifecycle()
    var selectedStudent by remember { mutableStateOf<StudentSummary?>(null) }
    RibathTheme {
        Surface(Modifier.fillMaxSize()) {
            when (val current = state) {
                AppState.Restoring -> LoadingScreen("Restoring your saved data…")
                AppState.SignedOut -> LoginScreen(viewModel::login)
                is AppState.SettingUp -> LoadingScreen(current.message)
                is AppState.Ready -> selectedStudent?.let {
                    MentorStudentScreen(
                        state = studentDetail,
                        onBack = { selectedStudent = null; viewModel.closeStudent() },
                        onMonth = viewModel::loadStudentMonth,
                        onSave = viewModel::saveHifzRegisterChange,
                        onDiscardConflict = viewModel::discardHifzConflict,
                    )
                } ?: if (current.snapshot.portal == "admin") {
                    AdminPortal(current.snapshot, current.syncing, viewModel::sync, viewModel::logout, viewModel::createStudent)
                } else {
                    StaffPortal(
                        current.snapshot, current.syncing, viewModel::sync, viewModel::logout,
                        attendance, viewModel::loadAttendanceDay, viewModel::openAttendanceSession,
                        viewModel::closeAttendanceSession, viewModel::saveAttendance,
                        viewModel::discardAttendanceConflict,
                        leaves, viewModel::loadMentorWorkspace,
                        { input -> viewModel.createLeave(input.student, input.leaveType, input.startDatetime, input.endDatetime, input.reasonCategory, input.remarks, input.companionName, input.companionRelationship) },
                        viewModel::returnLeave, viewModel::discardLeaveConflict,
                        reports, viewModel::generateStudentReport,
                        chat, viewModel::loadChat, viewModel::openChatConversation, viewModel::closeChatConversation,
                        viewModel::refreshActiveChat, viewModel::sendChatMessage, viewModel::startPrivateChat,
                        viewModel::discardRejectedChatMessage,
                        finance, viewModel::loadFinance, viewModel::openFinanceAccount, viewModel::closeFinanceAccount,
                        viewModel::addFinanceCharge, viewModel::recordFinancePayment,
                    ) { student -> selectedStudent = student; viewModel.openStudent(student) }
                }
                is AppState.Failure -> ErrorScreen(current.message, current.cached != null, viewModel::useCachedData, viewModel::backToSignIn)
            }
        }
    }
}

@Composable
private fun LoginScreen(onLogin: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(Color.White).padding(24.dp), verticalArrangement = Arrangement.Center) {
        BrandMark()
        Spacer(Modifier.height(24.dp))
        Text("Welcome back", fontSize = 30.sp, fontWeight = FontWeight.Black, color = Slate900)
        Text("Sign in with your staff email and password.", color = Slate600)
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email address") }, placeholder = { Text("Staff email address") }, singleLine = true, shape = RoundedCornerShape(14.dp))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true, shape = RoundedCornerShape(14.dp), visualTransformation = PasswordVisualTransformation())
        Spacer(Modifier.height(20.dp))
        Button({ onLogin(email, password) }, Modifier.fillMaxWidth().height(52.dp), enabled = email.isNotBlank() && password.isNotBlank(), colors = ButtonDefaults.buttonColors(containerColor = AdminGreen), shape = RoundedCornerShape(14.dp)) { Text("Sign in", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(18.dp))
        Text("Restricted System. Authorized access only.", Modifier.align(Alignment.CenterHorizontally), color = Slate600, fontSize = 12.sp)
    }
}

@Composable
private fun BrandMark() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(painterResource(R.drawable.ribath_logo), "Ribathul Quran logo", Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Fit)
        Column { Text("Ribathul Quran", color = Slate900, fontWeight = FontWeight.Black, fontSize = 18.sp); Text("Institution Portal", color = Slate600, fontSize = 11.sp) }
    }
}

@Composable
private fun LoadingScreen(message: String) {
    Box(Modifier.fillMaxSize().background(MentorBackground), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark(); Spacer(Modifier.height(34.dp)); CircularProgressIndicator(color = PortalBlue); Spacer(Modifier.height(18.dp))
            Text(message, fontWeight = FontWeight.Bold); Text("Preparing secure offline data for this device", color = Slate600, fontSize = 12.sp)
        }
    }
}

@Composable
private fun StaffPortal(
    snapshot: HomeSnapshot,
    syncing: Boolean,
    onSync: () -> Unit,
    onLogout: () -> Unit,
    attendance: AttendanceUiState,
    onAttendanceDay: (String) -> Unit,
    onAttendanceSession: (`in`.ribath.mentor.data.AttendanceSession) -> Unit,
    onAttendanceBack: () -> Unit,
    onAttendanceSave: (Map<String, String>) -> Unit,
    onAttendanceConflict: () -> Unit,
    leaves: LeavesUiState,
    onLoadLeaves: () -> Unit,
    onCreateLeave: (LeaveFormInput) -> Unit,
    onReturnLeave: (MentorLeave, String) -> Unit,
    onDiscardLeaveConflict: (String) -> Unit,
    reports: ReportsUiState,
    onGenerateReport: (String, String, String, String) -> Unit,
    chat: ChatUiState,
    onLoadChat: () -> Unit,
    onOpenChat: (ChatConversation) -> Unit,
    onCloseChat: () -> Unit,
    onRefreshChat: () -> Unit,
    onSendChat: (String) -> Unit,
    onStartChat: (String) -> Unit,
    onDiscardChatMessage: (String) -> Unit,
    finance: FinanceUiState,
    onLoadFinance: (String) -> Unit,
    onOpenFinanceAccount: (FinanceStudentBalance) -> Unit,
    onCloseFinanceAccount: () -> Unit,
    onAddFinanceCharge: (FinanceChargeInput) -> Unit,
    onRecordFinancePayment: (FinancePaymentInput) -> Unit,
    onStudent: (StudentSummary) -> Unit,
) {
    BoxWithConstraints {
        if (maxWidth >= 840.dp) StaffTabletPortal(snapshot, syncing, onSync, onLogout, attendance, onAttendanceDay, onAttendanceSession, onAttendanceBack, onAttendanceSave, onAttendanceConflict, leaves, onLoadLeaves, onCreateLeave, onReturnLeave, onDiscardLeaveConflict, reports, onGenerateReport, chat, onLoadChat, onOpenChat, onCloseChat, onRefreshChat, onSendChat, onStartChat, onDiscardChatMessage, finance, onLoadFinance, onOpenFinanceAccount, onCloseFinanceAccount, onAddFinanceCharge, onRecordFinancePayment, onStudent)
        else StaffPhonePortal(snapshot, syncing, onSync, onLogout, attendance, onAttendanceDay, onAttendanceSession, onAttendanceBack, onAttendanceSave, onAttendanceConflict, leaves, onLoadLeaves, onCreateLeave, onReturnLeave, onDiscardLeaveConflict, reports, onGenerateReport, chat, onLoadChat, onOpenChat, onCloseChat, onRefreshChat, onSendChat, onStartChat, onDiscardChatMessage, finance, onLoadFinance, onOpenFinanceAccount, onCloseFinanceAccount, onAddFinanceCharge, onRecordFinancePayment, onStudent)
    }
}

@Composable
private fun StaffPhonePortal(
    snapshot: HomeSnapshot, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit,
    attendance: AttendanceUiState, onAttendanceDay: (String) -> Unit,
    onAttendanceSession: (`in`.ribath.mentor.data.AttendanceSession) -> Unit,
    onAttendanceBack: () -> Unit, onAttendanceSave: (Map<String, String>) -> Unit,
    onAttendanceConflict: () -> Unit, leaves: LeavesUiState, onLoadLeaves: () -> Unit,
    onCreateLeave: (LeaveFormInput) -> Unit, onReturnLeave: (MentorLeave, String) -> Unit,
    onDiscardLeaveConflict: (String) -> Unit, reports: ReportsUiState,
    onGenerateReport: (String, String, String, String) -> Unit, chat: ChatUiState,
    onLoadChat: () -> Unit, onOpenChat: (ChatConversation) -> Unit, onCloseChat: () -> Unit,
    onRefreshChat: () -> Unit, onSendChat: (String) -> Unit, onStartChat: (String) -> Unit,
    onDiscardChatMessage: (String) -> Unit, finance: FinanceUiState, onLoadFinance: (String) -> Unit,
    onOpenFinanceAccount: (FinanceStudentBalance) -> Unit, onCloseFinanceAccount: () -> Unit,
    onAddFinanceCharge: (FinanceChargeInput) -> Unit, onRecordFinancePayment: (FinancePaymentInput) -> Unit,
    onStudent: (StudentSummary) -> Unit,
) {
    val tabs = listOf(
        PortalDestination("Class", Icons.Outlined.Home), PortalDestination("Attend", Icons.Outlined.EventAvailable),
        PortalDestination("Chat", Icons.Outlined.ChatBubbleOutline), PortalDestination("Leaves", Icons.Outlined.SwapHoriz),
        PortalDestination("More", Icons.Outlined.MoreHoriz),
    )
    var route by remember { mutableStateOf("Class") }
    BackHandler(route !in tabs.map { it.label }) { route = "More" }
    Scaffold(
        topBar = { PortalHeader("Mentor Portal", snapshot.mentor.name, snapshot.cached, PortalBlue, syncing, onSync, onLogout) },
        bottomBar = {
            NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = route == tab.label || (tab.label == "More" && route !in tabs.map { it.label }), onClick = { route = tab.label }, icon = { Icon(tab.icon, tab.label) },
                        label = { Text(tab.label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = PortalBlue, selectedTextColor = PortalBlue, indicatorColor = Color(0xFFDBEAFE)),
                    )
                }
            }
        },
    ) { padding ->
        when (route) {
            "Class" -> MentorDashboard(snapshot, padding, onStudent)
            "Attend" -> AttendanceWorkspace(attendance, padding, onAttendanceDay, onAttendanceSession, onAttendanceBack, onAttendanceSave, onAttendanceConflict)
            "Chat" -> ChatWorkspace(chat, padding, onLoadChat, onOpenChat, onCloseChat, onRefreshChat, onSendChat, onStartChat, onDiscardChatMessage)
            "Leaves" -> LeavesWorkspace(leaves, padding, onLoadLeaves, onCreateLeave, onReturnLeave, onDiscardLeaveConflict)
            "More" -> MentorMore(padding) { route = it.label }
            "Assigned" -> AssignedWorkspace(leaves, padding, onLoadLeaves) { route = "More" }
            "Reports" -> ReportsWorkspace(snapshot, reports, padding, onGenerateReport) { route = "More" }
            "Finance" -> FinanceWorkspace(finance, padding, onLoadFinance, onOpenFinanceAccount, onCloseFinanceAccount, onAddFinanceCharge, onRecordFinancePayment) { route = "More" }
            else -> ModuleLanding(route, "$route workspace", mentorMoreDestinations().firstOrNull { it.label == route }?.icon ?: Icons.Outlined.Assessment, padding, PortalBlue, onSync) { route = "More" }
        }
    }
}

@Composable
private fun PortalHeader(title: String, name: String, cached: Boolean, accent: Color, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit) {
    Surface(color = Color.White, shadowElevation = 2.dp) {
        Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(R.drawable.ribath_logo), "Ribathul Quran logo", Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.Fit)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) { Text(title, color = accent, fontWeight = FontWeight.Black, fontSize = 16.sp); Text(if (cached) "Offline · saved data" else name, color = Slate600, fontSize = 11.sp, maxLines = 1) }
            IconButton(onClick = onSync, enabled = !syncing) { Icon(if (syncing) Icons.Outlined.CloudDone else Icons.Outlined.Sync, "Sync", tint = accent) }
            IconButton(onClick = onLogout) { Icon(Icons.Outlined.Logout, "Sign out", tint = Slate600) }
        }
    }
}

@Composable
private fun AttendanceWorkspace(
    state: AttendanceUiState,
    padding: PaddingValues,
    onLoadDay: (String) -> Unit,
    onOpenSession: (`in`.ribath.mentor.data.AttendanceSession) -> Unit,
    onBack: () -> Unit,
    onSave: (Map<String, String>) -> Unit,
    onDiscardConflict: () -> Unit,
) {
    LaunchedEffect(state.date) {
        if (state.sessions.isEmpty() && !state.loading && state.roster == null) onLoadDay(state.date)
    }
    val roster = state.roster
    if (roster != null) {
        AttendanceRosterWorkspace(state, padding, onBack, onSave, onDiscardConflict)
        return
    }
    val selectedDate = runCatching { LocalDate.parse(state.date) }.getOrDefault(LocalDate.now())
    Box(Modifier.fillMaxSize().background(MentorBackground).padding(padding)) {
        LazyColumn(
            Modifier.fillMaxSize().widthIn(max = 900.dp).align(Alignment.TopCenter),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(22.dp)) {
                    Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(PortalBlue, PortalIndigo))).padding(18.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.EventAvailable, null, tint = Color.White, modifier = Modifier.size(30.dp))
                            Spacer(Modifier.width(10.dp))
                            Column { Text("Attendance Marking", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black); Text("${state.sessions.sumOf { it.studentCount }} students available", color = Color(0xFFDBEAFE), fontSize = 11.sp) }
                        }
                        Spacer(Modifier.height(16.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedButton({ onLoadDay(selectedDate.minusDays(1).toString()) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)) { Text("‹") }
                            Surface(Modifier.weight(1f), color = Color.White.copy(alpha = .14f), shape = RoundedCornerShape(14.dp)) {
                                Text(selectedDate.format(DateTimeFormatter.ofPattern("EEE, MMM d, yyyy")), Modifier.padding(13.dp), color = Color.White, fontWeight = FontWeight.Bold)
                            }
                            OutlinedButton({ onLoadDay(selectedDate.plusDays(1).toString()) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)) { Text("›") }
                        }
                    }
                }
            }
            if (state.error != null) item { AttendanceNotice(state.error, Color(0xFFB91C1C), Color(0xFFFEF2F2)) }
            if (state.loading) item { Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = PortalBlue) } }
            if (!state.loading && state.sessions.isEmpty()) item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 46.dp, horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.Groups, null, tint = Color(0xFF94A3B8), modifier = Modifier.size(44.dp)); Spacer(Modifier.height(12.dp))
                        Text("No sessions scheduled", fontWeight = FontWeight.Black, fontSize = 18.sp); Text("There are no authorized classes for this date.", color = Slate600, fontSize = 12.sp)
                    }
                }
            }
            items(state.sessions, key = { "${it.id}:${it.date}" }) { session ->
                val conflict = session.syncStatus == "conflict"
                val pending = session.syncStatus == "pending"
                Card(
                    Modifier.fillMaxWidth().clickable(enabled = !session.cancelled && !state.loading) { onOpenSession(session) },
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(PortalBlue.copy(alpha = .1f)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Today, null, tint = PortalBlue) }
                            Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(session.name.ifBlank { "${session.classType} class" }, fontWeight = FontWeight.Black, fontSize = 16.sp); Text("${session.startTime.take(5)} – ${session.endTime.take(5)} · ${session.studentCount} students", color = Slate600, fontSize = 11.sp) }
                            Icon(Icons.Outlined.ChevronRight, null, tint = if (session.cancelled) Color(0xFFCBD5E1) else PortalBlue)
                        }
                        if (session.cancelled || conflict || pending) {
                            Spacer(Modifier.height(12.dp))
                            AttendanceNotice(
                                when { session.cancelled -> session.cancellationReason ?: "Session cancelled"; conflict -> session.syncError ?: "Offline attendance needs review"; else -> "Saved on this phone · waiting to sync" },
                                when { session.cancelled || conflict -> Color(0xFFB91C1C); else -> Color(0xFF1D4ED8) },
                                when { session.cancelled || conflict -> Color(0xFFFEF2F2); else -> Color(0xFFEFF6FF) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AttendanceRosterWorkspace(
    state: AttendanceUiState,
    padding: PaddingValues,
    onBack: () -> Unit,
    onSave: (Map<String, String>) -> Unit,
    onDiscardConflict: () -> Unit,
) {
    val roster = checkNotNull(state.roster)
    var marks by remember(roster.scheduleId, roster.date, roster.sessionRevision, roster.syncStatus) {
        mutableStateOf(roster.students.associate { it.id to it.status })
    }
    val conflict = roster.syncStatus in setOf("conflict", "rejected")
    val present = marks.values.count { it == "Present" }
    val absent = marks.values.count { it == "Absent" }
    val late = marks.values.count { it == "Late" }
    Box(Modifier.fillMaxSize().background(MentorBackground).padding(padding)) {
        LazyColumn(
            Modifier.fillMaxSize().widthIn(max = 900.dp).align(Alignment.TopCenter),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
                    Column(Modifier.weight(1f)) { Text("Mark Attendance", fontSize = 22.sp, fontWeight = FontWeight.Black); Text(roster.date, color = Slate600, fontSize = 11.sp) }
                    if (state.saving || state.loading) CircularProgressIndicator(Modifier.size(24.dp), color = PortalBlue, strokeWidth = 2.dp)
                }
            }
            if (roster.cancelled) item { AttendanceNotice(roster.cancellationReason ?: "This session was cancelled. Attendance cannot be submitted.", Color(0xFFB91C1C), Color(0xFFFEF2F2)) }
            if (conflict) item {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)), shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.padding(15.dp)) {
                        Text("Offline change needs review", color = Color(0xFF991B1B), fontWeight = FontWeight.Black)
                        Text(roster.syncError ?: "The session or student state changed before your phone reconnected.", color = Color(0xFFB91C1C), fontSize = 12.sp)
                        Spacer(Modifier.height(10.dp)); Button(onDiscardConflict, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB91C1C)), shape = RoundedCornerShape(12.dp)) { Text("Discard draft and load latest") }
                    }
                }
            }
            if (state.error != null) item { AttendanceNotice(state.error, Color(0xFFB91C1C), Color(0xFFFEF2F2)) }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(PortalBlue, PortalIndigo))).padding(17.dp)) {
                        Text("${roster.students.size} students", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                        Text("Tap an available student to cycle Present → Absent → Late", color = Color(0xFFDBEAFE), fontSize = 11.sp)
                        Spacer(Modifier.height(14.dp)); Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) { BannerStat("$present", "Present", Modifier.weight(1f)); BannerStat("$absent", "Absent", Modifier.weight(1f)); BannerStat("$late", "Late", Modifier.weight(1f)) }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton({ marks = marks.mapValues { (_, _) -> "Present" }.toMutableMap().apply { roster.students.filter { it.locked }.forEach { put(it.id, if (it.onCampusLeave) "Leave" else "Outside") } } }, Modifier.weight(1f), enabled = !conflict && !roster.cancelled) { Text("All present") }
                    OutlinedButton({ marks = marks.mapValues { (_, _) -> "Absent" }.toMutableMap().apply { roster.students.filter { it.locked }.forEach { put(it.id, if (it.onCampusLeave) "Leave" else "Outside") } } }, Modifier.weight(1f), enabled = !conflict && !roster.cancelled) { Text("All absent") }
                }
            }
            items(roster.students, key = { it.id }) { student ->
                val status = marks[student.id] ?: student.status
                val statusColor = when (status) { "Absent" -> Color(0xFFDC2626); "Late" -> Color(0xFFD97706); "Outside", "Leave" -> Color(0xFF64748B); else -> Color(0xFF059669) }
                Card(
                    Modifier.fillMaxWidth().clickable(enabled = !student.locked && !state.saving && !conflict && !roster.cancelled) {
                        marks = marks + (student.id to when (status) { "Present" -> "Absent"; "Absent" -> "Late"; else -> "Present" })
                    },
                    colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp),
                ) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).clip(CircleShape).background(Color(0xFFEFF6FF)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = PortalBlue, fontWeight = FontWeight.Black) }
                        Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(student.name, fontWeight = FontWeight.Bold); Text("${student.id} · ${student.standard}", color = Slate600, fontSize = 11.sp); if (student.locked) Text(if (student.onCampusLeave) "On-campus leave · server locked" else "Outside · server locked", color = statusColor, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                        Surface(color = statusColor.copy(alpha = .12f), shape = RoundedCornerShape(18.dp)) { Text(status, Modifier.padding(horizontal = 13.dp, vertical = 8.dp), color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.Black) }
                    }
                }
            }
            item {
                Button(
                    { onSave(marks) }, Modifier.fillMaxWidth().height(52.dp),
                    enabled = roster.students.isNotEmpty() && !state.saving && !conflict && !roster.cancelled,
                    colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(15.dp),
                ) { Text(if (roster.syncStatus == "pending") "Saved offline · sync when connected" else "Save attendance", fontWeight = FontWeight.Black) }
                Text("Your phone saves immediately. Other users see the change only after the server accepts it.", color = Slate600, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun AttendanceNotice(message: String, foreground: Color, background: Color) {
    Surface(color = background, shape = RoundedCornerShape(12.dp)) {
        Text(message, Modifier.fillMaxWidth().padding(12.dp), color = foreground, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun MentorDashboard(snapshot: HomeSnapshot, padding: PaddingValues, onStudent: (StudentSummary) -> Unit) {
    var search by remember { mutableStateOf("") }
    val today = LocalDate.now().toString()
    val enteredToday = snapshot.hifzEntries.filter { it.entryDate == today }.map { it.studentId }.distinct().size
    val progress = if (snapshot.students.isEmpty()) 0 else enteredToday * 100 / snapshot.students.size
    val shown = snapshot.students.filter { search.isBlank() || it.name.contains(search, true) || it.id.contains(search, true) }
    LazyColumn(Modifier.fillMaxSize().background(MentorBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.background(Brush.linearGradient(listOf(PortalBlue, PortalIndigo))).padding(20.dp)) {
                    Text("MENTOR PORTAL", color = Color(0xFFBFDBFE), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text("Good Morning, ${snapshot.mentor.name} 👋", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black, lineHeight = 26.sp)
                    Text("${LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM d"))} · ${snapshot.academicYear}", color = Color(0xFFDBEAFE), fontSize = 12.sp)
                    Spacer(Modifier.height(18.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BannerStat("${snapshot.students.size}", "Students", Modifier.weight(1f)); BannerStat("$enteredToday", "Hifz today", Modifier.weight(1f)); BannerStat("$progress%", "Completed", Modifier.weight(1f))
                    }
                }
            }
        }
        if (snapshot.pendingDraftCount > 0) item { StatusNotice("${snapshot.pendingDraftCount} Hifz draft(s) waiting or needing attention") }
        item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { MetricCard("Entries Logged", "$progress%", "$enteredToday of ${snapshot.students.size} logged", PortalBlue, Modifier.weight(1f)); MetricCard("Daily Attendance", "0%", "0 present · 0 absent", Color(0xFF059669), Modifier.weight(1f)) } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { MetricCard("Session Attendance", "0%", "0/0 marks", PortalIndigo, Modifier.weight(1f)); MetricCard("Currently Outside", "0", "of ${snapshot.students.size} students", Color(0xFFF97316), Modifier.weight(1f)) } }
        item {
            Text("My Students", fontSize = 20.sp, fontWeight = FontWeight.Black); Text("Open a student to record or review Hifz", color = Slate600, fontSize = 12.sp); Spacer(Modifier.height(10.dp))
            OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), placeholder = { Text("Search students") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp))
        }
        items(shown, key = { it.id }) { student -> StudentCard(student, snapshot, onStudent) }
    }
}

@Composable
private fun StudentCard(student: StudentSummary, snapshot: HomeSnapshot, onStudent: (StudentSummary) -> Unit) {
    val latest = snapshot.hifzEntries.firstOrNull { it.studentId == student.id }
    Card(Modifier.fillMaxWidth().clickable { onStudent(student) }, colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(46.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = PortalBlue, fontWeight = FontWeight.Black) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) { Text(student.name, fontWeight = FontWeight.Bold, fontSize = 16.sp); Text("${student.id} · ${student.standard}", color = Slate600, fontSize = 12.sp); if (latest != null) Text("Last Hifz: ${latest.surahName} ${latest.startVerse}–${latest.endVerse}", color = Color(0xFF15803D), fontSize = 11.sp) }
            Icon(Icons.Outlined.ChevronRight, "Open", tint = Slate600)
        }
    }
}

@Composable
private fun StaffTabletPortal(
    snapshot: HomeSnapshot, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit,
    attendance: AttendanceUiState, onAttendanceDay: (String) -> Unit,
    onAttendanceSession: (`in`.ribath.mentor.data.AttendanceSession) -> Unit,
    onAttendanceBack: () -> Unit, onAttendanceSave: (Map<String, String>) -> Unit,
    onAttendanceConflict: () -> Unit, leaves: LeavesUiState, onLoadLeaves: () -> Unit,
    onCreateLeave: (LeaveFormInput) -> Unit, onReturnLeave: (MentorLeave, String) -> Unit,
    onDiscardLeaveConflict: (String) -> Unit, reports: ReportsUiState,
    onGenerateReport: (String, String, String, String) -> Unit, chat: ChatUiState,
    onLoadChat: () -> Unit, onOpenChat: (ChatConversation) -> Unit, onCloseChat: () -> Unit,
    onRefreshChat: () -> Unit, onSendChat: (String) -> Unit, onStartChat: (String) -> Unit,
    onDiscardChatMessage: (String) -> Unit, finance: FinanceUiState, onLoadFinance: (String) -> Unit,
    onOpenFinanceAccount: (FinanceStudentBalance) -> Unit, onCloseFinanceAccount: () -> Unit,
    onAddFinanceCharge: (FinanceChargeInput) -> Unit, onRecordFinancePayment: (FinancePaymentInput) -> Unit,
    onStudent: (StudentSummary) -> Unit,
) {
    val destinations = listOf("My Class", "Attendance", "Leaves", "Reports", "Assigned", "Chat", "Finance")
    var selected by remember { mutableStateOf("My Class") }
    Column(Modifier.fillMaxSize().background(MentorBackground)) {
        Surface(color = Color.White, shadowElevation = 2.dp) {
            Row(Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.ribath_logo), "Ribath logo", Modifier.size(35.dp), contentScale = ContentScale.Fit)
                Spacer(Modifier.width(8.dp)); Text("Mentor Portal", color = PortalBlue, fontWeight = FontWeight.Black, fontSize = 17.sp)
                Spacer(Modifier.width(16.dp))
                destinations.forEach { item ->
                    Text(
                        item,
                        Modifier.clip(RoundedCornerShape(12.dp)).clickable { selected = item }
                            .background(if (selected == item) Color(0xFFEFF6FF) else Color.Transparent).padding(horizontal = 11.dp, vertical = 9.dp),
                        color = if (selected == item) PortalBlue else Slate600, fontWeight = if (selected == item) FontWeight.Bold else FontWeight.Medium, fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.weight(1f))
                Surface(color = Color(0xFFF8FAFC), shape = RoundedCornerShape(22.dp), modifier = Modifier.width(150.dp)) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(PortalBlue), contentAlignment = Alignment.Center) { Text(snapshot.mentor.name.take(2).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.sp) }
                        Spacer(Modifier.width(7.dp)); Text(snapshot.mentor.name, maxLines = 1, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
                IconButton(onSync, enabled = !syncing) { Icon(Icons.Outlined.Sync, "Sync", tint = PortalBlue) }
                IconButton(onLogout) { Icon(Icons.Outlined.Logout, "Sign out", tint = Slate600) }
            }
        }
        if (selected == "My Class") MentorTabletDashboard(snapshot, onStudent)
        else if (selected == "Attendance") AttendanceWorkspace(attendance, PaddingValues(0.dp), onAttendanceDay, onAttendanceSession, onAttendanceBack, onAttendanceSave, onAttendanceConflict)
        else if (selected == "Leaves") LeavesWorkspace(leaves, PaddingValues(0.dp), onLoadLeaves, onCreateLeave, onReturnLeave, onDiscardLeaveConflict)
        else if (selected == "Assigned") AssignedWorkspace(leaves, PaddingValues(0.dp), onLoadLeaves)
        else if (selected == "Reports") ReportsWorkspace(snapshot, reports, PaddingValues(0.dp), onGenerateReport)
        else if (selected == "Chat") ChatWorkspace(chat, PaddingValues(0.dp), onLoadChat, onOpenChat, onCloseChat, onRefreshChat, onSendChat, onStartChat, onDiscardChatMessage)
        else if (selected == "Finance") FinanceWorkspace(finance, PaddingValues(0.dp), onLoadFinance, onOpenFinanceAccount, onCloseFinanceAccount, onAddFinanceCharge, onRecordFinancePayment)
        else ModuleLanding(selected, when (selected) { "Leaves" -> "Student leave and movement records"; else -> "$selected workspace" }, adminDestinations().firstOrNull { it.label == selected }?.icon ?: Icons.Outlined.Assessment, PaddingValues(0.dp), PortalBlue, onSync)
    }
}

@Composable
private fun MentorTabletDashboard(snapshot: HomeSnapshot, onStudent: (StudentSummary) -> Unit) {
    var search by remember { mutableStateOf("") }
    val today = LocalDate.now().toString()
    val enteredToday = snapshot.hifzEntries.filter { it.entryDate == today }.map { it.studentId }.distinct().size
    val progress = if (snapshot.students.isEmpty()) 0 else enteredToday * 100 / snapshot.students.size
    val shown = snapshot.students.filter { search.isBlank() || it.name.contains(search, true) || it.id.contains(search, true) }
    val leaders = snapshot.students.sortedByDescending { student -> snapshot.hifzEntries.count { it.studentId == student.id } }.take(4)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(22.dp)) {
                Row(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF1769FF), Color(0xFF4F2DE5)))).padding(22.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(58.dp).clip(CircleShape).background(Color.White.copy(alpha = .2f)), contentAlignment = Alignment.Center) { Text(snapshot.mentor.name.take(2).uppercase(), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black) }
                    Spacer(Modifier.width(16.dp)); Column(Modifier.weight(1f)) { Text("MENTOR PORTAL", color = Color(0xFFBFDBFE), fontSize = 10.sp); Text("Good Morning, ${snapshot.mentor.name} 👋", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black); Text(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy")), color = Color(0xFFDBEAFE), fontSize = 12.sp) }
                    BannerStat("${snapshot.students.size}", "Students", Modifier.width(90.dp)); Spacer(Modifier.width(10.dp)); BannerStat("0", "Sessions", Modifier.width(90.dp)); Spacer(Modifier.width(10.dp)); BannerStat("0", "Present", Modifier.width(90.dp))
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricCard("Entries Logged", "$progress%", "$enteredToday of ${snapshot.students.size} logged", PortalBlue, Modifier.weight(1f))
                MetricCard("Daily Attendance", "0%", "0 present · 0 absent", Color(0xFF059669), Modifier.weight(1f))
                MetricCard("Session Attendance", "0%", "0/0 marks · 0 outside", PortalIndigo, Modifier.weight(1f))
                MetricCard("Currently Outside", "0", "of ${snapshot.students.size} students", Color(0xFFF97316), Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
                Card(Modifier.weight(2.15f), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFEFF6FF), shape = RoundedCornerShape(18.dp)) { Text("My Students", Modifier.padding(horizontal = 16.dp, vertical = 9.dp), color = PortalBlue, fontWeight = FontWeight.Bold) }
                            Spacer(Modifier.width(12.dp)); OutlinedTextField(search, { search = it }, Modifier.weight(1f), placeholder = { Text("Search name or admission no…") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(20.dp))
                        }
                        shown.forEach { student ->
                            Row(Modifier.fillMaxWidth().clickable { onStudent(student) }.padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFE2E8F0)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = Slate600) }
                                Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(student.name.uppercase(), fontWeight = FontWeight.Black, fontSize = 13.sp); Text("${student.id} · ${student.standard}", color = Color(0xFF94A3B8), fontSize = 10.sp); snapshot.hifzEntries.firstOrNull { it.studentId == student.id }?.let { Text("Last Hifz: ${it.surahName} – ${it.endVerse}", color = PortalIndigo, fontSize = 10.sp) } }
                                Button({ onStudent(student) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00A83B)), shape = RoundedCornerShape(18.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 7.dp)) { Text("Open progress", fontSize = 10.sp) }
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF1F5F9)))
                        }
                    }
                }
                Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFF2166F3), Color(0xFF6D28FF)))).padding(18.dp)) { Column { Text("Top Performers", color = Color.White, fontWeight = FontWeight.Black, fontSize = 17.sp); Text("Monthly leaderboard", color = Color(0xFFDBEAFE), fontSize = 10.sp) } }
                        leaders.forEachIndexed { index, student ->
                            Row(Modifier.fillMaxWidth().border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(34.dp).clip(CircleShape).background(if (index == 0) Color(0xFFFFB000) else Color(0xFFE2E8F0)), contentAlignment = Alignment.Center) { Text("${index + 1}", fontWeight = FontWeight.Black) }; Spacer(Modifier.width(10.dp)); Column { Text(student.name, fontWeight = FontWeight.Bold, fontSize = 12.sp); Text(student.standard, color = Slate600, fontSize = 10.sp) } }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminPortal(snapshot: HomeSnapshot, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit, onCreateStudent: (NewStudentInput, () -> Unit) -> Unit) {
    BoxWithConstraints {
        if (maxWidth >= 840.dp) AdminTabletPortal(snapshot, syncing, onSync, onLogout, onCreateStudent)
        else AdminPhonePortal(snapshot, syncing, onSync, onLogout, onCreateStudent)
    }
}

@Composable
private fun AdminPhonePortal(snapshot: HomeSnapshot, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit, onCreateStudent: (NewStudentInput, () -> Unit) -> Unit) {
    val drawer = rememberDrawerState(DrawerValue.Closed); val scope = rememberCoroutineScope(); var section by remember { mutableStateOf("Dashboard") }; val destinations = adminDestinations()
    BackHandler(section != "Dashboard") { section = "Dashboard" }
    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = Color.White) {
                Column(Modifier.width(286.dp).fillMaxSize().padding(18.dp)) {
                    BrandMark(); Spacer(Modifier.height(24.dp)); Text("MAIN MENU", color = Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp))
                    LazyColumn(Modifier.weight(1f)) {
                        items(destinations) { item ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { section = item.label; scope.launch { drawer.close() } }.background(if (section == item.label) Color(0xFFEAF4EE) else Color.Transparent).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(item.icon, null, tint = if (section == item.label) AdminGreen else Slate600); Spacer(Modifier.width(12.dp)); Text(item.label, fontWeight = if (section == item.label) FontWeight.Bold else FontWeight.Medium)
                            }
                        }
                    }
                    OutlinedButton(onLogout, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Logout, null); Spacer(Modifier.width(8.dp)); Text("Sign out") }
                }
            }
        },
    ) {
        Scaffold(topBar = {
            Surface(color = Color.White, shadowElevation = 2.dp) {
                Row(Modifier.fillMaxWidth().height(66.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ scope.launch { drawer.open() } }) { Icon(Icons.Outlined.Menu, "Menu", tint = AdminGreen) }
                    val pageTitle = when { section.startsWith("Student/") -> "Student Details"; else -> section }
                    Column(Modifier.weight(1f)) { Text(pageTitle, fontWeight = FontWeight.Black, fontSize = 18.sp, maxLines = 1); Text(snapshot.mentor.name, color = Slate600, fontSize = 10.sp, maxLines = 1) }
                    if (section == "Dashboard") { Button({ section = "Add Student" }, colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(13.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) { Icon(Icons.Outlined.Add, null, Modifier.size(16.dp)); Text(" Student", fontSize = 10.sp) } }
                    IconButton(onSync, enabled = !syncing) { Icon(Icons.Outlined.Sync, "Sync", tint = AdminGreen) }
                    Box(Modifier.size(36.dp).clip(CircleShape).background(AdminGreen), contentAlignment = Alignment.Center) { Text(snapshot.mentor.name.take(2).uppercase(), color = Color.White, fontWeight = FontWeight.Black) }
                }
            }
        }) { padding -> AdminSection(section, snapshot, padding, { section = it }, onCreateStudent, onSync) }
    }
}

@Composable
private fun AdminTabletPortal(snapshot: HomeSnapshot, syncing: Boolean, onSync: () -> Unit, onLogout: () -> Unit, onCreateStudent: (NewStudentInput, () -> Unit) -> Unit) {
    var section by remember { mutableStateOf("Dashboard") }
    Row(Modifier.fillMaxSize().background(PortalBackground)) {
        Surface(Modifier.width(260.dp).fillMaxSize(), color = Color.White, shadowElevation = 2.dp) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 18.dp)) {
                Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, shadowElevation = 2.dp) { Box(Modifier.padding(14.dp)) { BrandMark() } }
                Spacer(Modifier.height(24.dp)); Text("MAIN", Modifier.padding(horizontal = 12.dp), color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(7.dp))
                LazyColumn(Modifier.weight(1f)) {
                    items(adminDestinations()) { item ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { section = item.label }
                                .background(if (section == item.label) Color(0xFFEAF0FF) else Color.Transparent).padding(horizontal = 13.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(item.icon, null, Modifier.size(20.dp), tint = if (section == item.label) Color(0xFF2463EB) else Color(0xFF8CA0BC)); Spacer(Modifier.width(12.dp)); Text(item.label, color = if (section == item.label) Color(0xFF2463EB) else Slate600, fontSize = 12.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f)); if (section == item.label) Icon(Icons.Outlined.ChevronRight, null, Modifier.size(16.dp), tint = PortalBlue)
                        }
                    }
                }
            }
        }
        Column(Modifier.weight(1f).fillMaxSize()) {
            Surface(color = Color.White, shadowElevation = 1.dp) {
                Row(Modifier.fillMaxWidth().height(72.dp).padding(horizontal = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column { Text(if (section == "Dashboard") "Admin Dashboard" else section, fontSize = 22.sp, fontWeight = FontWeight.Black); Text(if (section == "Dashboard") "DASHBOARD / ADMIN DASHBOARD" else "DASHBOARD / ${section.uppercase()}", color = Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.weight(1f)); if (section == "Dashboard") { Button({ section = "Add Student" }, colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(14.dp)) { Text("+ Add New Student", fontSize = 11.sp) }; Spacer(Modifier.width(10.dp)); OutlinedButton({ section = "Finance" }, shape = RoundedCornerShape(14.dp)) { Text("Fees Details", fontSize = 11.sp) }; Spacer(Modifier.width(12.dp)) }
                    IconButton(onSync, enabled = !syncing) { Icon(Icons.Outlined.Sync, "Sync", tint = AdminGreen) }
                    Box(Modifier.size(38.dp).clip(CircleShape).background(AdminGreen), contentAlignment = Alignment.Center) { Text(snapshot.mentor.name.take(2).uppercase(), color = Color.White, fontWeight = FontWeight.Black) }
                    Spacer(Modifier.width(8.dp)); Column(Modifier.width(130.dp)) { Text(snapshot.mentor.name, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1); Text(snapshot.mentor.email, color = Color(0xFF94A3B8), fontSize = 9.sp, maxLines = 1) }
                    IconButton(onLogout) { Icon(Icons.Outlined.Logout, "Sign out", tint = Slate600) }
                }
            }
            when (section) {
                "Dashboard" -> AdminTabletDashboard(snapshot) { section = it }
                else -> AdminSection(section, snapshot, PaddingValues(0.dp), { section = it }, onCreateStudent, onSync)
            }
        }
    }
}

@Composable
private fun AdminTabletDashboard(snapshot: HomeSnapshot, onNavigate: (String) -> Unit) {
    val summary = snapshot.adminSummary
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(Color(0xFF1769FF), Color(0xFF5630F4)))).padding(22.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Welcome Back, Admin 👋", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black); Text("Your institution's performance and operations for today.", color = Color(0xFFDBEAFE), fontSize = 12.sp) }; Surface(color = Color.White.copy(alpha = .14f), shape = RoundedCornerShape(18.dp)) { Text("Updated Recently on ${LocalDate.now().format(DateTimeFormatter.ofPattern("MMM d, yyyy"))}", Modifier.padding(horizontal = 14.dp, vertical = 9.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.sp) } }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AdminCountCard("TOTAL STUDENTS", "${summary.totalStudents}", "On Campus: ${summary.onCampus}", "Out Campus: ${summary.outCampus}", Color(0xFFFF2E93), Modifier.weight(1f))
                AdminCountCard("TOTAL STAFF", "${summary.totalStaff}", "Active: ${summary.activeStaff}", "Inactive: ${summary.totalStaff - summary.activeStaff}", PortalBlue, Modifier.weight(1f))
                AdminCountCard("TOTAL ALUMNI", "0", "Completed: 0", "Dropout: 0", Color(0xFFF97316), Modifier.weight(1f))
                AdminCountCard("FEE COLLECTION", "0", "Cleared: 0", "Pending: 0", Color(0xFF00A85A), Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
                Card(Modifier.weight(1f).height(330.dp).clickable { onNavigate("Attendance") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(18.dp)) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Attendance", fontSize = 18.sp, fontWeight = FontWeight.Black); Spacer(Modifier.weight(1f)); Surface(color = Color(0xFFF8FAFC), shape = RoundedCornerShape(18.dp)) { Text("Today⌄", Modifier.padding(horizontal = 13.dp, vertical = 8.dp), fontSize = 10.sp) } }; Spacer(Modifier.height(16.dp)); Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { AttendanceMini("00", "Present", Modifier.weight(1f)); AttendanceMini("00", "Absent", Modifier.weight(1f)); AttendanceMini("00", "Late", Modifier.weight(1f)) }; Spacer(Modifier.height(28.dp)); Box(Modifier.size(140.dp).align(Alignment.CenterHorizontally).border(18.dp, Color(0xFFE5E7EB), CircleShape), contentAlignment = Alignment.Center) { Text("0%", fontSize = 20.sp, fontWeight = FontWeight.Black) } }
                }
                Card(Modifier.weight(2f).height(330.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(18.dp)) { Text("Hifz Progress Distribution", fontSize = 18.sp, fontWeight = FontWeight.Black); Text("Active students grouped by completed Juz.", color = Slate600, fontSize = 11.sp); Spacer(Modifier.height(24.dp)); listOf(64, 16, 14, 18, 11, 6, 12).forEachIndexed { index, width -> Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) { Text(listOf("0-4 Juz", "5-9 Juz", "10-14 Juz", "15-19 Juz", "20-24 Juz", "25-29 Juz", "Hafiz (30)")[index], Modifier.width(70.dp), color = Slate600, fontSize = 9.sp); Box(Modifier.fillMaxWidth(width / 80f).height(18.dp).clip(RoundedCornerShape(4.dp)).background(if (index == 6) Color(0xFF059669) else listOf(Color(0xFF60A5FA), Color(0xFF3B82F6), Color(0xFF2563EB), Color(0xFF4F46E5), Color(0xFF7C3AED), Color(0xFF9333EA))[index])) } }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Card(Modifier.weight(2f).height(230.dp).clickable { onNavigate("Calendar") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(20.dp)) { Text("Schedules", fontSize = 18.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(15.dp)); Text(LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM yyyy")), fontWeight = FontWeight.Bold); Spacer(Modifier.height(20.dp)); Text("Upcoming Events", fontWeight = FontWeight.Black); Text("No upcoming events in staging.", color = Slate600, fontSize = 11.sp) } }
                Card(Modifier.weight(1f).height(230.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(18.dp)) { Text("Quick Links", fontSize = 18.sp, fontWeight = FontWeight.Black); Text("Frequently used admin actions", color = Slate600, fontSize = 10.sp); Spacer(Modifier.height(12.dp)); listOf("Calendar", "Exam Result", "Attendance", "Fees", "Reports", "Mentor Locks").chunked(2).forEach { pair -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 4.dp)) { pair.forEach { label -> Surface(Modifier.weight(1f).clickable { onNavigate(adminQuickLinkDestination(label)) }, color = Color(0xFFEFF6FF), shape = RoundedCornerShape(12.dp)) { Text(label, Modifier.padding(12.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold) } } } } } }
            }
        }
    }
}

@Composable
private fun AdminSection(
    section: String,
    snapshot: HomeSnapshot,
    padding: PaddingValues,
    onNavigate: (String) -> Unit,
    onCreateStudent: (NewStudentInput, () -> Unit) -> Unit,
    onSync: () -> Unit,
) {
    when (section) {
        "Dashboard" -> AdminDashboard(snapshot, padding, onNavigate)
        "Students" -> AdminStudentsScreen(snapshot, padding, onNavigate)
        "Add Student" -> AddStudentScreen(padding, { onNavigate("Dashboard") }) { input -> onCreateStudent(input) { onNavigate("Students") } }
        else -> if (section.startsWith("Student/")) {
            val student = snapshot.students.firstOrNull { it.id == section.substringAfter('/') }
            if (student != null) AdminStudentDetailScreen(student, padding) { onNavigate("Students") } else onNavigate("Students")
        } else {
            val destination = adminDestinations().firstOrNull { it.label == section }
            ModuleLanding(section, "$section workspace", destination?.icon ?: Icons.Outlined.Assessment, padding, AdminGreen, onSync) { onNavigate("Dashboard") }
        }
    }
}

@Composable
private fun AdminStudentsScreen(snapshot: HomeSnapshot, padding: PaddingValues, onNavigate: (String) -> Unit) {
    var search by remember { mutableStateOf("") }
    val students = snapshot.students.filter { search.isBlank() || it.name.contains(search, true) || it.id.contains(search, true) }
    val context = LocalContext.current
    BoxWithConstraints {
      val compact = maxWidth < 600.dp
      LazyColumn(Modifier.fillMaxSize().background(PortalBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
          if (compact) Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column { Text("Students", fontSize = 26.sp, fontWeight = FontWeight.Black); Text("Dashboard / People / Students", color = Slate600, fontSize = 11.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button({ shareStudents(context, students) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00A85A))) { Icon(Icons.Outlined.Download, null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text("Export", fontSize = 11.sp) }; Button({ onNavigate("Add Student") }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = PortalBlue)) { Icon(Icons.Outlined.Add, null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text("Add Student", fontSize = 11.sp) } }
          } else Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Students", fontSize = 26.sp, fontWeight = FontWeight.Black); Text("Dashboard / People / Students Grid", color = Slate600, fontSize = 11.sp) }; Button({ shareStudents(context, students) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00A85A))) { Text("Export Students") }; Spacer(Modifier.width(8.dp)); Button({ onNavigate("Add Student") }, colors = ButtonDefaults.buttonColors(containerColor = PortalBlue)) { Text("+ Add Student") } }
        }
        item {
          if (compact) Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { AdminCountCard("ACTIVE", "${snapshot.adminSummary.totalStudents}", "Current year", "", Color(0xFF00A85A), Modifier.weight(1f)); AdminCountCard("ON CAMPUS", "${snapshot.adminSummary.onCampus}", "Inside", "", PortalBlue, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { AdminCountCard("OUT CAMPUS", "${snapshot.adminSummary.outCampus}", "Outside", "", Color(0xFFF97316), Modifier.weight(1f)); AdminCountCard("TOTAL", "${snapshot.adminSummary.totalStudents}", "Records", "", PortalIndigo, Modifier.weight(1f)) }
          } else Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { AdminCountCard("ACTIVE", "${snapshot.adminSummary.totalStudents}", "Current year", "", Color(0xFF00A85A), Modifier.weight(1f)); AdminCountCard("ON CAMPUS", "${snapshot.adminSummary.onCampus}", "Present on campus", "", PortalBlue, Modifier.weight(1f)); AdminCountCard("OUT CAMPUS", "${snapshot.adminSummary.outCampus}", "Currently outside", "", Color(0xFFF97316), Modifier.weight(1f)); AdminCountCard("TOTAL", "${snapshot.adminSummary.totalStudents}", "Active records", "", PortalIndigo, Modifier.weight(1f)) }
        }
        item { OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), placeholder = { Text("Search name or admission no.") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(16.dp)) }
        items(students, key = { it.id }) { student ->
          Card(Modifier.fillMaxWidth().clickable { onNavigate("Student/${student.id}") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
              if (!compact) Text(student.id, Modifier.width(85.dp), color = PortalBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
              Box(Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFE8EDFF)), contentAlignment = Alignment.Center) { Text(student.name.take(1), color = PortalIndigo, fontWeight = FontWeight.Black) }
              Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(student.name, fontWeight = FontWeight.Black, fontSize = 13.sp); Text("${student.id} · ${student.standard}", color = Slate600, fontSize = 10.sp) }
              Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(14.dp)) { Text("Active", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), color = Color(0xFF047857), fontSize = 9.sp, fontWeight = FontWeight.Bold) }; Spacer(Modifier.width(8.dp)); Icon(Icons.Outlined.ChevronRight, "View details", tint = PortalIndigo)
            }
          }
        }
      }
    }
}

private fun shareStudents(context: Context, students: List<StudentSummary>) {
    val csv = buildString {
        appendLine("Admission No,Name,Class")
        students.forEach { student ->
            val safeName = student.name.replace("\"", "\"\"")
            appendLine("${student.id},\"$safeName\",${student.standard}")
        }
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_SUBJECT, "Ribath students export")
        putExtra(Intent.EXTRA_TEXT, csv)
    }
    context.startActivity(Intent.createChooser(intent, "Export students"))
}

@Composable
private fun AddStudentScreen(padding: PaddingValues, onBack: () -> Unit, onSave: (NewStudentInput) -> Unit) {
    var admissionNumber by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var dateOfBirth by remember { mutableStateOf("") }
    var standard by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("") }
    var parentPhone by remember { mutableStateOf("") }
    val valid = admissionNumber.isNotBlank() && name.isNotBlank() && standard.isNotBlank() && runCatching { LocalDate.parse(dateOfBirth) }.isSuccess
    LazyColumn(Modifier.fillMaxSize().background(PortalBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Row(verticalAlignment = Alignment.CenterVertically) { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }; Column { Text("Add Student", fontSize = 25.sp, fontWeight = FontWeight.Black); Text("Create an active student record", color = Slate600, fontSize = 11.sp) } } }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Basic information", fontSize = 18.sp, fontWeight = FontWeight.Black)
                    OutlinedTextField(admissionNumber, { admissionNumber = it.filter { char -> char.isLetterOrDigit() || char in "/_-" } }, Modifier.fillMaxWidth(), label = { Text("Admission number *") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Full name *") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    OutlinedTextField(dateOfBirth, { dateOfBirth = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Date of birth *") }, placeholder = { Text("YYYY-MM-DD") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    OutlinedTextField(standard, { standard = it }, Modifier.fillMaxWidth(), label = { Text("Class / standard *") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    OutlinedTextField(gender, { gender = it }, Modifier.fillMaxWidth(), label = { Text("Gender") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    OutlinedTextField(parentPhone, { parentPhone = it.filter { char -> char.isDigit() || char == '+' } }, Modifier.fillMaxWidth(), label = { Text("Parent phone") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true, shape = RoundedCornerShape(14.dp))
                    Button(
                        { onSave(NewStudentInput(admissionNumber.trim(), name.trim(), dateOfBirth.trim(), standard.trim(), gender.trim().ifBlank { null }, parentPhone.trim().ifBlank { null })) },
                        Modifier.fillMaxWidth().height(50.dp), enabled = valid,
                        colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(14.dp),
                    ) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text("Create student", fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

@Composable
private fun AdminStudentDetailScreen(student: StudentSummary, padding: PaddingValues, onBack: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize().background(PortalBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") } }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(72.dp).clip(CircleShape).background(Color(0xFFE8EDFF)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = PortalIndigo, fontSize = 22.sp, fontWeight = FontWeight.Black) }
                    Spacer(Modifier.height(12.dp)); Text(student.name, fontSize = 22.sp, fontWeight = FontWeight.Black)
                    Text("${student.id} · ${student.standard}", color = Slate600)
                    Spacer(Modifier.height(10.dp)); Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(18.dp)) { Text("Active student", Modifier.padding(horizontal = 12.dp, vertical = 7.dp), color = Color(0xFF047857), fontWeight = FontWeight.Bold, fontSize = 11.sp) }
                }
            }
        }
        item { Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(18.dp)) { Text("Student information", fontSize = 17.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(14.dp)); DetailRow("Admission number", student.id); DetailRow("Name", student.name); DetailRow("Class", student.standard) } } }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) { Text(label, Modifier.weight(1f), color = Slate600, fontSize = 11.sp); Text(value, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
}

@Composable
private fun AdminCountCard(label: String, value: String, left: String, right: String, accent: Color, modifier: Modifier) { Card(modifier.height(110.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(34.dp).clip(CircleShape).background(accent.copy(alpha = .1f)), contentAlignment = Alignment.Center) { Box(Modifier.size(8.dp).clip(CircleShape).background(accent)) }; Spacer(Modifier.width(10.dp)); Column { Text(value, fontSize = 23.sp, fontWeight = FontWeight.Black); Text(label, color = Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold) } }; Spacer(Modifier.weight(1f)); Row { Text(left, Modifier.weight(1f), color = Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold); Text(right, color = Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold) } } } }

@Composable
private fun AttendanceMini(value: String, label: String, modifier: Modifier) { Surface(modifier, color = Color(0xFFF8FAFC), shape = RoundedCornerShape(14.dp)) { Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(value, fontSize = 20.sp, fontWeight = FontWeight.Black); Text(label, color = Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold) } } }

private fun adminDestinations() = listOf(
    PortalDestination("Dashboard", Icons.Outlined.Home), PortalDestination("Students", Icons.Outlined.People), PortalDestination("Attendance", Icons.Outlined.EventAvailable), PortalDestination("Staff", Icons.Outlined.Groups),
    PortalDestination("Academic Year", Icons.Outlined.School), PortalDestination("Madrasa", Icons.Outlined.Assessment), PortalDestination("School", Icons.Outlined.School), PortalDestination("Hifz", Icons.Outlined.Assessment),
    PortalDestination("Finance", Icons.Outlined.Payments), PortalDestination("Leaves", Icons.Outlined.SwapHoriz), PortalDestination("Disciplinary", Icons.Outlined.Security), PortalDestination("Reports", Icons.Outlined.Assessment),
    PortalDestination("Calendar", Icons.Outlined.CalendarMonth), PortalDestination("Chat", Icons.Outlined.ChatBubbleOutline), PortalDestination("Settings", Icons.Outlined.Settings),
)

@Composable
private fun AdminDashboard(snapshot: HomeSnapshot, padding: PaddingValues, onNavigate: (String) -> Unit) {
    val summary = snapshot.adminSummary
    LazyColumn(Modifier.fillMaxSize().background(PortalBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(Color(0xFF1769FF), Color(0xFF5630F4)))).padding(20.dp)) {
                Column { Text("Welcome Back, Admin 👋", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Black); Text("Your institution's performance and operations for today.", color = Color(0xFFDBEAFE), fontSize = 11.sp); Spacer(Modifier.height(14.dp)); Surface(color = Color.White.copy(alpha = .14f), shape = RoundedCornerShape(18.dp)) { Text("Updated ${LocalDate.now().format(DateTimeFormatter.ofPattern("MMM d, yyyy"))}", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.sp) } }
            }
        }
        item { AdminPhoneSummaryCard("TOTAL STUDENTS", "${summary.totalStudents}", "On Campus: ${summary.onCampus}", "Out Campus: ${summary.outCampus}", Color(0xFFFF2E93)) { onNavigate("Students") } }
        item { AdminPhoneSummaryCard("TOTAL STAFF", "${summary.totalStaff}", "Active: ${summary.activeStaff}", "Inactive: ${summary.totalStaff - summary.activeStaff}", PortalBlue) { onNavigate("Staff") } }
        item { AdminPhoneSummaryCard("TOTAL ALUMNI", "0", "Completed: 0", "Dropout: 0", Color(0xFFF97316)) { onNavigate("Reports") } }
        item { AdminPhoneSummaryCard("FEE COLLECTION", "0", "Cleared: 0", "Pending: 0", Color(0xFF00A85A)) { onNavigate("Finance") } }
        item {
            Card(Modifier.fillMaxWidth().clickable { onNavigate("Calendar") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp)) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Schedules", fontSize = 19.sp, fontWeight = FontWeight.Black); Spacer(Modifier.weight(1f)); Icon(Icons.Outlined.ChevronRight, "Open calendar", tint = PortalBlue) }; Spacer(Modifier.height(12.dp)); Text(LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM yyyy")), fontWeight = FontWeight.Bold); Spacer(Modifier.height(18.dp)); Text("Upcoming Events", fontWeight = FontWeight.Black); Text("No upcoming events.", color = Slate600, fontSize = 11.sp) }
            }
        }
        item {
            Card(Modifier.fillMaxWidth().clickable { onNavigate("Attendance") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp)) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Attendance", fontSize = 19.sp, fontWeight = FontWeight.Black); Spacer(Modifier.weight(1f)); Text("Today ›", color = PortalBlue, fontSize = 11.sp, fontWeight = FontWeight.Bold) }; Spacer(Modifier.height(14.dp)); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { AttendanceMini("00", "Present", Modifier.weight(1f)); AttendanceMini("00", "Absent", Modifier.weight(1f)); AttendanceMini("00", "Late", Modifier.weight(1f)) } }
            }
        }
        item { Text("Quick Links", fontSize = 20.sp, fontWeight = FontWeight.Black); Text("Frequently used admin actions", color = Slate600, fontSize = 11.sp) }
        items(listOf("Calendar", "Exam Result", "Attendance", "Fees", "Reports", "Mentor Locks", "Requests")) { label ->
            val destination = adminQuickLinkDestination(label)
            val icon = adminDestinations().firstOrNull { it.label == destination }?.icon ?: Icons.Outlined.Assessment
            Surface(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).clickable { onNavigate(destination) }, color = Color(0xFFEFF6FF)) { Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(40.dp).clip(CircleShape).background(PortalBlue), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp)) }; Spacer(Modifier.width(12.dp)); Text(label, Modifier.weight(1f), fontWeight = FontWeight.Bold); Icon(Icons.Outlined.ChevronRight, null, tint = Color(0xFF94A3B8)) } }
        }
        item {
            Card(Modifier.fillMaxWidth().clickable { onNavigate("Hifz") }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp)) { Text("Hifz Progress Distribution", fontSize = 18.sp, fontWeight = FontWeight.Black); Text("Active students grouped by completed Juz.", color = Slate600, fontSize = 10.sp); Spacer(Modifier.height(18.dp)); listOf("0-4 Juz", "5-9 Juz", "10-14 Juz", "15-19 Juz", "20-24 Juz", "25-29 Juz", "Hafiz (30)").forEachIndexed { index, label -> Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.width(70.dp), color = Slate600, fontSize = 9.sp); Box(Modifier.fillMaxWidth(if (index == 0 && summary.totalStudents > 0) .9f else .08f).height(14.dp).clip(RoundedCornerShape(4.dp)).background(if (index == 6) Color(0xFF059669) else PortalBlue.copy(alpha = 1f - index * .08f))) } }
                }
            }
        }
    }
}

@Composable
private fun AdminPhoneSummaryCard(label: String, value: String, left: String, right: String, accent: Color, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().height(126.dp).clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.padding(18.dp)) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(48.dp).clip(CircleShape).background(accent.copy(alpha = .1f)), contentAlignment = Alignment.Center) { Box(Modifier.size(10.dp).clip(CircleShape).background(accent)) }; Spacer(Modifier.weight(1f)); Column(horizontalAlignment = Alignment.End) { Text(value, fontSize = 27.sp, fontWeight = FontWeight.Black); Text(label, color = Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold) } }; Spacer(Modifier.weight(1f)); Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF1F5F9))); Spacer(Modifier.height(9.dp)); Row { Text(left, Modifier.weight(1f), color = Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(right, color = Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold) } }
    }
}

private fun adminQuickLinkDestination(label: String) = when (label) {
    "Exam Result", "Reports" -> "Reports"
    "Fees" -> "Finance"
    "Mentor Locks" -> "Settings"
    "Requests" -> "Leaves"
    else -> label
}

@Composable
private fun LeavesWorkspace(
    state: LeavesUiState,
    padding: PaddingValues,
    onLoad: () -> Unit,
    onCreate: (LeaveFormInput) -> Unit,
    onReturn: (MentorLeave, String) -> Unit,
    onDiscardConflict: (String) -> Unit,
) {
    var createType by remember { mutableStateOf<String?>(null) }
    var section by remember { mutableStateOf("Outside") }
    var search by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { onLoad() }

    createType?.let { type ->
        LeaveCreateWorkspace(
            state = state,
            leaveType = type,
            padding = padding,
            onBack = { createType = null },
            onCreate = {
                onCreate(it)
                createType = null
            },
        )
        return
    }

    val workspace = state.workspace
    val activeLeaves = workspace.leaves.filter { it.status in setOf("outside", "approved") && it.actualReturnDatetime == null }
    val outside = activeLeaves.filter { it.leaveType == "out-campus" }
    val internal = activeLeaves.filter { it.leaveType in setOf("on-campus", "internal") }
    val filteredLeaves = (if (section == "Outside") outside else internal).filter {
        search.isBlank() || it.studentName.contains(search, true) || it.studentId.contains(search, true) || (it.reasonCategory?.contains(search, true) == true)
    }
    val pendingCreates = workspace.pendingMutations.filter { it.draft.operation == "create" }

    LazyColumn(
        Modifier.fillMaxSize().background(MentorBackground).padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Student Leaves", fontSize = 25.sp, fontWeight = FontWeight.Black)
            Text("Manage authorized student movements safely online or offline.", color = Slate600, fontSize = 12.sp)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    { createType = "out-campus" }, Modifier.weight(1f).height(50.dp),
                    enabled = !state.saving,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    shape = RoundedCornerShape(15.dp),
                ) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text("Out-campus", fontWeight = FontWeight.Bold) }
                Button(
                    { createType = "on-campus" }, Modifier.weight(1f).height(50.dp),
                    enabled = !state.saving,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                    shape = RoundedCornerShape(15.dp),
                ) { Icon(Icons.Outlined.SwapHoriz, null); Spacer(Modifier.width(6.dp)); Text("On-campus", fontWeight = FontWeight.Bold) }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LeaveStatCard(outside.size.toString(), "Outside", Color(0xFF059669), Modifier.weight(1f))
                LeaveStatCard(workspace.institutionalLeaves.size.toString(), "Institution", PortalBlue, Modifier.weight(1f))
                LeaveStatCard(internal.size.toString(), "Internal", Color(0xFF7C3AED), Modifier.weight(1f))
            }
        }
        if (workspace.cached) item { StatusNotice("Offline · showing saved leave data. New actions will sync when the connection returns.") }
        state.error?.let { message -> item { ErrorNotice(message) } }
        if (state.loading) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = PortalBlue) } }
        if (workspace.pendingMutations.isNotEmpty()) {
            item { Text("Sync activity", fontSize = 18.sp, fontWeight = FontWeight.Black) }
            items(workspace.pendingMutations, key = { it.draft.mutationId }) { pending ->
                val studentName = workspace.students.firstOrNull { it.id == pending.draft.studentId }?.name
                    ?: workspace.leaves.firstOrNull { it.id == pending.draft.leaveId }?.studentName
                    ?: "Student leave"
                PendingLeaveCard(studentName, pending, state.saving, onDiscardConflict)
            }
        }
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFEFF2F7)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                LeaveSectionTab("Outside", section == "Outside", Modifier.weight(1f)) { section = "Outside" }
                LeaveSectionTab("Institution", section == "Institution", Modifier.weight(1f)) { section = "Institution" }
                LeaveSectionTab("Internal", section == "Internal", Modifier.weight(1f)) { section = "Internal" }
            }
        }
        if (section != "Institution") item {
            OutlinedTextField(
                search, { search = it }, Modifier.fillMaxWidth(),
                placeholder = { Text("Search student, ID, or reason") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true,
                shape = RoundedCornerShape(15.dp),
            )
        }
        if (section == "Institution") {
            if (workspace.institutionalLeaves.isEmpty() && !state.loading) item { EmptyWorkspaceCard("No institutional leave", "Authorized institutional leave periods will appear here.", Icons.Outlined.CalendarMonth) }
            items(workspace.institutionalLeaves, key = { it.id }) { leave ->
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.CalendarMonth, null, tint = PortalBlue) }
                            Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(leave.name, fontWeight = FontWeight.Black); Text(leave.targetSummary, color = Slate600, fontSize = 11.sp) }
                        }
                        Text("${prettyDateTime(leave.startDatetime)} → ${prettyDateTime(leave.endDatetime)}", color = Slate600, fontSize = 11.sp)
                        if (leave.campusLocation.isNotBlank()) Text(leave.campusLocation, color = PortalBlue, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            if (filteredLeaves.isEmpty() && !state.loading) item {
                EmptyWorkspaceCard(
                    if (section == "Outside") "All students are on campus" else "No internal leave",
                    if (pendingCreates.isNotEmpty()) "A new leave is waiting to sync." else "No active ${section.lowercase()} movements match this view.",
                    Icons.Outlined.People,
                )
            }
            items(filteredLeaves, key = { it.id }) { leave ->
                MentorLeaveCard(leave, state.saving, workspace.pendingMutations.any { it.draft.leaveId == leave.id }) {
                    onReturn(leave, Instant.now().toString())
                }
            }
            val history = workspace.leaves.filter { it.actualReturnDatetime != null || it.status in setOf("completed", "returned", "cancelled") }
                .filter { section == "Outside" && it.leaveType == "out-campus" || section == "Internal" && it.leaveType in setOf("on-campus", "internal") }
                .take(12)
            if (history.isNotEmpty()) {
                item { Text("Recent movements", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                items(history, key = { "history-${it.id}" }) { leave -> MentorLeaveCard(leave, saving = false, hasPendingReturn = false, onReturn = null) }
            }
        }
    }
}

@Composable
private fun LeaveCreateWorkspace(
    state: LeavesUiState,
    leaveType: String,
    padding: PaddingValues,
    onBack: () -> Unit,
    onCreate: (LeaveFormInput) -> Unit,
) {
    var selected by remember { mutableStateOf<LeaveStudent?>(null) }
    var studentSearch by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("Personal") }
    var start by remember { mutableStateOf(nowLocalDateTime()) }
    var end by remember { mutableStateOf(nowLocalDateTime(2)) }
    var companion by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var remarks by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    val pendingStudentIds = state.workspace.pendingMutations.mapNotNull { it.draft.studentId }.toSet()
    val available = state.workspace.students.filter { it.activeLeaveId == null && it.id !in pendingStudentIds }
        .filter { studentSearch.isBlank() || it.name.contains(studentSearch, true) || it.id.contains(studentSearch, true) }

    LazyColumn(
        Modifier.fillMaxSize().background(MentorBackground).padding(padding),
        contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
                Column { Text(if (leaveType == "out-campus") "New out-campus leave" else "New on-campus leave", fontSize = 22.sp, fontWeight = FontWeight.Black); Text("Saved securely on this device when offline", color = Slate600, fontSize = 11.sp) }
            }
        }
        validationError?.let { item { ErrorNotice(it) } }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("1. Select student", fontSize = 17.sp, fontWeight = FontWeight.Black)
                    OutlinedTextField(studentSearch, { studentSearch = it }, Modifier.fillMaxWidth(), placeholder = { Text("Search name or admission number") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    available.take(12).forEach { student ->
                        Surface(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { selected = student },
                            color = if (selected?.id == student.id) Color(0xFFDBEAFE) else Color(0xFFF8FAFC),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(38.dp).clip(CircleShape).background(if (selected?.id == student.id) PortalBlue else Color(0xFFE2E8F0)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = if (selected?.id == student.id) Color.White else Slate600, fontWeight = FontWeight.Bold) }
                                Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(student.name, fontWeight = FontWeight.Bold); Text("${student.id} · ${student.standard}", color = Slate600, fontSize = 11.sp) }
                                if (selected?.id == student.id) Icon(Icons.Outlined.CloudDone, "Selected", tint = PortalBlue)
                            }
                        }
                    }
                    if (available.isEmpty()) Text("No students are currently available for this leave.", color = Slate600, fontSize = 11.sp)
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    Text("2. Leave details", fontSize = 17.sp, fontWeight = FontWeight.Black)
                    Text("Reason category", color = Slate600, fontSize = 11.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Personal", "Medical", "Function").forEach { choice ->
                            Surface(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { reason = choice }, color = if (reason == choice) Color(0xFFDBEAFE) else Color(0xFFF1F5F9), shape = RoundedCornerShape(12.dp)) { Text(choice, Modifier.padding(vertical = 10.dp), color = if (reason == choice) PortalBlue else Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                        }
                    }
                    OutlinedTextField(start, { start = it }, Modifier.fillMaxWidth(), label = { Text("Starts") }, supportingText = { Text("YYYY-MM-DD HH:mm") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    if (leaveType == "out-campus") {
                        OutlinedTextField(end, { end = it }, Modifier.fillMaxWidth(), label = { Text("Expected return") }, supportingText = { Text("YYYY-MM-DD HH:mm") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                        OutlinedTextField(companion, { companion = it }, Modifier.fillMaxWidth(), label = { Text("Companion name") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                        OutlinedTextField(relationship, { relationship = it }, Modifier.fillMaxWidth(), label = { Text("Relationship") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                    }
                    OutlinedTextField(remarks, { remarks = it }, Modifier.fillMaxWidth(), label = { Text("Remarks (optional)") }, minLines = 2, shape = RoundedCornerShape(14.dp))
                }
            }
        }
        item {
            Button(
                onClick = {
                    val student = selected
                    val startIso = parseLocalDateTime(start)
                    val endIso = if (leaveType == "out-campus") parseLocalDateTime(end) else null
                    validationError = when {
                        student == null -> "Select a student."
                        startIso == null -> "Enter a valid start date and time."
                        leaveType == "out-campus" && endIso == null -> "Enter a valid expected return date and time."
                        leaveType == "out-campus" && endIso != null && startIso != null && Instant.parse(endIso) <= Instant.parse(startIso) -> "Expected return must be after the start time."
                        leaveType == "out-campus" && companion.isBlank() -> "Companion name is required for out-campus leave."
                        leaveType == "out-campus" && relationship.isBlank() -> "Relationship is required for out-campus leave."
                        else -> null
                    }
                    if (validationError == null && student != null && startIso != null) onCreate(LeaveFormInput(
                        student, leaveType, startIso, endIso, reason, remarks.trim().ifBlank { null },
                        companion.trim().ifBlank { null }, relationship.trim().ifBlank { null },
                    ))
                },
                modifier = Modifier.fillMaxWidth().height(52.dp), enabled = !state.saving,
                colors = ButtonDefaults.buttonColors(containerColor = if (leaveType == "out-campus") Color(0xFF059669) else Color(0xFF7C3AED)),
                shape = RoundedCornerShape(15.dp),
            ) { if (state.saving) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else Text("Save leave", fontWeight = FontWeight.Black) }
        }
    }
}

@Composable
private fun AssignedWorkspace(state: LeavesUiState, padding: PaddingValues, onLoad: () -> Unit, onBack: (() -> Unit)? = null) {
    var expanded by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { onLoad() }
    LazyColumn(Modifier.fillMaxSize().background(MentorBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            if (onBack != null) IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
            Text("Assigned Students", fontSize = 25.sp, fontWeight = FontWeight.Black)
            Text("Delegated student scope approved for you by administration.", color = Slate600, fontSize = 12.sp)
        }
        if (state.workspace.cached) item { StatusNotice("Offline · showing saved assignment data.") }
        state.error?.let { item { ErrorNotice(it) } }
        if (state.loading) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = PortalBlue) } }
        if (state.workspace.assignments.isEmpty() && !state.loading) item { EmptyWorkspaceCard("No students assigned to you", "Approved mentor delegations will appear here and remain available offline.", Icons.Outlined.People) }
        items(state.workspace.assignments, key = { it.id }) { assignment ->
            Card(
                Modifier.fillMaxWidth().clickable { expanded = if (expanded == assignment.id) null else assignment.id },
                colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Text(assignment.originalMentorName.take(2).uppercase(), color = PortalBlue, fontWeight = FontWeight.Black) }
                        Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(assignment.studentName ?: "${assignment.studentCount} assigned student(s)", fontWeight = FontWeight.Black); Text("From ${assignment.originalMentorName}", color = Slate600, fontSize = 11.sp) }
                        Icon(Icons.Outlined.ChevronRight, "Details", tint = Slate600)
                    }
                    if (expanded == assignment.id) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE2E8F0)))
                        Text("Authorized scope", color = PortalBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Text(if (assignment.studentId != null) "One specifically delegated student" else "${assignment.studentCount} delegated students", fontSize = 12.sp)
                        assignment.reason?.let { Text("Reason: $it", color = Slate600, fontSize = 11.sp) }
                        assignment.updatedAt?.let { Text("Updated ${prettyDateTime(it)}", color = Slate600, fontSize = 10.sp) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PendingLeaveCard(
    studentName: String,
    pending: `in`.ribath.mentor.data.PendingLeaveMutation,
    saving: Boolean,
    onDiscardConflict: (String) -> Unit,
) {
    val conflicted = pending.status in setOf("conflict", "rejected")
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = if (conflicted) Color(0xFFFFF1F2) else Color(0xFFFFFBEB)), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(9.dp).clip(CircleShape).background(if (conflicted) Color(0xFFDC2626) else Color(0xFFF59E0B)))
                Spacer(Modifier.width(8.dp)); Text(studentName, Modifier.weight(1f), fontWeight = FontWeight.Black)
                Text(if (conflicted) "Needs review" else "Waiting to sync", color = if (conflicted) Color(0xFFB91C1C) else Color(0xFFB45309), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Text(if (pending.draft.operation == "return") "Return movement" else "${pending.draft.leaveType?.replace('-', ' ')} leave", color = Slate600, fontSize = 11.sp)
            pending.error?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 11.sp) }
            if (conflicted) OutlinedButton({ onDiscardConflict(pending.draft.mutationId) }, enabled = !saving, shape = RoundedCornerShape(12.dp)) { Text("Discard local change and load latest", fontSize = 11.sp) }
        }
    }
}

@Composable
private fun MentorLeaveCard(leave: MentorLeave, saving: Boolean, hasPendingReturn: Boolean, onReturn: (() -> Unit)?) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(43.dp).clip(CircleShape).background(if (leave.leaveType == "out-campus") Color(0xFFDCFCE7) else Color(0xFFF3E8FF)), contentAlignment = Alignment.Center) { Text(leave.studentName.take(2).uppercase(), color = if (leave.leaveType == "out-campus") Color(0xFF047857) else Color(0xFF7C3AED), fontWeight = FontWeight.Black) }
                Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(leave.studentName, fontWeight = FontWeight.Black); Text("${leave.studentId} · ${leave.standard}", color = Slate600, fontSize = 11.sp) }
                Surface(color = if (leave.actualReturnDatetime == null) Color(0xFFECFDF5) else Color(0xFFF1F5F9), shape = RoundedCornerShape(12.dp)) { Text(if (leave.actualReturnDatetime == null) "Active" else "Returned", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), color = if (leave.actualReturnDatetime == null) Color(0xFF047857) else Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
            }
            Text("${prettyDateTime(leave.startDatetime)}${leave.endDatetime?.let { " → ${prettyDateTime(it)}" } ?: ""}", color = Slate600, fontSize = 11.sp)
            leave.reasonCategory?.let { Text(it, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
            if (!leave.companionName.isNullOrBlank()) Text("With ${leave.companionName}${leave.companionRelationship?.let { " · $it" } ?: ""}", color = Slate600, fontSize = 11.sp)
            leave.actualReturnDatetime?.let { Text("Returned ${prettyDateTime(it)}${leave.returnStatus?.let { status -> " · $status" } ?: ""}", color = Color(0xFF047857), fontSize = 11.sp) }
            if (onReturn != null) Button(onReturn, Modifier.fillMaxWidth(), enabled = !saving && !hasPendingReturn, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F172A)), shape = RoundedCornerShape(13.dp)) { Text(if (hasPendingReturn) "Return waiting to sync" else if (leave.leaveType == "out-campus") "Mark returned to campus" else "End on-campus leave", fontWeight = FontWeight.Bold, fontSize = 11.sp) }
        }
    }
}

@Composable
private fun LeaveStatCard(value: String, label: String, accent: Color, modifier: Modifier) {
    Card(modifier.height(86.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxSize().padding(13.dp), verticalArrangement = Arrangement.SpaceBetween) { Box(Modifier.size(8.dp).clip(CircleShape).background(accent)); Text(value, fontSize = 20.sp, fontWeight = FontWeight.Black); Text(label, color = Slate600, fontSize = 9.sp) }
    }
}

@Composable
private fun LeaveSectionTab(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick), color = if (selected) Color.White else Color.Transparent, shape = RoundedCornerShape(12.dp), shadowElevation = if (selected) 1.dp else 0.dp) {
        Text(label, Modifier.padding(vertical = 10.dp), color = if (selected) PortalBlue else Slate600, fontWeight = FontWeight.Bold, fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun EmptyWorkspaceCard(title: String, detail: String, icon: ImageVector) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally) { Box(Modifier.size(48.dp).clip(CircleShape).background(Color(0xFFEFF6FF)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = PortalBlue) }; Spacer(Modifier.height(10.dp)); Text(title, fontWeight = FontWeight.Black); Text(detail, color = Slate600, fontSize = 11.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
    }
}

@Composable
private fun ErrorNotice(message: String) {
    Surface(color = Color(0xFFFFF1F2), shape = RoundedCornerShape(14.dp)) { Text(message, Modifier.padding(14.dp), color = Color(0xFFB91C1C), fontSize = 11.sp) }
}

private val leaveDateTimeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
private fun nowLocalDateTime(hoursAhead: Long = 0): String = LocalDateTime.now().plusHours(hoursAhead).withSecond(0).withNano(0).format(leaveDateTimeFormat)
private fun parseLocalDateTime(value: String): String? = runCatching { LocalDateTime.parse(value.trim(), leaveDateTimeFormat).atZone(ZoneId.systemDefault()).toInstant().toString() }.getOrNull()
private fun prettyDateTime(value: String): String = runCatching { Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("dd MMM yyyy, h:mm a")) }.getOrElse { value.replace('T', ' ').take(16) }

@Composable
private fun ChatWorkspace(
    state: ChatUiState,
    padding: PaddingValues,
    onLoad: () -> Unit,
    onOpen: (ChatConversation) -> Unit,
    onClose: () -> Unit,
    onRefresh: () -> Unit,
    onSend: (String) -> Unit,
    onStart: (String) -> Unit,
    onDiscard: (String) -> Unit,
) {
    LaunchedEffect(Unit) { onLoad() }
    LaunchedEffect(state.activeConversationId) {
        if (state.activeConversationId != null) while (true) {
            delay(4_000)
            onRefresh()
        }
    }
    BackHandler(state.activeConversationId != null) { onClose() }
    BoxWithConstraints(Modifier.fillMaxSize().background(MentorBackground).padding(padding)) {
        val wide = maxWidth >= 720.dp
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                ChatConversationList(state, Modifier.width(330.dp), onOpen, onStart)
                Box(Modifier.width(1.dp).fillMaxSize().background(Color(0xFFE2E8F0)))
                ChatMessagePane(state, Modifier.weight(1f), onClose = null, onSend, onDiscard)
            }
        } else if (state.activeConversationId == null) {
            ChatConversationList(state, Modifier.fillMaxSize(), onOpen, onStart)
        } else {
            ChatMessagePane(state, Modifier.fillMaxSize(), onClose, onSend, onDiscard)
        }
    }
}

@Composable
private fun ChatConversationList(
    state: ChatUiState,
    modifier: Modifier,
    onOpen: (ChatConversation) -> Unit,
    onStart: (String) -> Unit,
) {
    var search by remember { mutableStateOf("") }
    var showStaff by remember { mutableStateOf(false) }
    val conversations = state.workspace.conversations.filter { search.isBlank() || it.name.contains(search, true) || (it.lastMessage?.contains(search, true) == true) }
    Column(modifier.background(Color.White)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ChatBubbleOutline, null, tint = PortalBlue); Spacer(Modifier.width(8.dp)); Text("Chats", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Black)
            Surface(Modifier.size(40.dp).clip(CircleShape).clickable { showStaff = !showStaff }, color = Color(0xFFDBEAFE), shape = CircleShape) { Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Add, "New chat", tint = PortalBlue) } }
        }
        if (state.workspace.cached) Text("Offline · saved conversations", Modifier.padding(horizontal = 16.dp), color = Color(0xFFB45309), fontSize = 10.sp, fontWeight = FontWeight.Bold)
        state.error?.let { Box(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) { ErrorNotice(it) } }
        OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), placeholder = { Text(if (showStaff) "Search staff" else "Search conversations") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(15.dp))
        if (state.loading && state.workspace.conversations.isEmpty()) Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = PortalBlue) }
        if (showStaff) {
            val staff = state.workspace.staff.filter { search.isBlank() || it.name.contains(search, true) || it.role.contains(search, true) }
            Text("Start a conversation", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), fontWeight = FontWeight.Black)
            LazyColumn(Modifier.weight(1f)) {
                items(staff, key = { it.id }) { person ->
                    Row(Modifier.fillMaxWidth().clickable { onStart(person.id); showStaff = false }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        ChatAvatar(person.name, PortalBlue); Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(person.name, fontWeight = FontWeight.Bold); Text(person.role.replace('_', ' '), color = Slate600, fontSize = 10.sp) }; Icon(Icons.Outlined.ChatBubbleOutline, "Start chat", tint = PortalBlue)
                    }
                }
                if (staff.isEmpty()) item { Box(Modifier.padding(16.dp)) { Text("No staff match this search.", color = Slate600, fontSize = 11.sp) } }
            }
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(conversations, key = { it.id }) { conversation ->
                    val selected = state.activeConversationId == conversation.id
                    Row(
                        Modifier.fillMaxWidth().background(if (selected) Color(0xFFEFF6FF) else Color.Transparent).clickable { onOpen(conversation) }.padding(horizontal = 15.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ChatAvatar(conversation.name, if (conversation.type == "group") Color(0xFF7C3AED) else PortalBlue)
                        Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) { Text(conversation.name, Modifier.weight(1f), fontWeight = FontWeight.Black, maxLines = 1); conversation.lastMessageAt?.let { Text(shortChatTime(it), color = Slate600, fontSize = 8.sp) } }
                            Text(conversation.lastMessage ?: if (conversation.type == "group") "${conversation.memberCount ?: 0} members" else "Start the conversation", color = Slate600, fontSize = 10.sp, maxLines = 1)
                        }
                        if (conversation.unreadCount > 0) {
                            Spacer(Modifier.width(7.dp)); Box(Modifier.size(22.dp).clip(CircleShape).background(PortalBlue), contentAlignment = Alignment.Center) { Text(conversation.unreadCount.coerceAtMost(99).toString(), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black) }
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF1F5F9)))
                }
                if (conversations.isEmpty() && !state.loading) item { Box(Modifier.padding(16.dp)) { EmptyWorkspaceCard("No conversations", "Tap + to start a secure staff conversation.", Icons.Outlined.ChatBubbleOutline) } }
            }
        }
    }
}

@Composable
private fun ChatMessagePane(
    state: ChatUiState,
    modifier: Modifier,
    onClose: (() -> Unit)?,
    onSend: (String) -> Unit,
    onDiscard: (String) -> Unit,
) {
    var messageText by remember(state.activeConversationId) { mutableStateOf("") }
    val conversation = state.workspace.conversations.firstOrNull { it.id == state.activeConversationId }
    if (conversation == null) {
        Box(modifier.background(MentorBackground), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Box(Modifier.size(64.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.ChatBubbleOutline, null, tint = PortalBlue, modifier = Modifier.size(32.dp)) }; Spacer(Modifier.height(12.dp)); Text("Select a conversation", fontWeight = FontWeight.Black); Text("Messages stay available on this device.", color = Slate600, fontSize = 11.sp) }
        }
        return
    }
    Column(modifier.background(MentorBackground)) {
        Surface(color = Color.White, shadowElevation = 1.dp) {
            Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onClose != null) IconButton(onClose) { Icon(Icons.Outlined.ArrowBack, "Back") }
                ChatAvatar(conversation.name, if (conversation.type == "group") Color(0xFF7C3AED) else PortalBlue)
                Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(conversation.name, fontWeight = FontWeight.Black, maxLines = 1); Text(if (conversation.type == "group") "${conversation.memberCount ?: 0} members" else "Staff conversation", color = Slate600, fontSize = 9.sp) }
                if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), color = PortalBlue, strokeWidth = 2.dp)
            }
        }
        LazyColumn(Modifier.weight(1f).padding(horizontal = 12.dp), contentPadding = PaddingValues(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.messages, key = { it.id }) { message ->
                val mine = message.senderId == state.workspace.currentStaffId
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Column(Modifier.widthIn(max = 440.dp), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                        if (!mine) Text(message.senderName, color = Slate600, fontSize = 8.sp, modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp))
                        Surface(color = if (mine) PortalBlue else Color.White, shape = RoundedCornerShape(16.dp), shadowElevation = if (mine) 0.dp else 1.dp) {
                            Column(Modifier.padding(horizontal = 13.dp, vertical = 9.dp)) {
                                Text(if (message.deleted) "Message deleted" else message.content ?: if (message.imageUrl != null) "Photo attachment" else "Message", color = if (mine) Color.White else Slate900, fontSize = 13.sp)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(shortChatTime(message.createdAt), color = if (mine) Color.White.copy(alpha = .72f) else Slate600, fontSize = 8.sp)
                                    message.syncStatus?.let { status -> Spacer(Modifier.width(6.dp)); Text(if (status == "pending") "Sending…" else "Failed", color = if (status == "rejected") Color(0xFFFFC7C7) else if (mine) Color.White.copy(alpha = .8f) else Slate600, fontSize = 8.sp, fontWeight = FontWeight.Bold) }
                                }
                            }
                        }
                        if (message.syncStatus == "rejected" && message.mutationId != null) {
                            Text(message.syncError ?: "Could not send", color = Color(0xFFB91C1C), fontSize = 8.sp)
                            OutlinedButton({ onDiscard(message.mutationId) }, shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 3.dp)) { Text("Remove failed message", fontSize = 8.sp) }
                        }
                    }
                }
            }
            if (state.messages.isEmpty() && !state.loading) item { EmptyWorkspaceCard("No messages yet", "Send the first message. Offline messages will wait securely on this device.", Icons.Outlined.ChatBubbleOutline) }
        }
        Surface(color = Color.White, shadowElevation = 4.dp) {
            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(messageText, { if (it.length <= 4000) messageText = it }, Modifier.weight(1f), placeholder = { Text("Message") }, minLines = 1, maxLines = 4, shape = RoundedCornerShape(18.dp))
                Button(
                    { val text = messageText.trim(); if (text.isNotEmpty()) { onSend(text); messageText = "" } },
                    Modifier.height(54.dp), enabled = messageText.isNotBlank() && !state.sending,
                    colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(17.dp),
                ) { Text(if (state.sending) "…" else "Send", fontWeight = FontWeight.Black) }
            }
        }
    }
}

@Composable
private fun ChatAvatar(name: String, color: Color) {
    Box(Modifier.size(42.dp).clip(CircleShape).background(color.copy(alpha = .13f)), contentAlignment = Alignment.Center) { Text(name.take(2).uppercase(), color = color, fontSize = 11.sp, fontWeight = FontWeight.Black) }
}

private fun shortChatTime(value: String): String = runCatching {
    val dateTime = Instant.parse(value).atZone(ZoneId.systemDefault())
    if (dateTime.toLocalDate() == LocalDate.now()) dateTime.format(DateTimeFormatter.ofPattern("h:mm a")) else dateTime.format(DateTimeFormatter.ofPattern("dd MMM"))
}.getOrElse { value.take(16) }

@Composable
private fun FinanceWorkspace(
    state: FinanceUiState,
    padding: PaddingValues,
    onLoad: (String) -> Unit,
    onOpenAccount: (FinanceStudentBalance) -> Unit,
    onCloseAccount: () -> Unit,
    onAddCharge: (FinanceChargeInput) -> Unit,
    onRecordPayment: (FinancePaymentInput) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    var month by remember { mutableStateOf(YearMonth.now().toString()) }
    var section by remember { mutableStateOf("Overview") }
    var search by remember { mutableStateOf("") }
    var action by remember { mutableStateOf<String?>(null) }
    var actionStudentId by remember { mutableStateOf("") }
    LaunchedEffect(month) { onLoad(month) }
    LaunchedEffect(state.notice) { if (state.notice != null) action = null }
    BackHandler(action != null || state.account != null || onBack != null) {
        when { action != null -> action = null; state.account != null -> onCloseAccount(); onBack != null -> onBack() }
    }

    val workspace = state.workspace
    Box(Modifier.fillMaxSize().background(MentorBackground).padding(padding)) {
        when {
            action != null && workspace != null -> FinanceActionWorkspace(
                action = checkNotNull(action), state = state, studentId = actionStudentId,
                onStudentId = { id -> actionStudentId = id; workspace.students.firstOrNull { it.id == id }?.let(onOpenAccount) },
                onBack = { action = null }, onAddCharge = onAddCharge, onRecordPayment = onRecordPayment,
            )
            state.account != null -> FinanceAccountWorkspace(
                state = state, onBack = onCloseAccount,
                onCharge = { actionStudentId = state.account.student.id; action = "charge" },
                onPayment = { actionStudentId = state.account.student.id; action = "payment" },
            )
            workspace == null -> Column(
                Modifier.fillMaxSize().widthIn(max = 760.dp).align(Alignment.TopCenter).padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (onBack != null) Row(Modifier.fillMaxWidth()) { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") } }
                Spacer(Modifier.height(70.dp)); Icon(Icons.Outlined.Payments, null, Modifier.size(54.dp), tint = if (state.error == null) PortalBlue else Color(0xFFD97706)); Spacer(Modifier.height(14.dp))
                Text(if (state.error == null) "Loading student finance" else "Finance access is unavailable", fontSize = 22.sp, fontWeight = FontWeight.Black)
                Text(state.error ?: "Checking your current authorization and saved data.", color = Slate600, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                if (state.loading) { Spacer(Modifier.height(20.dp)); CircularProgressIndicator(color = PortalBlue) }
            }
            else -> LazyColumn(
                Modifier.fillMaxSize().widthIn(max = 1180.dp).align(Alignment.TopCenter),
                contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (onBack != null) IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
                        Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFFDCFCE7)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Payments, null, tint = Color(0xFF047857)) }
                        Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text("Student finance", fontSize = 22.sp, fontWeight = FontWeight.Black); Text("Authorized actions and student accounts", color = Slate600, fontSize = 10.sp) }
                        IconButton({ onLoad(month) }, enabled = !state.loading) { Icon(Icons.Outlined.Sync, "Refresh", tint = PortalBlue) }
                    }
                }
                if (workspace.cached || !state.online) item { StatusNotice("Offline · viewing saved finance data. Charges and payments stay disabled until the connection is verified.") }
                state.error?.let { item { ErrorNotice(it) } }
                state.notice?.let { item { Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(14.dp)) { Text(it, Modifier.fillMaxWidth().padding(14.dp), color = Color(0xFF047857), fontWeight = FontWeight.Bold) } } }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton({ month = YearMonth.parse(month).minusMonths(1).toString() }) { Text("‹") }
                                Surface(Modifier.weight(1f), color = Color(0xFFF8FAFC), shape = RoundedCornerShape(13.dp)) { Text(YearMonth.parse(month).format(DateTimeFormatter.ofPattern("MMMM yyyy")), Modifier.padding(12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontWeight = FontWeight.Black) }
                                OutlinedButton({ month = YearMonth.parse(month).plusMonths(1).toString() }) { Text("›") }
                            }
                            Spacer(Modifier.height(10.dp)); OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), placeholder = { Text("Search student name or admission number") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp))
                            Spacer(Modifier.height(10.dp)); Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                listOf("Overview", "Dues", "Activity").forEach { value ->
                                    FinancePill(value, section == value, Modifier.weight(1f)) { section = value }
                                }
                            }
                        }
                    }
                }
                when (section) {
                    "Overview" -> {
                        item {
                            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)), shape = RoundedCornerShape(18.dp)) {
                                Column(Modifier.padding(17.dp)) {
                                    Text("YOUR AUTHORIZED ACTIONS", color = PortalBlue, fontSize = 9.sp, fontWeight = FontWeight.Black)
                                    Text("Record finance items without viewing institution totals", color = Color(0xFF172554), fontSize = 18.sp, fontWeight = FontWeight.Black)
                                    Text("Only approved categories and assigned students are available. Every operation is audited and confirmed by the server.", color = Color(0xFF1E40AF), fontSize = 11.sp)
                                    Spacer(Modifier.height(13.dp)); Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                        if (workspace.capabilities.canAddCharge) Button({ actionStudentId = workspace.students.firstOrNull()?.id.orEmpty(); action = "charge" }, enabled = state.online && workspace.students.isNotEmpty(), colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(13.dp)) { Text("+ Add charge") }
                                        if (workspace.capabilities.canCollectPayment) Button({ actionStudentId = workspace.students.firstOrNull()?.id.orEmpty(); action = "payment" }, enabled = state.online && workspace.students.isNotEmpty(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)), shape = RoundedCornerShape(13.dp)) { Text("Collect payment") }
                                    }
                                }
                            }
                        }
                        item { Text("Your recent finance work", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                        if (workspace.recentActivity.isEmpty()) item { EmptyWorkspaceCard("No recent activity", "Permitted charges and payments will appear here.", Icons.Outlined.Assessment) }
                        items(workspace.recentActivity, key = { it.id }) { FinanceActivityCard(it) }
                    }
                    "Dues" -> {
                        val shown = workspace.students.filter { search.isBlank() || it.name.contains(search, true) || it.id.contains(search, true) }
                        item { Text("Student dues", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                        items(shown, key = { it.id }) { student -> FinanceStudentCard(student) { onOpenAccount(student) } }
                        if (shown.isEmpty()) item { EmptyWorkspaceCard("No matching students", "Try a different search.", Icons.Outlined.People) }
                    }
                    else -> {
                        val activity = workspace.recentActivity.filter { search.isBlank() || it.studentName.contains(search, true) || it.description.contains(search, true) }
                        item { Text("Recent activity", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                        items(activity, key = { it.id }) { FinanceActivityCard(it) }
                        if (activity.isEmpty()) item { EmptyWorkspaceCard("No matching activity", "Try a different search.", Icons.Outlined.Assessment) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FinancePill(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(modifier.clip(RoundedCornerShape(11.dp)).clickable(onClick = onClick), color = if (selected) PortalBlue else Color(0xFFF1F5F9), shape = RoundedCornerShape(11.dp)) {
        Text(label, Modifier.padding(vertical = 10.dp), color = if (selected) Color.White else Slate600, textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontSize = 10.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun FinanceStudentCard(student: FinanceStudentBalance, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(17.dp)) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            ChatAvatar(student.name, if (student.overdue > 0) Color(0xFFDC2626) else Color(0xFF059669)); Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) { Text(student.name, fontWeight = FontWeight.Black); Text("${student.id} · ${student.standard}${student.division?.let { " · $it" }.orEmpty()}", color = Slate600, fontSize = 10.sp); Text("Overdue ${moneyText(student.overdue)}", color = if (student.overdue > 0) Color(0xFFDC2626) else Slate600, fontSize = 9.sp) }
            Column(horizontalAlignment = Alignment.End) { Text(moneyText(student.totalDue), fontWeight = FontWeight.Black, color = if (student.totalDue > 0) Color(0xFFB45309) else Color(0xFF047857)); Text("Total due", color = Slate600, fontSize = 8.sp) }; Spacer(Modifier.width(6.dp)); Icon(Icons.Outlined.ChevronRight, null, tint = PortalBlue)
        }
    }
}

@Composable
private fun FinanceActivityCard(item: `in`.ribath.mentor.data.FinanceActivity) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(if (item.type.contains("payment")) Color(0xFFDCFCE7) else Color(0xFFFFF7ED)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Payments, null, tint = if (item.type.contains("payment")) Color(0xFF059669) else Color(0xFFD97706)) }
            Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(item.studentName, fontWeight = FontWeight.Black); Text(item.description, color = Slate600, fontSize = 10.sp, maxLines = 1); Text(listOfNotNull(item.createdAt?.let(::prettyDateTime), item.recordedBy).joinToString(" · "), color = Color(0xFF94A3B8), fontSize = 8.sp) }
            Text(moneyText(item.amount), fontWeight = FontWeight.Black, color = if (item.type.contains("payment")) Color(0xFF059669) else Slate900)
        }
    }
}

@Composable
private fun FinanceAccountWorkspace(state: FinanceUiState, onBack: () -> Unit, onCharge: () -> Unit, onPayment: () -> Unit) {
    val account = checkNotNull(state.account)
    var tab by remember(account.student.id) { mutableStateOf("Dues") }
    LazyColumn(Modifier.fillMaxSize().widthIn(max = 900.dp), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Row(verticalAlignment = Alignment.CenterVertically) { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }; ChatAvatar(account.student.name, PortalBlue); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(account.student.name, fontWeight = FontWeight.Black, fontSize = 19.sp); Text("${account.student.id} · ${account.student.standard}", color = Slate600, fontSize = 10.sp) }; if (state.loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) } }
        if (account.cached) item { StatusNotice("Offline · this student account is saved on this device.") }
        state.error?.let { item { ErrorNotice(it) } }; state.notice?.let { item { Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(14.dp)) { Text(it, Modifier.fillMaxWidth().padding(13.dp), color = Color(0xFF047857), fontWeight = FontWeight.Bold) } } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                FinanceMetric("Total due", moneyText(account.totalDue), Color(0xFFD97706), Modifier.weight(1f)); FinanceMetric("Overdue", moneyText(account.overdue), Color(0xFFDC2626), Modifier.weight(1f)); FinanceMetric("Credit", moneyText(account.creditBalance), Color(0xFF059669), Modifier.weight(1f))
            }
        }
        if (state.workspace?.capabilities?.let { it.canAddCharge || it.canCollectPayment } == true) item {
            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                if (state.workspace.capabilities.canAddCharge) Button(onCharge, Modifier.weight(1f), enabled = state.online && !state.saving, colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(13.dp)) { Text("Add charge") }
                if (state.workspace.capabilities.canCollectPayment) Button(onPayment, Modifier.weight(1f), enabled = state.online && account.openItems.isNotEmpty() && !state.saving, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)), shape = RoundedCornerShape(13.dp)) { Text("Collect payment") }
            }
        }
        item { Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { listOf("Dues", "Payments", "Fee rule").forEach { FinancePill(it, tab == it, Modifier.weight(1f)) { tab = it } } } }
        when (tab) {
            "Dues" -> if (account.openItems.isEmpty()) item { EmptyWorkspaceCard("Nothing pending", "This student has no open fee or charge items.", Icons.Outlined.Payments) } else items(account.openItems, key = { it.id }) { item ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(14.dp)) { Row { Column(Modifier.weight(1f)) { Text(item.description, fontWeight = FontWeight.Black); Text(item.categoryName ?: item.type.replace('_', ' '), color = Slate600, fontSize = 9.sp) }; Text(moneyText(item.balance), color = Color(0xFFB45309), fontWeight = FontWeight.Black) }; Spacer(Modifier.height(8.dp)); Text("Paid ${moneyText(item.paidAmount)} of ${moneyText(item.amount)} · Due ${item.dueDate ?: item.month ?: "—"}", color = Slate600, fontSize = 9.sp) } }
            }
            "Payments" -> if (account.payments.isEmpty()) item { EmptyWorkspaceCard("No payments yet", "Recorded payments will appear here.", Icons.Outlined.Payments) } else items(account.payments, key = { it.id }) { payment ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(14.dp)) { Row { Column(Modifier.weight(1f)) { Text(payment.method.replace('_', ' ').uppercase(), fontWeight = FontWeight.Black); Text(payment.date ?: payment.createdAt ?: "", color = Slate600, fontSize = 9.sp) }; Text(moneyText(payment.amount), color = if (payment.status == "reversed") Color(0xFFDC2626) else Color(0xFF059669), fontWeight = FontWeight.Black) }; payment.receiptNumber?.let { Text("Receipt / reference: $it", color = Slate600, fontSize = 9.sp) }; if (payment.allocations.isNotEmpty()) Text("Allocated to ${payment.allocations.size} due item(s)", color = Slate600, fontSize = 9.sp) } }
            }
            else -> item {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(18.dp)) { Text("ACTIVE MONTHLY FEE", color = PortalBlue, fontSize = 9.sp, fontWeight = FontWeight.Black); Text(account.activeFeeAmount?.let(::moneyText) ?: "No active fee rule", fontSize = 25.sp, fontWeight = FontWeight.Black, color = Color(0xFF172554)); account.activeFeeLabel?.let { Text(it, color = Color(0xFF1E40AF), fontWeight = FontWeight.Bold) }; account.activeFeeFrom?.let { Text("Effective from $it", color = Slate600, fontSize = 10.sp) }; Text("Published monthly dues remain unchanged when a future fee revision is added.", Modifier.padding(top = 12.dp), color = Slate600, fontSize = 10.sp) } }
            }
        }
    }
}

@Composable
private fun FinanceMetric(label: String, value: String, accent: Color, modifier: Modifier) {
    Card(modifier.height(92.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) { Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.SpaceBetween) { Box(Modifier.size(8.dp).clip(CircleShape).background(accent)); Text(value, fontWeight = FontWeight.Black, fontSize = 16.sp, maxLines = 1); Text(label, color = Slate600, fontSize = 8.sp) } }
}

@Composable
private fun FinanceActionWorkspace(
    action: String,
    state: FinanceUiState,
    studentId: String,
    onStudentId: (String) -> Unit,
    onBack: () -> Unit,
    onAddCharge: (FinanceChargeInput) -> Unit,
    onRecordPayment: (FinancePaymentInput) -> Unit,
) {
    val workspace = checkNotNull(state.workspace)
    val isCharge = action == "charge"
    var categoryId by remember(action) { mutableStateOf(workspace.categories.firstOrNull()?.id.orEmpty()) }
    var amount by remember(action, studentId) { mutableStateOf("") }
    var date by remember(action, studentId) { mutableStateOf(LocalDate.now().toString()) }
    var description by remember(action, studentId) { mutableStateOf("") }
    var method by remember(action, studentId) { mutableStateOf("cash") }
    var paymentAccountId by remember(action, studentId) { mutableStateOf("") }
    var idempotencyKey by remember(action, studentId) { mutableStateOf(UUID.randomUUID().toString()) }
    val account = state.account?.takeIf { it.student.id == studentId }
    LaunchedEffect(studentId, action) {
        if (studentId.isNotBlank() && account == null) workspace.students.firstOrNull { it.id == studentId }?.let { onStudentId(it.id) }
    }
    val numericAmount = amount.toDoubleOrNull()?.takeIf { it > 0 } ?: 0.0
    val allocations = remember(account?.openItems, numericAmount) {
        var remaining = numericAmount
        buildList {
            account?.openItems?.forEach { item ->
                val applied = minOf(item.balance, remaining).coerceAtLeast(0.0)
                if (applied > 0.0001) add(FinancePaymentAllocation(item.id, item.description, applied))
                remaining -= applied
            }
        }
    }
    val allocated = allocations.sumOf { it.amount }
    LazyColumn(Modifier.fillMaxSize().widthIn(max = 760.dp), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Row(verticalAlignment = Alignment.CenterVertically) { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }; Column(Modifier.weight(1f)) { Text(if (isCharge) "Add student charge" else "Collect payment", fontSize = 22.sp, fontWeight = FontWeight.Black); Text(if (isCharge) "Creates a new audited ledger item" else "Server-verified allocation to outstanding dues", color = Slate600, fontSize = 10.sp) }; if (state.saving || state.loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) } }
        state.error?.let { item { ErrorNotice(it) } }
        if (!state.online) item { ErrorNotice("Connect to the internet. Finance changes are never stored as offline drafts.") }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(15.dp)) {
                Text("Student", fontWeight = FontWeight.Black); Spacer(Modifier.height(8.dp))
                workspace.students.forEach { student ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onStudentId(student.id) }.background(if (student.id == studentId) Color(0xFFEFF6FF) else Color.Transparent).padding(11.dp), verticalAlignment = Alignment.CenterVertically) { Text(student.name, Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 11.sp); Text("${student.id} · ${student.standard}", color = Slate600, fontSize = 9.sp) }
                }
            } }
        }
        if (isCharge) item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                Text("Charge category", fontWeight = FontWeight.Black); Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { workspace.categories.filter { it.active }.take(4).forEach { category -> FinancePill(category.name, categoryId == category.id, Modifier.weight(1f)) { categoryId = category.id } } }
                OutlinedTextField(amount, { amount = it.filter { character -> character.isDigit() || character == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount") }, prefix = { Text("₹") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, shape = RoundedCornerShape(14.dp))
                OutlinedTextField(date, { date = it }, Modifier.fillMaxWidth(), label = { Text("Charge date (YYYY-MM-DD)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                OutlinedTextField(description, { if (it.length <= 500) description = it }, Modifier.fillMaxWidth(), label = { Text("Description / notes") }, minLines = 2, maxLines = 4, shape = RoundedCornerShape(14.dp))
                Text("This adds a new item; existing dues and payments are not changed.", color = Color(0xFF1E40AF), fontSize = 10.sp)
                Button({ onAddCharge(FinanceChargeInput(studentId, categoryId, String.format(Locale.US, "%.2f", numericAmount), date, description.trim().ifBlank { null }, idempotencyKey)) }, Modifier.fillMaxWidth().height(50.dp), enabled = state.online && !state.saving && studentId.isNotBlank() && categoryId.isNotBlank() && numericAmount > 0 && runCatching { LocalDate.parse(date) }.isSuccess, colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(14.dp)) { Text(if (state.saving) "Recording…" else "Add charge", fontWeight = FontWeight.Black) }
            } }
        } else item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                OutlinedTextField(amount, { amount = it.filter { character -> character.isDigit() || character == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount received") }, prefix = { Text("₹") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, shape = RoundedCornerShape(14.dp))
                OutlinedTextField(date, { date = it }, Modifier.fillMaxWidth(), label = { Text("Payment date (YYYY-MM-DD)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                Text("Payment method", fontWeight = FontWeight.Black); Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { listOf("cash", "upi", "bank").forEach { value -> FinancePill(value.uppercase(), method == value, Modifier.weight(1f)) { method = value; paymentAccountId = "" } } }
                if (method != "cash") { Text("Receiving account", fontWeight = FontWeight.Black); workspace.accounts.filter { it.active && it.type == method }.forEach { accountOption -> FinancePill(accountOption.name, paymentAccountId == accountOption.id, Modifier.fillMaxWidth()) { paymentAccountId = accountOption.id } } }
                OutlinedTextField(description, { if (it.length <= 1000) description = it }, Modifier.fillMaxWidth(), label = { Text("Reference / notes (optional)") }, minLines = 2, maxLines = 4, shape = RoundedCornerShape(14.dp))
                Surface(color = if (numericAmount > 0 && kotlin.math.abs(allocated - numericAmount) < .005) Color(0xFFECFDF5) else Color(0xFFFFF7ED), shape = RoundedCornerShape(14.dp)) { Column(Modifier.padding(13.dp)) { Text("Payment allocation", fontWeight = FontWeight.Black); Text("${moneyText(allocated)} of ${moneyText(numericAmount)} allocated oldest-first", color = Slate600, fontSize = 10.sp); allocations.forEach { Text("${it.description ?: "Due item"}: ${moneyText(it.amount)}", color = Slate600, fontSize = 9.sp) } } }
                Button({ onRecordPayment(FinancePaymentInput(studentId, String.format(Locale.US, "%.2f", numericAmount), method, paymentAccountId.ifBlank { null }, description.trim().ifBlank { null }, date, description.trim().ifBlank { null }, allocations, idempotencyKey)) }, Modifier.fillMaxWidth().height(50.dp), enabled = state.online && !state.saving && studentId.isNotBlank() && numericAmount > 0 && kotlin.math.abs(allocated - numericAmount) < .005 && runCatching { LocalDate.parse(date) }.isSuccess && (method == "cash" || paymentAccountId.isNotBlank()), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)), shape = RoundedCornerShape(14.dp)) { Text(if (state.saving) "Recording…" else "Record payment", fontWeight = FontWeight.Black) }
            } }
        }
    }
}

private fun moneyText(value: Double): String = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(value)

@Composable
private fun ReportsWorkspace(
    snapshot: HomeSnapshot,
    state: ReportsUiState,
    padding: PaddingValues,
    onGenerate: (String, String, String, String) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    var selectedStudentId by remember(snapshot.students) { mutableStateOf(snapshot.students.firstOrNull()?.id.orEmpty()) }
    var studentSearch by remember { mutableStateOf("") }
    var choosingStudent by remember { mutableStateOf(false) }
    var reportType by remember { mutableStateOf("Monthly") }
    var periodOffset by remember { mutableStateOf(1) }
    var customStart by remember { mutableStateOf(LocalDate.now().minusDays(30).toString()) }
    var customEnd by remember { mutableStateOf(LocalDate.now().toString()) }
    val selectedStudent = snapshot.students.firstOrNull { it.id == selectedStudentId }
    val range = reportDateRange(reportType, periodOffset, customStart, customEnd)
    val context = LocalContext.current

    LazyColumn(
        Modifier.fillMaxSize().background(MentorBackground).padding(padding),
        contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            if (onBack != null) IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
            Text("Progress Reports", fontSize = 25.sp, fontWeight = FontWeight.Black)
            Text("Exact report calculations from the institution report engine, saved for offline viewing.", color = Slate600, fontSize = 12.sp)
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Generate report", fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Surface(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { choosingStudent = !choosingStudent },
                        color = Color(0xFFF8FAFC), shape = RoundedCornerShape(14.dp),
                    ) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Person, null, tint = PortalBlue); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) { Text(selectedStudent?.name ?: "Select student", fontWeight = FontWeight.Bold); selectedStudent?.let { Text("${it.id} · ${it.standard}", color = Slate600, fontSize = 10.sp) } }
                            Icon(Icons.Outlined.ChevronRight, null, tint = Slate600)
                        }
                    }
                    if (choosingStudent) {
                        OutlinedTextField(studentSearch, { studentSearch = it }, Modifier.fillMaxWidth(), placeholder = { Text("Search name or ID") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp))
                        snapshot.students.filter { studentSearch.isBlank() || it.name.contains(studentSearch, true) || it.id.contains(studentSearch, true) }.take(12).forEach { student ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { selectedStudentId = student.id; choosingStudent = false }.padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(34.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Text(student.name.take(2).uppercase(), color = PortalBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                                Spacer(Modifier.width(9.dp)); Text(student.name, Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 12.sp); Text(student.id, color = Slate600, fontSize = 10.sp)
                            }
                        }
                    }
                    Text("Report type", color = Slate600, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Weekly", "Monthly", "Yearly", "Custom").forEach { type ->
                            Surface(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { reportType = type; periodOffset = if (type == "Monthly") 1 else 0 }, color = if (reportType == type) Color(0xFFDBEAFE) else Color(0xFFF1F5F9), shape = RoundedCornerShape(12.dp)) {
                                Text(type, Modifier.padding(vertical = 10.dp), color = if (reportType == type) PortalBlue else Slate600, fontSize = 9.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            }
                        }
                    }
                    if (reportType == "Custom") {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(customStart, { customStart = it.take(10) }, Modifier.weight(1f), label = { Text("Start") }, singleLine = true, shape = RoundedCornerShape(13.dp))
                            OutlinedTextField(customEnd, { customEnd = it.take(10) }, Modifier.weight(1f), label = { Text("End") }, singleLine = true, shape = RoundedCornerShape(13.dp))
                        }
                    } else {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton({ periodOffset += 1 }, shape = CircleShape, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(44.dp)) { Text("‹", fontSize = 22.sp) }
                            Surface(Modifier.weight(1f), color = Color(0xFFF8FAFC), shape = RoundedCornerShape(14.dp)) { Text(range?.let { "${formatReportDate(it.first)} — ${formatReportDate(it.second)}" } ?: "Invalid range", Modifier.padding(13.dp), fontWeight = FontWeight.Bold, fontSize = 11.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                            OutlinedButton({ if (periodOffset > 0) periodOffset -= 1 }, enabled = periodOffset > 0, shape = CircleShape, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(44.dp)) { Text("›", fontSize = 22.sp) }
                        }
                    }
                    state.error?.let { ErrorNotice(it) }
                    Button(
                        { if (selectedStudentId.isNotBlank() && range != null) onGenerate(selectedStudentId, reportType, range.first.toString(), range.second.toString()) },
                        Modifier.fillMaxWidth().height(50.dp), enabled = selectedStudentId.isNotBlank() && range != null && !state.loading,
                        colors = ButtonDefaults.buttonColors(containerColor = PortalBlue), shape = RoundedCornerShape(14.dp),
                    ) { if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else { Icon(Icons.Outlined.Assessment, null); Spacer(Modifier.width(7.dp)); Text("Generate report", fontWeight = FontWeight.Black) } }
                }
            }
        }
        state.report?.let { report ->
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(48.dp).clip(CircleShape).background(Color(0xFFDBEAFE)), contentAlignment = Alignment.Center) { Text(report.student.name.take(2).uppercase(), color = PortalBlue, fontWeight = FontWeight.Black) }
                            Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text("Student Progress Report", color = PortalBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(report.student.name, fontSize = 18.sp, fontWeight = FontWeight.Black); Text("${report.student.id} · ${report.student.standard} · ${report.reportType}", color = Slate600, fontSize = 10.sp) }
                            if (report.cached) Surface(color = Color(0xFFFFF7ED), shape = RoundedCornerShape(10.dp)) { Text("OFFLINE", Modifier.padding(horizontal = 8.dp, vertical = 5.dp), color = Color(0xFFB45309), fontSize = 8.sp, fontWeight = FontWeight.Black) }
                        }
                        Text("${formatReportDate(LocalDate.parse(report.startDate))} — ${formatReportDate(LocalDate.parse(report.endDate))}", color = Slate600, fontSize = 11.sp)
                        report.student.mentorName?.let { Text("Mentor: $it", color = Slate600, fontSize = 10.sp) }
                        OutlinedButton({ shareProgressReport(context, report) }, Modifier.fillMaxWidth(), shape = RoundedCornerShape(13.dp)) { Icon(Icons.Outlined.ChatBubbleOutline, null); Spacer(Modifier.width(7.dp)); Text("Share report", fontWeight = FontWeight.Bold) }
                    }
                }
            }
            report.attendance?.let { attendance ->
                item { Text("Session Attendance", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ReportMetric("${attendance.attended}", "Attended", Color(0xFF059669), Modifier.weight(1f))
                        ReportMetric("${attendance.notAttended}", "Not attended", Color(0xFFDC2626), Modifier.weight(1f))
                        ReportMetric("${attendance.cancelled}", "Cancelled", Slate600, Modifier.weight(1f))
                    }
                }
            }
            report.performance?.let { performance ->
                item { Text("Performance & Grade", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                item {
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                ReportMetric(formatReportNumber(performance.newVersePoints), "New verses /20", PortalBlue, Modifier.weight(1f))
                                ReportMetric(formatReportNumber(performance.recentRevisionPoints), "Revision /15", Color(0xFFF97316), Modifier.weight(1f))
                                ReportMetric(formatReportNumber(performance.juzPoints), "Juz /${formatReportNumber(performance.juzMax)}", Color(0xFF7C3AED), Modifier.weight(1f))
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) { Text("${formatReportNumber(performance.totalPoints)} / ${formatReportNumber(performance.totalMax)}", fontSize = 24.sp, fontWeight = FontWeight.Black); Text("${formatReportNumber(performance.percentage)}% · ${formatReportNumber(performance.pointDays)} point days", color = Slate600, fontSize = 10.sp) }
                                Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(16.dp)) { Text(performance.grade, Modifier.padding(horizontal = 18.dp, vertical = 12.dp), color = Color(0xFF047857), fontSize = 20.sp, fontWeight = FontWeight.Black) }
                            }
                        }
                    }
                }
            }
            item { Text("Hifz Activity", fontSize = 18.sp, fontWeight = FontWeight.Black) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (report.hifzStage == "HAFIZ_REVISION") {
                        ReportMetric(formatReportNumber(report.activity.newJuzRevision), "New revision", PortalBlue, Modifier.weight(1f))
                        ReportMetric(formatReportNumber(report.activity.oldJuzRevision), "Old revision", Color(0xFFF97316), Modifier.weight(1f))
                    } else {
                        ReportMetric(formatReportNumber(report.activity.newPages), "New pages", PortalBlue, Modifier.weight(1f))
                        ReportMetric("${report.activity.revisionDays}", "Revision days", Color(0xFFF97316), Modifier.weight(1f))
                    }
                    ReportMetric(formatReportNumber(report.activity.juzRevised), "Juz revised", Color(0xFF059669), Modifier.weight(1f))
                }
            }
            if (report.logs.isNotEmpty()) {
                item { Text("Daily Hifz records", fontSize = 18.sp, fontWeight = FontWeight.Black) }
                items(report.logs, key = { it.id }) { log ->
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(15.dp)) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFEFF6FF), shape = RoundedCornerShape(10.dp)) { Text(log.date.takeLast(5), Modifier.padding(8.dp), color = PortalBlue, fontWeight = FontWeight.Black, fontSize = 10.sp) }
                            Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(log.mode, fontWeight = FontWeight.Bold, fontSize = 12.sp); Text(listOfNotNull(log.surahName, if (log.startVerse != null && log.endVerse != null) "${log.startVerse}–${log.endVerse}" else null).joinToString(" · "), color = Slate600, fontSize = 10.sp) }
                        }
                    }
                }
            } else item { EmptyWorkspaceCard("No Hifz records", "No Hifz entries were recorded in this report period.", Icons.Outlined.Assessment) }
        }
    }
}

@Composable
private fun ReportMetric(value: String, label: String, accent: Color, modifier: Modifier) {
    Card(modifier.height(92.dp), colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = .07f)), shape = RoundedCornerShape(15.dp)) {
        Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.SpaceBetween) { Box(Modifier.size(7.dp).clip(CircleShape).background(accent)); Text(value, fontSize = 19.sp, fontWeight = FontWeight.Black, color = Slate900); Text(label, color = Slate600, fontSize = 8.sp, fontWeight = FontWeight.Bold) }
    }
}

private fun reportDateRange(type: String, offset: Int, customStart: String, customEnd: String): Pair<LocalDate, LocalDate>? = runCatching {
    when (type) {
        "Weekly" -> LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(offset.toLong()).let { it to it.plusDays(6) }
        "Yearly" -> LocalDate.of(LocalDate.now().year - offset, 1, 1).let { it to it.withMonth(12).withDayOfMonth(31) }
        "Custom" -> LocalDate.parse(customStart) to LocalDate.parse(customEnd)
        else -> YearMonth.now().minusMonths(offset.toLong()).let { it.atDay(1) to it.atEndOfMonth() }
    }
}.getOrNull()?.takeIf { !it.second.isBefore(it.first) }

private fun formatReportDate(date: LocalDate): String = date.format(DateTimeFormatter.ofPattern("dd MMM yyyy"))
private fun formatReportNumber(value: Double): String = if (value.isNaN() || value.isInfinite()) "0" else if (value % 1.0 == 0.0) value.toInt().toString() else "%.2f".format(value).trimEnd('0').trimEnd('.')

private fun shareProgressReport(context: Context, report: `in`.ribath.mentor.data.StudentProgressReport) {
    val attendance = report.attendance
    val performance = report.performance
    val message = buildString {
        appendLine("Assalamu Alaikum,")
        appendLine("${report.student.name}'s ${report.reportType.lowercase()} Hifz report (${report.startDate} to ${report.endDate}):")
        if (report.hifzStage == "HAFIZ_REVISION") {
            appendLine("New Revision: ${formatReportNumber(report.activity.newJuzRevision)} Juz")
            appendLine("Old Revision: ${formatReportNumber(report.activity.oldJuzRevision)} Juz")
        } else {
            appendLine("New Hifz: ${formatReportNumber(report.activity.newPages)} pages")
            appendLine("Recent Revision: ${report.activity.revisionDays} days")
            appendLine("Juz Revision: ${formatReportNumber(report.activity.juzRevised)} Juz")
        }
        if (attendance != null) appendLine("Attendance: ${attendance.attended}/${attendance.effective} sessions")
        append("Grade: ${performance?.grade ?: "NO GRADE"}")
    }
    val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_SUBJECT, "${report.student.name} progress report"); putExtra(Intent.EXTRA_TEXT, message) }
    context.startActivity(Intent.createChooser(intent, "Share progress report"))
}

@Composable
private fun MentorMore(padding: PaddingValues, onOpen: (PortalDestination) -> Unit) {
    val modules = mentorMoreDestinations()
    LazyColumn(Modifier.fillMaxSize().background(MentorBackground).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("More", fontSize = 24.sp, fontWeight = FontWeight.Black); Text("All mentor tools", color = Slate600) }
        items(modules.chunked(2)) { row -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { row.forEach { QuickModule(it, Modifier.weight(1f), PortalBlue) { onOpen(it) } }; if (row.size == 1) Spacer(Modifier.weight(1f)) } }
    }
}

private fun mentorMoreDestinations() = listOf(
    PortalDestination("Reports", Icons.Outlined.Assessment), PortalDestination("Assigned", Icons.Outlined.People),
    PortalDestination("Finance", Icons.Outlined.Payments), PortalDestination("Calendar", Icons.Outlined.Today),
    PortalDestination("Profile", Icons.Outlined.Person), PortalDestination("Settings", Icons.Outlined.Settings),
)

@Composable
private fun QuickModule(item: PortalDestination, modifier: Modifier, accent: Color, onClick: () -> Unit) {
    Card(modifier.height(104.dp).clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.SpaceBetween) { Box(Modifier.size(38.dp).clip(CircleShape).background(accent.copy(alpha = .1f)), contentAlignment = Alignment.Center) { Icon(item.icon, null, tint = accent) }; Text(item.label, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun ModuleLanding(title: String, subtitle: String, icon: ImageVector, padding: PaddingValues, accent: Color, onSync: () -> Unit, onBack: (() -> Unit)? = null) {
    LazyColumn(Modifier.fillMaxSize().background(MentorBackground).padding(padding), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
      item {
        if (onBack != null) { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") } }
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(accent.copy(alpha = .12f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = accent, modifier = Modifier.size(28.dp)) }
        Spacer(Modifier.height(16.dp)); Text(title, fontSize = 26.sp, fontWeight = FontWeight.Black); Text(subtitle, color = Slate600); Spacer(Modifier.height(24.dp))
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(46.dp).clip(CircleShape).background(accent.copy(alpha = .1f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = accent) }
                Spacer(Modifier.height(12.dp)); Text("No ${title.lowercase()} records", fontWeight = FontWeight.Black)
                Text("Sync to check for the latest authorized records.", color = Slate600, fontSize = 11.sp)
                Spacer(Modifier.height(14.dp)); Button(onSync, colors = ButtonDefaults.buttonColors(containerColor = accent), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Outlined.Sync, null); Spacer(Modifier.width(8.dp)); Text("Sync now") }
            }
        }
      }
    }
}

@Composable
private fun BannerStat(value: String, label: String, modifier: Modifier) { Column(modifier.clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .14f)).padding(10.dp)) { Text(value, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black); Text(label, color = Color(0xFFDBEAFE), fontSize = 10.sp) } }

@Composable
private fun MetricCard(label: String, value: String, detail: String, accent: Color, modifier: Modifier) { Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(15.dp)) { Box(Modifier.size(8.dp).clip(CircleShape).background(accent)); Spacer(Modifier.height(12.dp)); Text(value, fontSize = 24.sp, fontWeight = FontWeight.Black); Text(label, fontWeight = FontWeight.Bold, fontSize = 12.sp); Text(detail, color = Slate600, fontSize = 10.sp) } } }

@Composable
private fun StatusNotice(message: String) { Surface(color = Color(0xFFEFF6FF), shape = RoundedCornerShape(14.dp)) { Text(message, Modifier.padding(14.dp), color = Color(0xFF1E40AF), fontSize = 12.sp) } }

@Composable
private fun HifzEntryScreen(student: StudentSummary, snapshot: HomeSnapshot, onBack: () -> Unit, onSave: (String, String, String, Int, Int, String?) -> Unit) {
    var date by remember { mutableStateOf(LocalDate.now().toString()) }; var mode by remember { mutableStateOf("New Verses") }; var surah by remember { mutableStateOf("") }; var start by remember { mutableStateOf("") }; var end by remember { mutableStateOf("") }; var notes by remember { mutableStateOf("") }
    val recent = snapshot.hifzEntries.filter { it.studentId == student.id }.take(8); val valid = surah.isNotBlank() && (start.toIntOrNull() ?: 0) > 0 && (end.toIntOrNull() ?: 0) >= (start.toIntOrNull() ?: Int.MAX_VALUE)
    LazyColumn(Modifier.fillMaxSize().background(MentorBackground), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { OutlinedButton(onBack) { Text("Back") }; Spacer(Modifier.height(10.dp)); Text(student.name, fontSize = 24.sp, fontWeight = FontWeight.Black); Text("${student.id} · ${student.standard}", color = Slate600) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Button({ mode = "New Verses" }, colors = ButtonDefaults.buttonColors(containerColor = if (mode == "New Verses") Color(0xFF16A34A) else Color(0xFFE2E8F0), contentColor = if (mode == "New Verses") Color.White else Slate900)) { Text("New Hifz") }; OutlinedButton({ mode = "Recent Revision" }) { Text("Revision") } } }
        item { OutlinedTextField(date, { date = it }, Modifier.fillMaxWidth(), label = { Text("Date (YYYY-MM-DD)") }, singleLine = true, shape = RoundedCornerShape(14.dp)) }
        item { OutlinedTextField(surah, { surah = it }, Modifier.fillMaxWidth(), label = { Text("Surah") }, singleLine = true, shape = RoundedCornerShape(14.dp)) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { OutlinedTextField(start, { start = it.filter(Char::isDigit) }, Modifier.weight(1f), label = { Text("Start verse") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, shape = RoundedCornerShape(14.dp)); OutlinedTextField(end, { end = it.filter(Char::isDigit) }, Modifier.weight(1f), label = { Text("End verse") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, shape = RoundedCornerShape(14.dp)) } }
        item { OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2, shape = RoundedCornerShape(14.dp)) }
        item { Button({ onSave(date, mode, surah.trim(), start.toInt(), end.toInt(), notes.trim().ifBlank { null }) }, Modifier.fillMaxWidth().height(50.dp), enabled = valid, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)), shape = RoundedCornerShape(14.dp)) { Text("Save entry", fontWeight = FontWeight.Bold) }; Text("Offline entries are saved securely and sent when connection returns.", color = Slate600, fontSize = 11.sp) }
        if (recent.isNotEmpty()) item { Text("Recent entries", fontSize = 19.sp, fontWeight = FontWeight.Black) }
        items(recent, key = { it.id }) { entry -> Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(14.dp)) { Text("${entry.entryDate} · ${entry.mode}", fontWeight = FontWeight.Bold, fontSize = 12.sp); Text("${entry.surahName} ${entry.startVerse}–${entry.endVerse}", color = Slate600) } } }
    }
}

@Composable
private fun ErrorScreen(message: String, hasCachedData: Boolean, onCached: () -> Unit, onSignIn: () -> Unit) {
    Column(Modifier.fillMaxSize().background(MentorBackground).padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        BrandMark(); Spacer(Modifier.height(28.dp)); Text("Couldn’t finish setup", fontSize = 24.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(8.dp)); Text(message, color = Slate600)
        if (hasCachedData) { Spacer(Modifier.height(20.dp)); Button(onCached) { Text("Use saved data") } }; Spacer(Modifier.height(12.dp)); OutlinedButton(onSignIn) { Text("Back to sign in") }
    }
}
