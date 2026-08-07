import { redirect } from "next/navigation"

export default function FinanceSettingsPage() {
    redirect("/admin/finance/dashboard?view=setup")
}