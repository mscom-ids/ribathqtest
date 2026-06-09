import { redirect } from "next/navigation"

export default function SchoolPlacementRedirect() {
    redirect("/admin/academic/enrollments")
}
