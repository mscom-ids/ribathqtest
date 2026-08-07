import api from "@/lib/api"

export type FinanceMode = "admin" | "staff"
export type FinanceView = "overview" | "dues" | "transactions" | "setup"

export type FinanceCapabilities = Record<string, boolean | string[] | number | null | undefined> & {
    can_view_overview?: boolean
    can_view_dues?: boolean
    can_view_transactions?: boolean
    can_add_charge?: boolean
    can_collect_payment?: boolean
    can_manage_setup?: boolean
    allowed_category_ids?: string[]
}

export type FinanceCapabilityRow = {
    capability: string
    category_id?: string | null
    student_scope?: string | null
    amount_limit?: number | string | null
}

export type FinanceSummary = {
    expected?: number
    collected?: number
    outstanding?: number
    pending?: number
    overdue?: number
    credits?: number
    collection_rate?: number
    students_due?: number
}

export type FinanceStudentBalance = {
    id?: string
    student_id?: string
    adm_no?: string
    name: string
    standard?: string
    division?: string
    photo_url?: string | null
    total_due?: number
    outstanding?: number
    overdue?: number
    current_month_due?: number
    credit_balance?: number
    status?: string
    last_payment_at?: string | null
}

export type FinanceActivity = {
    id: string
    type?: string
    student_id?: string
    student_name?: string
    description?: string
    category_name?: string
    amount?: number
    date?: string
    created_at?: string
    recorded_by_name?: string
}

export type FeeSchedule = {
    id: string
    name?: string
    label?: string
    amount: number
    effective_from: string
    effective_until?: string | null
    scope_type?: string
    scope_value?: string | null
    is_active?: boolean
}

export type ChargeCategory = {
    id: string
    name: string
    description?: string | null
    is_active?: boolean
    authorized_staff_count?: number
}

export type PaymentAccount = {
    id: string
    account_holder?: string
    account_name?: string
    account_type: string
    details?: string | null
    is_active?: boolean
}

export type ChargeCategoryInput = {
    name: string
    description?: string
}

export type PaymentAccountInput = {
    account_holder: string
    account_type: "upi" | "bank"
    details?: string
}

export type FinanceStaff = {
    id: string
    name: string
    role?: string
    photo_url?: string | null
}

export type FinancePermission = {
    id: string
    staff_id: string
    staff_name?: string
    category_id?: string | null
    category_name?: string | null
    can_add_charge?: boolean
    can_collect_payment?: boolean
    student_scope?: string
    amount_limit?: number | null
    approval_threshold?: number | null
    is_active?: boolean
    capability?: string
    scope_type?: string
    scope_value?: string | null
    max_amount?: number | null
}

export type FinanceSetup = {
    schedules?: FeeSchedule[]
    categories?: ChargeCategory[]
    accounts?: PaymentAccount[]
    staff?: FinanceStaff[]
    permissions?: FinancePermission[]
}

export type FinanceWorkspaceResponse = {
    success: boolean
    mode: FinanceMode
    capabilities: FinanceCapabilities | string[] | FinanceCapabilityRow[]
    summary?: FinanceSummary
    students?: FinanceStudentBalance[]
    recent_activity?: FinanceActivity[]
    setup?: FinanceSetup
    categories?: ChargeCategory[]
    accounts?: PaymentAccount[]
    error?: string
}

export type FinanceOpenItem = {
    id: string
    obligation_id?: string
    type: string
    obligation_type?: string
    category_id?: string | null
    category_name?: string | null
    description: string
    amount: number
    original_amount?: number
    paid_amount?: number
    balance: number
    due_date?: string | null
    month?: string | null
    service_month?: string | null
    status?: string
    priority?: number
    allocation_priority?: number
}

export type PaymentAllocation = {
    id?: string
    open_item_id?: string
    item_id?: string
    obligation_id?: string
    description?: string
    amount: number
}

export type FinancePayment = {
    id: string
    amount: number
    status?: "posted" | "reversed" | string
    allocation_status?: "strict" | "legacy_snapshot" | string
    payment_method?: string
    method?: string
    payment_account_id?: string | null
    account_name?: string | null
    receipt_number?: string | null
    reference_number?: string | null
    notes?: string | null
    date?: string
    created_at?: string
    reversed_at?: string | null
    reversal_reason?: string | null
    allocations?: PaymentAllocation[]
}

