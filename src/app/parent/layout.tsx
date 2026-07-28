import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Ribathul Quran Parent Portal",
    description: "Private parent access to student progress and attendance.",
    manifest: "/manifest.webmanifest",
}

export default function ParentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children
}