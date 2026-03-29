"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import api from "@/lib/api"
import Cookies from "js-cookie"
import { getRedirectPathForRole } from "@/lib/auth"

const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
})

export default function LoginForm() {
    const router = useRouter()
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
            
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: values.email, password: values.password }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Invalid credentials');
            }

            console.log('[LOGIN] Response:', data.success, 'role:', data.user?.role)

            if (data.success && data.token) {
                Cookies.set('auth_token', data.token, { 
                    expires: 365, 
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/'
                })
                console.log('[LOGIN] Token saved to cookie')
                
                const profile = data.user
                if (profile) {
                    const path = getRedirectPathForRole(profile.role)
                    console.log('[LOGIN] Redirecting to:', path, '(role:', profile.role, ')')
                    // Force a hard redirect so Server Components read the new cookie correctly
                    window.location.href = path
                } else {
                    setError("Profile not found. Contact Admin.")
                }
            } else {
                setError(data.error || "Failed to login")
            }
        } catch (err: any) {
            console.error('[LOGIN] Error:', err.name, err.message)
            if (err.name === 'AbortError') {
                setError("Login request timed out. Please ensure the backend server is running.");
            } else {
                setError(err.message || "Failed to login")
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md mx-auto shadow-2xl border-emerald-100 dark:border-emerald-900 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-center text-emerald-800 dark:text-emerald-400">
                    MA'DIN RIBATHUL QURAN
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
