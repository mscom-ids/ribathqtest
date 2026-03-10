
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen } from "lucide-react"

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
            <div className="text-center space-y-6 max-w-lg">
                <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-2xl flex items-center justify-center mb-6">
                    <BookOpen className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-emerald-900 dark:text-emerald-50">
                    MA'DIN RIBATHUL QURAN
                </h1>

                <p className="text-lg text-muted-foreground">
                    The complete management system for MA'DIN RIBATHUL QURAN.
                    Track progress, manage attendance, and streamline administration.
                </p>

                <div className="pt-4">
                    <Link href="/login">
                        <Button size="lg" className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-full px-8">
                            Login to Portal <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            <footer className="absolute bottom-6 text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} MA'DIN RIBATHUL QURAN. All rights reserved.
            </footer>
        </div>
    )
}
