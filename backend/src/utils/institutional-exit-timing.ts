type LeaveExitTiming = {
    leave_type?: string;
    start_datetime?: string | Date | null;
    actual_exit_datetime?: string | Date | null;
    scheduled_start_datetime?: string | Date | null;
};

/** The student's start is their actual exit; the institution keeps the planned start. */
export function withInstitutionalExitTiming<T extends LeaveExitTiming>(leave: T) {
    const actualExit = leave.actual_exit_datetime || leave.start_datetime;
    const scheduledStart = leave.scheduled_start_datetime;
    let exitStatus: 'early' | 'normal' | null = null;
    if (leave.leave_type === 'institutional' && actualExit && scheduledStart) {
        const actualTime = new Date(actualExit).getTime();
        const scheduledTime = new Date(scheduledStart).getTime();
        if (Number.isFinite(actualTime) && Number.isFinite(scheduledTime)) {
            exitStatus = actualTime < scheduledTime ? 'early' : 'normal';
        }
    }
    return { ...leave, exit_status: exitStatus };
}
