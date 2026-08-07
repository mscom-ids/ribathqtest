import { FinanceWorkspace } from "@/components/finance/finance-workspace"
import type { FinanceView } from "@/lib/finance-api"

const VALID_VIEWS = new Set<FinanceView>(["overview", "dues", "transactions", "setup"])

export default async function FinanceDashboardPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const requested = Array.isArray(params.view) ? params.view[0] : params.view
    const initialView = requested && VALID_VIEWS.has(requested as FinanceView)
        ? requested as FinanceView
        : "overview"

    return <FinanceWorkspace mode="admin" initialView={initialView} />
}