export type ActiveFeeRule = {
    id?: string
    source?: string
    label?: string
    amount: number
    effective_from?: string
    effective_until?: string | null
}

export type StudentFinanceAccount = {
    student: FinanceStudentBalance
    summary: FinanceSummary & { total_due?: number; credit_balance?: number }
    open_items: FinanceOpenItem[]
    payments: FinancePayment[]
    active_fee_rule?: ActiveFeeRule | null
}

type MutationResponse = {
    success: boolean
    message?: string
    error?: string
    account?: StudentFinanceAccount
    workspace?: Partial<FinanceWorkspaceResponse>
    [key: string]: unknown
}

export type AddChargeInput = {
    student_id: string
    category_id: string
    amount: string
    date: string
    description?: string
    due_date?: string
    idempotency_key?: string
}

export type RecordPaymentInput = {
    student_id: string
    amount: string
    method: string
    payment_account_id?: string
    reference_number?: string
    receipt_number?: string
    date?: string
    notes?: string
    allocations?: Array<{ obligation_id: string; amount: string }>
    idempotency_key?: string
}

export type OpeningBalanceInput = {
    as_of_date: string
    entries: Array<{
        student_id: string
        amount: string
        month?: string
        category_id?: string
        description?: string
    }>
    idempotency_key?: string
}

export type FeeScheduleInput = {
    name: string
    scope_type: string
    standard?: string
    division?: string
    amount: string
    effective_from: string
    effective_until?: string
    notes?: string
}

export type StudentFeeAgreementInput = {
    student_id: string
    adjustment_type: "fixed" | "discount_amount" | "discount_percent" | "surcharge" | "waiver"
    amount: string
    effective_from: string
    effective_until?: string
    reason: string
}

export type FinancePermissionInput = {
    staff_id: string
    capability: string
    category_id?: string
    student_scope: string
    amount_limit?: string
    valid_from?: string
    valid_until?: string
}

function responseData<T>(response: { data: T }) {
    return response.data
}

function normalizeAccount(account: StudentFinanceAccount): StudentFinanceAccount {
    return {
        ...account,
        open_items: (account.open_items || []).map(item => ({
            ...item,
            id: item.id || item.obligation_id || "",
            obligation_id: item.obligation_id || item.id,
            type: item.type || item.obligation_type || "charge",
            obligation_type: item.obligation_type || item.type,
            description: item.description || item.category_name || item.obligation_type || "Finance item",
            amount: Number(item.amount ?? item.original_amount ?? 0),
            balance: Number(item.balance || 0),
            month: item.month || item.service_month,
            service_month: item.service_month || item.month,
            priority: item.priority ?? item.allocation_priority,
            allocation_priority: item.allocation_priority ?? item.priority,
        })),
    }
}

function normalizeMutation(result: MutationResponse) {
    if (result.account) result.account = normalizeAccount(result.account)
    return result
}

