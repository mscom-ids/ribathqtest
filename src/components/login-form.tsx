"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getRedirectPathForRole } from "@/lib/auth"

const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
})

export default function LoginForm() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        setError(null)

        try {
            console.log('[LOGIN] Attempting login for:', values.email)
            
            // Use native fetch to bypass any Axios interceptor deadlocks
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
            const API_URL = configuredApiUrl.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):5000/, `http://${window.location.hostname}:5000`);
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: values.email, password: values.password }),
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Invalid credentials');
            }

            console.log('[LOGIN] Response:', data.success, 'role:', data.user?.role)

            if (data.success && data.user) {
                const profile = data.user
                if (profile) {
                    // Store token in localStorage for Bearer-based API auth (cross-domain)
                    if (data.token) {
                        localStorage.setItem('auth_token', data.token)
                        // Also set a client-side cookie on THIS domain so Next.js
                        // middleware (which runs on the server and can only read
                        // cookies, not localStorage) can verify the user is logged in.
                        document.cookie = `auth_token=${data.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
                    }
                    const path = getRedirectPathForRole(profile.role)
                    console.log('[LOGIN] Redirecting to:', path, '(role:', profile.role, ')')
                    // Force a hard redirect so the middleware sees the new cookie
                    window.location.href = path
                } else {
                    setError("Profile not found. Contact Admin.")
                }
            } else {
                setError(data.error || "Failed to login")
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error("Failed to login")
            console.error('[LOGIN] Error:', error.name, error.message)
            if (error.name === 'AbortError') {
                setError("Login request timed out. Please ensure the backend server is running.");
            } else {
                setError(error.message || "Failed to login")
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md mx-auto shadow-2xl border-emerald-100 dark:border-emerald-900 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-center text-emerald-800 dark:text-emerald-400">
                    MA&apos;DIN RIBATHUL QURAN
                </CardTitle>
                <CardDescription className="text-center">
                    Enter your credentials to access the portal
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="usthad@madin.edu"
                            {...register("email")}
                            className={errors.email ? "border-red-500" : ""}
                        />
                        {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            {...register("password")}
                            className={errors.password ? "border-red-500" : ""}
                        />
                        {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
                    </div>
                    <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white" disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sign In
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    Restricted System. Authorized Personnel Only.
                </p>
            </CardFooter>
        </Card>
    )
}
