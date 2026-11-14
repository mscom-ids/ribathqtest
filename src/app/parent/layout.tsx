import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Ribathul Quran Parent Portal",
    description: "Private parent access to student progress and attendance.",
    manifest: "/parent/manifest.webmanifest",
    icons: { apple: "/parent-icon-192.png" },
    appleWebApp: { capable: true, title: "Parent Portal" },
}

export default function ParentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children
}
