"use client"

import Image from "next/image"
import { FormEvent, useMemo, useState } from "react"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole.js"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js"
import UserRound from "lucide-react/dist/esm/icons/user-round.js"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getRedirectPathForRole } from "@/lib/auth"

function getApiUrl() {
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
    return configuredApiUrl.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):5000/, `http://${window.location.hostname}:5000`)
}

function normalizeParentDob(value: string) {
    const trimmed = value.trim()
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!match) return null

    const [, day, month, year] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    if (
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day)
    ) {
        return null
    }

    return `${year}-${month}-${day}`
}

export default function LoginForm() {
    const [userId, setUserId] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const title = "Welcome back"
    const description = "Staff use email and password. Parents use admission number and DOB."

    const isSubmitDisabled = useMemo(() => {
        if (loading) return true
        return !userId.trim() || !password.trim()
    }, [loading, password, userId])

    async function handleStaffLogin(signal: AbortSignal) {
        const res = await fetch(`${getApiUrl()}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: userId.trim(), password }),
            credentials: "include",
            signal,
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Invalid credentials")
        return data
    }

    async function handleParentLogin(signal: AbortSignal) {
        const normalizedDob = normalizeParentDob(password)
        if (!normalizedDob) {
            throw new Error("For parent login, enter DOB as DD/MM/YYYY.")
        }

        const res = await fetch(`${getApiUrl()}/parent/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ admission_no: userId.trim(), dob: normalizedDob }),
            credentials: "include",
            signal,
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Invalid admission number or date of birth")
        return data
    }

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        try {
            const data = userId.includes("@")
                ? await handleStaffLogin(controller.signal)
                : await handleParentLogin(controller.signal)
            const profile = data.user

            if (!data.success || !profile) {
                throw new Error(data.error || "Failed to login")
            }

            window.location.href = getRedirectPathForRole(profile.role)
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error("Failed to login")
            setError(error.name === "AbortError"
                ? "Login request timed out. Please ensure the backend server is running."
                : error.message)
        } finally {
            clearTimeout(timeoutId)
            setLoading(false)
        }
    }

    return (
        <Card className="login-card">
            <style>{loginFormStyles}</style>
            <CardHeader className="login-card-header">
                <div className="login-logo">
                    <Image src="/logo.png" alt="Ma'din Ribathul Quran logo" width={58} height={58} />
                </div>
                <div>
                    <CardTitle className="login-title">{title}</CardTitle>
                    <CardDescription className="login-description">{description}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="login-card-content">
                {error && (
                    <Alert variant="destructive" className="login-alert">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={onSubmit} className="login-form">
                    <div className="login-field">
                        <Label htmlFor="user_id">User ID</Label>
                        <div className="login-input-wrap">
                            <UserRound size={17} aria-hidden />
                            <Input
                                id="user_id"
                                type="text"
                                placeholder="Email or admission number"
                                value={userId}
                                onChange={(event) => {
                                    setUserId(event.target.value)
                                    setError(null)
                                }}
                                className="login-input"
                                autoComplete="username"
                            />
                        </div>
                    </div>
                    <div className="login-field">
                        <Label htmlFor="password">Password</Label>
                        <div className="login-input-wrap">
                            <LockKeyhole size={17} aria-hidden />
                            <Input
                                id="password"
                                type="password"
                                placeholder="Password or DOB (DD/MM/YYYY)"
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value)
                                    setError(null)
                                }}
                                className="login-input"
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="login-submit" disabled={isSubmitDisabled}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        <span>{loading ? "Signing in" : "Sign in"}</span>
                        {!loading && <ArrowRight className="h-4 w-4 login-submit-arrow" />}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="login-card-footer">
                <p>
                    Restricted System. Authorized access only.
                </p>
            </CardFooter>
        </Card>
    )
}

const loginFormStyles = `
    .login-card {
        width: 100%;
        max-width: 420px;
        box-sizing: border-box;
        margin: 0 auto;
        overflow: hidden;
        border: 1px solid rgba(158, 233, 207, 0.24);
        border-radius: 12px;
        background: rgba(8, 18, 32, 0.94);
        color: #eef6fb;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.36);
        transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }

    .login-card:hover {
        border-color: rgba(158, 233, 207, 0.34);
        box-shadow: 0 30px 84px rgba(0, 0, 0, 0.42);
    }

    .login-card-header {
        gap: 18px;
        padding: 28px 28px 18px;
    }

    .login-logo {
        width: 58px;
        height: 58px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(229, 248, 242, 0.94));
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
    }

    .login-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .login-title {
        margin: 0;
        color: #f6fbff;
        font-family: var(--font-playfair), Georgia, serif;
        font-size: 2rem;
        line-height: 1.1;
        letter-spacing: 0;
    }

    .login-description {
        margin-top: 7px;
        color: #9fb1c4;
        font-size: 0.94rem;
    }

    .login-card-content {
        padding: 8px 28px 24px;
    }

    .login-alert {
        margin-bottom: 16px;
        border-radius: 8px;
    }

    .login-form {
        display: grid;
        gap: 18px;
    }

    .login-field {
        display: grid;
        gap: 8px;
    }

    .login-field label {
        color: #d7e5ee;
        font-size: 0.86rem;
        font-weight: 700;
    }

    .login-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
    }

    .login-input-wrap svg {
        position: absolute;
        left: 14px;
        color: #7ddfbe;
        opacity: 0.82;
        pointer-events: none;
        transition: opacity 160ms ease, transform 160ms ease;
    }

    .login-input {
        height: 48px;
        border-radius: 8px;
        border-color: rgba(159, 177, 196, 0.18);
        background: rgba(255, 255, 255, 0.055);
        color: #f6fbff;
        padding-left: 42px;
        transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
    }

    .login-input::placeholder {
        color: rgba(203, 215, 226, 0.58);
    }

    .login-input:focus-visible {
        border-color: rgba(125, 223, 190, 0.72);
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 0 0 3px rgba(125, 223, 190, 0.14);
    }

    .login-input-wrap:focus-within svg {
        opacity: 1;
        transform: translateX(1px);
    }

    .login-submit {
        height: 50px;
        margin-top: 4px;
        border-radius: 8px;
        background: linear-gradient(135deg, #7ddfbe, #a2f0d4);
        color: #031017;
        font-weight: 800;
        box-shadow: 0 16px 34px rgba(125, 223, 190, 0.22);
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
    }

    .login-submit:hover {
        background: linear-gradient(135deg, #8be6c7, #b4f7df);
        transform: translateY(-1px);
        box-shadow: 0 18px 38px rgba(125, 223, 190, 0.28);
    }

    .login-submit:disabled {
        opacity: 0.72;
        transform: none;
        box-shadow: none;
    }

    .login-submit-arrow {
        transition: transform 160ms ease;
    }

    .login-submit:hover .login-submit-arrow {
        transform: translateX(2px);
    }

    .login-card-footer {
        justify-content: center;
        padding: 0 28px 28px;
    }

    .login-card-footer p {
        margin: 0;
        color: #8798aa;
        text-align: center;
        font-size: 0.78rem;
    }

    @media (prefers-reduced-motion: reduce) {
        .login-card,
        .login-input,
        .login-input-wrap svg,
        .login-submit,
        .login-submit-arrow {
            transition: none;
        }
    }

    @media (max-width: 520px) {
        .login-card {
            width: 100%;
            max-width: none;
        }

        .login-card-header,
        .login-card-content,
        .login-card-footer {
            padding-left: 20px;
            padding-right: 20px;
        }

        .login-title {
            font-size: 1.75rem;
        }
    }
`
