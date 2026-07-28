import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Ribathul Quran Parent Portal",
        short_name: "Parent Portal",
        description: "Private parent access to student progress and attendance.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f5f7fb",
        theme_color: "#0b5d45",
        icons: [
            { src: "/logo.png", sizes: "192x192", type: "image/png" },
            { src: "/logo.png", sizes: "512x512", type: "image/png" },
        ],
    }
}