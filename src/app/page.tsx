import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen } from "lucide-react"

export default function Home() {
    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <img
                    src="/landing-photo.png"
                    alt="Ma'din Ribathul Quran Campus"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Dark overlay to make text readable */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            </div>

            {/* Content Foreground */}
            <div className="relative z-10 flex flex-col items-center justify-center p-6 w-full">
                <div className="text-center space-y-8 max-w-2xl bg-white/10 dark:bg-black/20 backdrop-blur-md p-10 md:p-14 rounded-3xl border border-white/20 shadow-2xl">
                    <div className="mx-auto w-24 h-24 mb-6 relative rounded-2xl overflow-hidden shadow-lg shadow-emerald-900/50 border-2 border-white/20">
                        <img 
                            src="/logo.png" 
                            alt="Logo"
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white drop-shadow-sm">
                        MA'DIN RIBATHUL<br className="hidden md:block" /> QURAN
                    </h1>

                    <p className="text-lg md:text-xl text-slate-200 font-medium">
                        The complete management system for MA'DIN RIBATHUL QURAN.
                        Manage attendance, track progress, and streamline administration.
                    </p>

                    <div className="pt-6">
                        <Link href="/login">
                            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-10 py-7 text-lg shadow-xl shadow-emerald-900/30 transition-all hover:scale-105 active:scale-95 border-none">
                                Login to Portal <ArrowRight className="ml-3 w-6 h-6" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <footer className="absolute bottom-6 w-full text-center text-sm text-slate-300 font-medium tracking-wide z-10">
                &copy; {new Date().getFullYear()} MA'DIN RIBATHUL QURAN. All rights reserved.
            </footer>
        </div>
    )
}
