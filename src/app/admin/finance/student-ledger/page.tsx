import { redirect } from "next/navigation"

export default function StudentLedgerPage() {
    redirect("/admin/finance/dashboard?view=dues")
}