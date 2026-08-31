package `in`.ribath.mentor.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.ribath.mentor.data.HifzMonthRegister
import `in`.ribath.mentor.data.HifzRegisterChange
import `in`.ribath.mentor.data.HifzRegisterDay
import `in`.ribath.mentor.data.HifzRegisterEntry
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class HifzEditorTarget(
    val day: HifzRegisterDay,
    val mode: String,
    val entry: HifzRegisterEntry? = null,
)

@Composable
fun MentorStudentScreen(
    state: StudentUiState,
    onBack: () -> Unit,
    onMonth: (String) -> Unit,
    onSave: (
        date: String,
        sessionId: String?,
        mode: String,
        creates: List<HifzRegisterChange>,
        updates: List<HifzRegisterChange>,
        deleteIds: List<String>,
        expectedVersions: Map<String, Long>,
    ) -> Unit,
    onDiscardConflict: () -> Unit,
) {
    BackHandler(onBack = onBack)
    var tab by remember { mutableStateOf("register") }
    var editor by remember { mutableStateOf<HifzEditorTarget?>(null) }
    val title = state.profile?.name ?: state.summary?.name ?: "Student"

    Scaffold(
        containerColor = MentorBackground,
        topBar = {
            Surface(shadowElevation = 2.dp, color = Color.White) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, "Back") }
                    Box(
                        Modifier.size(42.dp).clip(CircleShape).background(Color(0xFFE8F0FF)),
                        contentAlignment = Alignment.Center,
                    ) { Text(initials(title), color = PortalBlue, fontWeight = FontWeight.Black) }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(title, fontWeight = FontWeight.Black, color = Slate900, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(state.summary?.id, state.profile?.standard?.takeIf(String::isNotBlank)).joinToString(" · "),
                            color = Slate600,
                            fontSize = 12.sp,
                        )
                    }
                    if (state.loading || state.saving) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                    else Icon(
                        if (state.online) Icons.Outlined.CloudDone else Icons.Outlined.CloudOff,
                        if (state.online) "Online" else "Offline",
                        tint = if (state.online) Color(0xFF059669) else Color(0xFFF59E0B),
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(
                Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StudentTab("register", "Hifz register", Icons.Outlined.MenuBook, tab) { tab = "register" }
                StudentTab("profile", "Student details", Icons.Outlined.Person, tab) { tab = "profile" }
            }
            if (state.error != null && state.profile == null && state.register == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.error, color = Color(0xFFB91C1C))
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton({ onMonth(state.month) }) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(6.dp)); Text("Retry") }
                    }
                }
            } else if (tab == "profile") {
                StudentProfileContent(state)
            } else {
                HifzRegisterContent(state, onMonth, onDiscardConflict) { day, mode, entry -> editor = HifzEditorTarget(day, mode, entry) }
            }
        }
    }

    editor?.let { target ->
        HifzEntryEditor(
            target = target,
            saving = state.saving,
            onDismiss = { editor = null },
            onSave = { change ->
                val old = target.entry
                onSave(
                    target.day.date,
                    target.day.eligibility.sessionId,
                    target.mode,
                    if (old == null) listOf(change) else emptyList(),
                    if (old != null) listOf(change.copy(id = old.id)) else emptyList(),
                    emptyList(),
                    if (old != null) mapOf(old.id to old.version) else emptyMap(),
                )
                editor = null
            },
            onDelete = target.entry?.let { old ->
                {
                    onSave(target.day.date, target.day.eligibility.sessionId, target.mode, emptyList(), emptyList(), listOf(old.id), mapOf(old.id to old.version))
                    editor = null
                }
            },
        )
    }
}

@Composable
private fun StudentTab(key: String, label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: String, onClick: () -> Unit) {
    FilterChip(
        selected = key == selected,
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = { Icon(icon, null, Modifier.size(18.dp)) },
    )
}

