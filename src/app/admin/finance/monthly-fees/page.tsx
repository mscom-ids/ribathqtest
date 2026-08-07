import { redirect } from "next/navigation"

export default function MonthlyFeesPage() {
    redirect("/admin/finance/dashboard?view=setup")
}