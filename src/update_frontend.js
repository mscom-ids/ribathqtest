const fs = require('fs');
const path = 'd:\\NewRQP\\src\\components\\admin\\reports\\management-report-page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update the ReportResponse type to include schedules
content = content.replace(
    /type ReportResponse = \{[\s\S]*?\n\}/,
    `type ReportResponse = {
    success: boolean; data?: StudentRow[] | FacultyRow[]; dates?: string[]; filters?: Filters
    pagination?: Pagination; summary?: Record<string, any>; totals?: Record<string, number>
    academic_year?: AcademicYear; period?: { start_date: string; end_date: string }
    schedules?: { id: string; name: string; summary: Record<string, number>; data: StudentRow[] }[]
}`
);

// 2. Add state for selected schedule and pills UI
const managementReportPageMatch = /export function ManagementReportPage[\s\S]*?const loadReport = useCallback/;
let pageTop = content.match(managementReportPageMatch)[0];
pageTop = pageTop.replace(
    'const [error, setError] = useState("")',
    `const [error, setError] = useState("")
    const [selectedSchedule, setSelectedSchedule] = useState<string>("")`
);
content = content.replace(managementReportPageMatch, pageTop);

// 3. Reset selected schedule when data loads
content = content.replace(
    /setResponse\(result\.data\)\n\s+if \(!academicYearId/g,
    `setResponse(result.data)
            if (result.data.schedules?.length) setSelectedSchedule(result.data.schedules[0].id)
            if (!academicYearId`
);

// 4. Update the AttendanceTable to take the selected schedule
content = content.replace(
    /function AttendanceTable\(\{ response \}: \{ response: ReportResponse \| null \}\) \{[\s\S]*?\}\n\nfunction ProgressTable/m,
    `function AttendanceTable({ response, selectedSchedule }: { response: ReportResponse | null; selectedSchedule: string }) {
    const schedule = response?.schedules?.find(s => s.id === selectedSchedule) || response?.schedules?.[0]
    const dates = response?.dates || []
    const rows = (schedule?.data || []) as StudentRow[]
    
    return (
        <>
            <div className="overflow-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="sticky left-0 z-30 min-w-60 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left"># Student Name</th>
                            {dates.map(date => <th key={date} className="min-w-12 border-b border-r border-slate-200 px-2 py-3 text-center">{Number(date.slice(8))}</th>)}
                            {["Present", "Absent", "Leave", "Total", "%"].map(label => <th key={label} className="min-w-16 border-b border-slate-200 px-2 py-3 text-center">{label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {!rows.length && <EmptyRows columns={dates.length + 6} />}
                        {rows.map((row, idx) => (
                            <tr key={row.adm_no} className="border-b border-slate-100">
                                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                                    <div className="flex gap-2">
                                        <span className="text-slate-500 w-4">{idx + 1}</span>
                                        <div>
                                            <div className="font-semibold text-slate-900 uppercase">{row.name}</div>
                                            <div className="text-xs text-slate-500">{row.adm_no}</div>
                                        </div>
                                    </div>
                                </td>
                                {dates.map(date => {
                                    const value = row.cells?.[date] || "-"
                                    return <td key={date} title={date} className="border-r border-slate-100 px-2 py-3 text-center"><span className={"inline-grid h-7 w-7 place-items-center rounded text-xs font-bold " + statusStyle(value)}>{value === 'P' ? '✓' : value === 'A' ? 'X' : value === 'L' ? 'L' : value === 'C' ? 'C' : value === '-' ? '-' : value}</span></td>
                                })}
                                <td className="px-2 text-center font-semibold text-emerald-700">{row.present || 0}</td>
                                <td className="px-2 text-center font-semibold text-rose-700">{row.absent || 0}</td>
                                <td className="px-2 text-center text-amber-700">{row.leave || 0}</td>
                                <td className="px-2 text-center font-semibold text-slate-700">{row.total || 0}</td>
                                <td className="px-2 text-center font-bold text-slate-900">{row.percentage || 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                <span><b className="text-emerald-700">✓</b> Present</span>
                <span><b className="text-rose-700">X</b> Absent</span>
                <span><b className="text-amber-700">L</b> Leave</span>
                <span><b className="text-slate-500">C</b> Cancelled</span>
                <span><b className="text-blue-700">N</b> Pending</span>
                <span><b>-</b> No schedule</span>
            </div>
        </>
    )
}

function ProgressTable`
);

// 5. Update Summary component
content = content.replace(
    /function Summary\(\{ kind, response \}: \{ kind: ManagementReportKind; response: ReportResponse \| null \}\) \{[\s\S]*?return \([\s\S]*?\}\n/m,
    `function Summary({ kind, response, selectedSchedule }: { kind: ManagementReportKind; response: ReportResponse | null; selectedSchedule?: string }) {
    if (kind === "faculty") {
        const totals = response?.totals || {}
        const percent = totals.required_classes ? Math.round((totals.marked_classes || 0) / totals.required_classes * 1000) / 10 : 0
        return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Attended" value={totals.marked_classes || 0} tone="green" />
                <StatCard label="Pending" value={totals.not_marked_classes || 0} tone="red" />
                <StatCard label="Cancelled" value={totals.cancelled_classes || 0} tone="orange" />
                <StatCard label="Completion" value={percent + "%"} tone="blue" />
            </div>
        )
    }
    
    if (kind === "progress") {
        const summary = response?.summary || {}
        return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Students" value={summary.students || 0} tone="blue" />
                <StatCard label="Present Marks" value={summary.present || 0} tone="green" />
                <StatCard label="Absent Marks" value={summary.absent || 0} tone="red" />
                <StatCard label="Recited Days" value={summary.recited_days || 0} tone="orange" />
            </div>
        )
    }
    
    // Attendance
    const schedule = response?.schedules?.find(s => s.id === selectedSchedule) || response?.schedules?.[0]
    const summary = schedule?.summary || { total_classes: 0, completed: 0, cancelled: 0, pending: 0 }
    
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Classes" value={summary.total_classes || 0} tone="blue" />
            <StatCard label="Attendance Taken" value={summary.completed || 0} tone="green" />
            <StatCard label="Canceled" value={summary.cancelled || 0} tone="orange" />
            <StatCard label="Remaining" value={summary.pending || 0} tone="red" />
        </div>
    )
}
`
);

// 6. Fix <Summary /> usage inside ManagementReportPage
content = content.replace(
    /<Summary kind=\{kind\} response=\{response\} \/>/g,
    `<Summary kind={kind} response={response} selectedSchedule={selectedSchedule} />`
);

// 7. Update the rendering of pills and tabs
const renderAreaStart = content.indexOf('<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">');
const renderAreaEnd = content.indexOf('</section>', renderAreaStart);

const newRenderArea = `<div className="flex flex-col gap-4">
                    {kind !== "faculty" && (
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-4 overflow-x-auto">
                            <div className="flex gap-2 min-w-max">
                                <button
                                    onClick={() => setStandard("")}
                                    className={"px-4 py-1.5 text-sm font-semibold rounded-full border " + (!standard ? "bg-slate-100 text-slate-800 border-slate-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                >
                                    All
                                </button>
                                {standards.map(value => (
                                    <button
                                        key={value}
                                        onClick={() => { setStandard(value); setDivision(""); }}
                                        className={"px-4 py-1.5 text-sm font-semibold rounded-full border " + (standard === value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {kind !== "faculty" && standard && divisions.length > 0 && (
                        <div className="flex items-center gap-4 overflow-x-auto">
                            <div className="flex gap-2 min-w-max">
                                <button
                                    onClick={() => setDivision("")}
                                    className={"px-4 py-1.5 text-sm font-semibold rounded border " + (!division ? "bg-slate-100 text-slate-800 border-slate-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                >
                                    All
                                </button>
                                {divisions.map(value => (
                                    <button
                                        key={value}
                                        onClick={() => setDivision(value)}
                                        className={"px-4 py-1.5 text-sm font-semibold rounded border " + (division === value ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 mt-2">
                        {kind !== "faculty" && (
                            <Field label="Academic Year">
                                <select className={inputClass} value={academicYearId} onChange={event => setAcademicYearId(event.target.value)}>
                                    {!academicYearId && <option value="">Current year</option>}
                                    {years.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label="Department">
                            <select className={inputClass} value={department} onChange={event => {
                                setDepartment(event.target.value)
                                setStandard("")
                                setDivision("")
                            }}>
                                {kind === "faculty" && <option value="active">All Teaching Staff</option>}
                                <option value="school">School</option>
                                <option value="madrasa">Madrasa</option>
                                <option value="hifz">Hifz</option>
                            </select>
                        </Field>
                        <Field label="From">
                            <input className={inputClass} type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
                        </Field>
                        <Field label="To">
                            <input className={inputClass} type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
                        </Field>
                        <label className="relative grid min-w-0 gap-1 text-[11px] font-bold uppercase text-slate-500 sm:col-span-2">
                            Search
                            <Search className="absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
                            <input className={inputClass + " pl-9"} value={search} onChange={event => setSearch(event.target.value)} placeholder="Student, ID, or faculty" />
                        </label>
                    </div>
                </div>`;

content = content.substring(0, renderAreaStart) + newRenderArea + content.substring(renderAreaEnd);

// 8. Add schedule tabs above the table
content = content.replace(
    /\{kind === "attendance" && <AttendanceTable response=\{response\} \/>\}/,
    `{kind === "attendance" && (
                            <>
                                {response?.schedules && response.schedules.length > 0 && (
                                    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2">
                                        {response.schedules.map(sched => (
                                            <button
                                                key={sched.id}
                                                onClick={() => setSelectedSchedule(sched.id)}
                                                className={"px-4 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap " + (selectedSchedule === sched.id ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-200")}
                                            >
                                                {sched.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <AttendanceTable response={response} selectedSchedule={selectedSchedule} />
                            </>
                        )}`
);

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
