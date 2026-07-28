import LoginForm from "@/components/login-form"

export default function ParentLoginPage() {
    return (
        <main className="parent-login-shell">
            <style>{parentLoginStyles}</style>
            <section className="parent-login-card" aria-label="Parent login">
                <LoginForm parentOnly />
            </section>
        </main>
    )
}

const parentLoginStyles = `
    .parent-login-shell {
        display: grid;
        min-height: 100vh;
        width: 100%;
        place-items: center;
        padding: 24px;
        background: linear-gradient(145deg, #eaf6f2 0%, #f8fbff 52%, #e9efff 100%);
    }

    .parent-login-shell *,
    .parent-login-shell *::before,
    .parent-login-shell *::after { box-sizing: border-box; }

    .parent-login-card { width: min(100%, 420px); }

    @media (max-width: 520px) {
        .parent-login-shell { padding: 16px; }
    }
`