@Composable
private fun StudentProfileContent(state: StudentUiState) {
    val profile = state.profile
    if (profile == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
                Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(62.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFFE8F0FF)), contentAlignment = Alignment.Center) {
                        Text(initials(profile.name), color = PortalBlue, fontWeight = FontWeight.Black, fontSize = 22.sp)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(profile.name, color = Slate900, fontWeight = FontWeight.Black, fontSize = 19.sp)
                        Text("${profile.id} · ${profile.standard}${profile.division?.let { " · $it" } ?: ""}", color = Slate600)
                        Text(if (profile.hifzStage == "HAFIZ_REVISION") "Hafiz revision" else "Memorizing", color = Color(0xFF059669), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        if (profile.cached) item { OfflineNotice("Showing the securely saved student profile.") }
        items(profile.sections, key = { it.key }) { section ->
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                    Text(section.title, color = Slate900, fontWeight = FontWeight.Black, fontSize = 17.sp)
                    Spacer(Modifier.height(12.dp))
                    section.fields.forEachIndexed { index, field ->
                        if (index > 0) Spacer(Modifier.height(10.dp))
                        Text(field.label.uppercase(Locale.getDefault()), color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Text(field.value, color = Slate900, fontSize = 14.sp)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

@Composable
private fun HifzRegisterContent(
    state: StudentUiState,
    onMonth: (String) -> Unit,
    onDiscardConflict: () -> Unit,
    onEdit: (HifzRegisterDay, String, HifzRegisterEntry?) -> Unit,
) {
    val register = state.register
    if (register == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val selectedMonth = runCatching { YearMonth.parse(state.month) }.getOrDefault(YearMonth.now())
    val today = LocalDate.now()
    val visibleDays = register.days.filter { day ->
        val date = runCatching { LocalDate.parse(day.date) }.getOrNull()
        day.entries.values.any(List<HifzRegisterEntry>::isNotEmpty) ||
            (date != null && !date.isAfter(today) && (day.eligibility.allowed || day.attendance != null))
    }.sortedByDescending { it.date }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Surface(color = Color.White, shape = RoundedCornerShape(18.dp), shadowElevation = 1.dp) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ onMonth(selectedMonth.minusMonths(1).toString()) }) { Icon(Icons.Outlined.ChevronLeft, "Previous month") }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(selectedMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy")), fontWeight = FontWeight.Black, color = Slate900)
                        Text(if (register.hifzStage == "HAFIZ_REVISION") "Hafiz revision register" else "Memorization register", color = Slate600, fontSize = 11.sp)
                    }
                    IconButton({ onMonth(selectedMonth.plusMonths(1).toString()) }, enabled = selectedMonth < YearMonth.now()) { Icon(Icons.Outlined.ChevronRight, "Next month") }
                }
            }
        }
        if (register.cached || !state.online) item { OfflineNotice("Offline changes appear immediately and will be verified when connection returns.") }
        if (register.pendingCount > 0) item { StatusNotice("${register.pendingCount} change${if (register.pendingCount == 1) "" else "s"} waiting to sync", Color(0xFFFFFBEB), Color(0xFFB45309)) }
        if (register.conflictCount > 0) item {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                    Text("A saved change conflicts with newer server data", color = Color(0xFF991B1B), fontWeight = FontWeight.Black)
                    Text(register.latestError ?: "The session, attendance, or entry changed while this device was offline.", color = Color(0xFFB91C1C), fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onDiscardConflict, enabled = state.online) { Text("Use server copy") }
                }
            }
        }
        item { RegisterSummary(register) }
        if (visibleDays.isEmpty()) item {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.CalendarMonth, null, tint = Color(0xFF94A3B8), modifier = Modifier.size(38.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("No register activity for this month", fontWeight = FontWeight.Bold)
                    Text("Eligible class days will appear after attendance is marked.", color = Slate600, fontSize = 12.sp)
                }
            }
        }
        items(visibleDays, key = { it.date }) { day -> RegisterDayCard(day, register.hifzStage, onEdit) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun RegisterSummary(register: HifzMonthRegister) {
    val items = if (register.hifzStage == "HAFIZ_REVISION") listOf(
        "New Juz" to decimal(register.summary.newJuzRevisionTotal),
        "Old Juz" to decimal(register.summary.oldJuzRevisionTotal),
        "Revision days" to register.summary.revisionDays.toString(),
        "Cycle" to "${decimal(register.summary.cycleProgress)}%",
    ) else listOf(
        "New Hifz pages" to decimal(register.summary.newHifzPages),
        "Revision days" to register.summary.revisionDays.toString(),
        "Juz revised" to decimal(register.summary.juzRevised),
        "Juz completed" to "${register.summary.completedJuz}/30",
    )
    BoxWithConstraints {
        val columns = if (maxWidth >= 700.dp) 4 else 2
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items.chunked(columns).forEach { rowItems ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    rowItems.forEach { (label, value) ->
                        Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(14.dp)) {
                                Text(value, color = PortalBlue, fontWeight = FontWeight.Black, fontSize = 22.sp)
                                Text(label, color = Slate600, fontSize = 11.sp)
                            }
                        }
                    }
                    repeat(columns - rowItems.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun RegisterDayCard(day: HifzRegisterDay, stage: String, onEdit: (HifzRegisterDay, String, HifzRegisterEntry?) -> Unit) {
    val date = runCatching { LocalDate.parse(day.date) }.getOrNull()
    val modes = if (stage == "HAFIZ_REVISION") listOf("Juz Revision (New)", "Juz Revision (Old)")
    else listOf("New Verses", "Recent Revision", "Juz Revision")
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFEFF6FF)), contentAlignment = Alignment.Center) {
                    Text(date?.dayOfMonth?.toString() ?: "–", color = PortalBlue, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(date?.format(DateTimeFormatter.ofPattern("EEEE, MMM d")) ?: day.date, fontWeight = FontWeight.Black, color = Slate900)
                    Text(day.attendance?.let { "${it.sessionName} · ${it.status}" } ?: "Attendance not required", color = Slate600, fontSize = 11.sp)
                }
                if (!day.eligibility.allowed) Text("Locked", color = Color(0xFFB45309), fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            day.eligibility.reason?.let { reason ->
                Spacer(Modifier.height(8.dp)); Text(reason, color = Color(0xFFB45309), fontSize = 11.sp)
            }
            Spacer(Modifier.height(10.dp))
            modes.forEach { mode ->
                val rows = day.entries[modeKey(mode)].orEmpty()
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(shortMode(mode), Modifier.weight(1f), color = Slate600, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    if (day.eligibility.allowed) IconButton({ onEdit(day, mode, null) }, Modifier.size(36.dp)) { Icon(Icons.Outlined.Add, "Add $mode", Modifier.size(19.dp), tint = PortalBlue) }
                }
                rows.forEach { entry ->
                    val queued = entry.version == 0L || entry.syncStatus == "pending"
                    Surface(
                        Modifier.fillMaxWidth().padding(bottom = 6.dp).clickable(enabled = day.eligibility.allowed && !queued) { onEdit(day, mode, entry) },
                        color = if (queued) Color(0xFFFFFBEB) else Color(0xFFF8FAFC),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Row(Modifier.padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.MenuBook, null, Modifier.size(18.dp), tint = if (queued) Color(0xFFD97706) else Color(0xFF64748B))
                            Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(entryLabel(entry), color = Slate900, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(if (queued) "Waiting to sync" else entry.recordedBy?.let { "Recorded by $it" } ?: "Saved", color = Slate600, fontSize = 10.sp)
                            }
                            if (!queued && day.eligibility.allowed) Icon(Icons.Outlined.Edit, "Edit", Modifier.size(17.dp), tint = Color(0xFF64748B))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HifzEntryEditor(
    target: HifzEditorTarget,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (HifzRegisterChange) -> Unit,
    onDelete: (() -> Unit)?,
) {
    val isJuz = target.mode.startsWith("Juz Revision")
    var surah by remember(target) { mutableStateOf(target.entry?.surahName.orEmpty()) }
    var start by remember(target) { mutableStateOf(target.entry?.startVerse?.toString().orEmpty()) }
    var end by remember(target) { mutableStateOf(target.entry?.endVerse?.toString().orEmpty()) }
    var juz by remember(target) { mutableStateOf(target.entry?.juzNumber?.toString().orEmpty()) }
    var portion by remember(target) { mutableStateOf(target.entry?.juzPortion ?: "Full") }
    val valid = if (isJuz) juz.toIntOrNull() in 1..30 else surah.isNotBlank() && start.toIntOrNull() != null && end.toIntOrNull() != null && start.toInt() <= end.toInt()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Column { Text(if (target.entry == null) "Add ${shortMode(target.mode)}" else "Edit ${shortMode(target.mode)}", fontWeight = FontWeight.Black); Text(target.day.date, color = Slate600, fontSize = 12.sp) } },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (isJuz) {
                    OutlinedTextField(juz, { juz = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Juz number (1–30)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                    Text("Portion", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Full", "1st Half", "2nd Half", "Q1", "Q2", "Q3", "Q4").forEach { value ->
                            FilterChip(selected = portion == value, onClick = { portion = value }, label = { Text(value) })
                        }
                    }
                } else {
                    OutlinedTextField(surah, { surah = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("Surah") }, singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(start, { start = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), label = { Text("Start verse") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                        OutlinedTextField(end, { end = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), label = { Text("End verse") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                    }
                }
                if (onDelete != null) OutlinedButton(onDelete, Modifier.fillMaxWidth(), enabled = !saving, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFB91C1C))) {
                    Icon(Icons.Outlined.DeleteOutline, null); Spacer(Modifier.width(6.dp)); Text("Delete entry")
                }
            }
        },
        confirmButton = {
            Button(
                { onSave(HifzRegisterChange(surahName = surah.takeIf { !isJuz }, startVerse = start.toIntOrNull(), endVerse = end.toIntOrNull(), juzNumber = juz.toIntOrNull(), juzPortion = portion.takeIf { isJuz })) },
                enabled = valid && !saving,
            ) { Text(if (target.entry == null) "Add entry" else "Save changes") }
        },
        dismissButton = { OutlinedButton(onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun OfflineNotice(message: String) = StatusNotice(message, Color(0xFFFFFBEB), Color(0xFFB45309))

@Composable
private fun StatusNotice(message: String, background: Color, foreground: Color) {
    Surface(color = background, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().border(1.dp, foreground.copy(alpha = .18f), RoundedCornerShape(14.dp))) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CloudOff, null, Modifier.size(18.dp), tint = foreground)
            Spacer(Modifier.width(8.dp)); Text(message, color = foreground, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun modeKey(mode: String) = when (mode) {
    "New Verses" -> "newHifz"
    "Recent Revision" -> "recentRevision"
    "Juz Revision" -> "juzRevision"
    "Juz Revision (New)" -> "newJuzRevision"
    else -> "oldJuzRevision"
}

private fun shortMode(mode: String) = when (mode) {
    "New Verses" -> "New Hifz"
    "Recent Revision" -> "Revision"
    "Juz Revision (New)" -> "New-cycle Juz"
    "Juz Revision (Old)" -> "Old-cycle Juz"
    else -> "Juz revision"
}

private fun entryLabel(entry: HifzRegisterEntry): String = if (entry.juzNumber != null) {
    "Juz ${entry.juzNumber} · ${entry.juzPortion ?: "Full"}"
} else {
    listOfNotNull(entry.surahName, entry.startVerse?.let { start -> "$start–${entry.endVerse ?: start}" }).joinToString(" · ")
}

private fun initials(name: String): String = name.trim().split(Regex("\\s+")).filter(String::isNotBlank).take(2).joinToString("") { it.first().uppercase() }.ifBlank { "ST" }

private fun decimal(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else String.format(Locale.US, "%.2f", value).trimEnd('0').trimEnd('.')
