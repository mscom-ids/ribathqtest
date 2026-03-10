
import LoginForm from "@/components/login-form"

export default function LoginPage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 dark:from-slate-900 dark:to-emerald-950 p-4">
            <div className="w-full max-w-md">
                <LoginForm />
            </div>
        </main>
    )
}