export const financeApi = {
    async getWorkspace(params: {
        month: string
        search?: string
        status?: string
        limit?: number
    }) {
        return responseData(await api.get<FinanceWorkspaceResponse>("/finance/workspace", { params }))
    },

    async getStudentAccount(studentId: string) {
        const result = responseData(await api.get<{ success: boolean; account: StudentFinanceAccount; error?: string }>(`/finance/students/${encodeURIComponent(studentId)}/account`))
        if (result.account) result.account = normalizeAccount(result.account)
        return result
    },

    async addCharge(input: AddChargeInput) {
        return normalizeMutation(responseData(await api.post<MutationResponse>("/finance/charges", {
            ...input,
            idempotency_key: input.idempotency_key || createIdempotencyKey("charge"),
        })))
    },

    async recordPayment(input: RecordPaymentInput) {
        return normalizeMutation(responseData(await api.post<MutationResponse>("/finance/payments", {
            ...input,
            idempotency_key: input.idempotency_key || createIdempotencyKey("payment"),
        })))
    },

    async reversePayment(paymentId: string, reason: string) {
        return responseData(await api.post<MutationResponse>(`/finance/payments/${encodeURIComponent(paymentId)}/reverse`, { reason }))
    },

    async voidObligation(obligationId: string, reason: string) {
        return responseData(await api.post<MutationResponse>(`/finance/obligations/${encodeURIComponent(obligationId)}/void`, { reason }))
    },

    async previewMonthlyFees(month: string) {
        return responseData(await api.post<MutationResponse>("/finance/monthly-fees/preview", { month }))
    },

    async publishMonthlyFees(month: string, dueDate: string, idempotencyKey?: string) {
        return responseData(await api.post<MutationResponse>("/finance/monthly-fees/publish", {
            month,
            due_date: dueDate,
            idempotency_key: idempotencyKey || createIdempotencyKey("monthly-fees"),
        }))
    },

    async addOpeningBalances(input: OpeningBalanceInput) {
        return responseData(await api.post<MutationResponse>("/finance/opening-balances", {
            ...input,
            idempotency_key: input.idempotency_key || createIdempotencyKey("opening-balance"),
        }))
    },

    async addCategory(input: ChargeCategoryInput) {
        return responseData(await api.post<MutationResponse>("/finance/categories", input))
    },

    async toggleCategory(categoryId: string, isActive: boolean) {
        return responseData(await api.put<MutationResponse>("/finance/categories/" + encodeURIComponent(categoryId) + "/toggle", { is_active: isActive }))
    },

    async addPaymentAccount(input: PaymentAccountInput) {
        return responseData(await api.post<MutationResponse>("/finance/accounts", input))
    },

    async togglePaymentAccount(accountId: string, isActive: boolean) {
        return responseData(await api.put<MutationResponse>("/finance/accounts/" + encodeURIComponent(accountId) + "/toggle", { is_active: isActive }))
    },

    async addFeeSchedule(input: FeeScheduleInput) {
        return responseData(await api.post<MutationResponse>("/finance/fee-schedules", input))
    },

    async addStudentFeeAgreement(input: StudentFeeAgreementInput) {
        return responseData(await api.post<MutationResponse>("/finance/student-fee-agreements", input))
    },

    async grantPermission(input: FinancePermissionInput) {
        return responseData(await api.post<MutationResponse>("/finance/permissions", input))
    },

    async revokePermission(permissionId: string) {
        return responseData(await api.put<MutationResponse>(`/finance/permissions/${encodeURIComponent(permissionId)}/revoke`))
    },
}

export function studentFinanceId(student?: FinanceStudentBalance | null) {
    return student?.student_id || student?.adm_no || student?.id || ""
}

export function hasFinanceCapability(
    capabilities: FinanceCapabilities | string[] | FinanceCapabilityRow[] | undefined,
    capability: string,
    fallback = false,
) {
    if (!capabilities) return fallback
    if (Array.isArray(capabilities)) {
        return capabilities.some(item => typeof item === "string"
            ? item === capability
            : item.capability === capability)
    }
    const value = capabilities[capability]
    return typeof value === "boolean" ? value : fallback
}

export function allowedFinanceCategoryIds(capabilities: FinanceCapabilities | string[] | FinanceCapabilityRow[] | undefined) {
    if (!capabilities) return []
    if (Array.isArray(capabilities)) {
        return capabilities.flatMap(item => typeof item === "string" || !item.category_id ? [] : [item.category_id])
    }
    return Array.isArray(capabilities.allowed_category_ids) ? capabilities.allowed_category_ids : []
}
export function createIdempotencyKey(prefix: string) {
    const random = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `${prefix}:${random}`
}

export function decimalMoney(value: string | number) {
    const amount = Number(value)
    if (!Number.isFinite(amount)) return "0.00"
    return amount.toFixed(2)
}

export function financeErrorMessage(error: unknown, fallback: string) {
    if (typeof error === "object" && error !== null && "response" in error) {
        const response = (error as { response?: { data?: { error?: unknown } } }).response
        const message = response?.data?.error
        if (typeof message === "string" && message.trim()) return message
    }
    return error instanceof Error && error.message ? error.message : fallback
}
