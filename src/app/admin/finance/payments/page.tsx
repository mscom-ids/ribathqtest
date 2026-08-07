import { redirect } from "next/navigation"

export default function FinancePaymentsPage() {
    redirect("/admin/finance/dashboard?view=transactions")
}