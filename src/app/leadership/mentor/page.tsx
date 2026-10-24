import { redirect } from "next/navigation"

/** Old bookmarks remain safe; leadership no longer has a Mentor Focus workflow. */
export default function FocusedMentorPage() {
  redirect("/leadership")
}
