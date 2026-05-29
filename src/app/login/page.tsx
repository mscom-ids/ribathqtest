
import LoginForm from "@/components/login-form"

export default function LoginPage() {
    return (
        <main className="login-shell">
            <style>{loginPageStyles}</style>
            <div className="login-scrim" aria-hidden />

            <section className="login-stage">
                <div className="login-intro" aria-label="Portal introduction">
                    <p className="login-kicker">Secure Institution Portal</p>
                    <h1>Focused access for Ma&apos;din Ribathul Quran.</h1>
                    <p>
                        Sign in to manage attendance, hifdh progress, reports, staff coordination,
                        and daily academic operations from one quiet workspace.
                    </p>

                    <div className="login-points">
                        <span>Admin</span>
                        <span>Faculty</span>
                        <span>Parent portal</span>
                    </div>
                </div>

                <div className="login-form-wrap">
                    <LoginForm />
                </div>
            </section>
        </main>
    )
}

const loginPageStyles = `
    .login-shell {
        position: relative;
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
        display: grid;
        place-items: center;
        overflow: hidden;
        overflow-x: hidden;
        padding: 28px;
        background:
            linear-gradient(90deg, rgba(5, 16, 25, 0.9), rgba(5, 16, 25, 0.66)),
            url("/landing-photo.png") center / cover,
            #07121d;
        color: #f2f7fb;
    }

    .login-shell *,
    .login-shell *::before,
    .login-shell *::after {
        box-sizing: border-box;
    }

    .login-scrim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
            linear-gradient(to bottom, rgba(125, 223, 190, 0.08), transparent 36%),
            linear-gradient(to right, rgba(5, 16, 25, 0.36), transparent 58%);
    }

    .login-stage {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 1040px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
        gap: 42px;
        align-items: center;
        min-width: 0;
        animation: loginRise 420ms ease-out both;
    }

    .login-intro {
        max-width: 570px;
        min-width: 0;
    }

    .login-kicker {
        margin: 0 0 18px;
        font-family: var(--font-space-mono), monospace;
        font-size: 0.72rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #9ee9cf;
    }

    .login-intro h1 {
        margin: 0;
        font-family: var(--font-playfair), Georgia, serif;
        font-size: clamp(3rem, 5vw, 5rem);
        line-height: 1.04;
        letter-spacing: 0;
        color: #f6fbff;
        overflow-wrap: break-word;
    }

    .login-intro p:not(.login-kicker) {
        max-width: 58ch;
        margin: 22px 0 0;
        color: #b9c9d9;
        font-size: 1rem;
        line-height: 1.8;
    }

    .login-points {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 28px;
    }

    .login-points span {
        border: 1px solid rgba(158, 233, 207, 0.24);
        border-radius: 999px;
        padding: 9px 13px;
        background: rgba(8, 20, 34, 0.62);
        color: #c8d7e5;
        font-size: 0.86rem;
    }

    .login-form-wrap {
        width: 100%;
        min-width: 0;
    }

    @keyframes loginRise {
        from {
            opacity: 0;
            transform: translateY(14px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .login-stage {
            animation: none;
        }
    }

    @media (max-width: 860px) {
        .login-shell {
            align-items: start;
            padding: 18px;
        }

        .login-stage {
            grid-template-columns: 1fr;
            gap: 24px;
            width: 100%;
            max-width: calc(100vw - 36px);
            margin-inline: auto;
            padding: 18px 0;
        }

        .login-intro h1 {
            font-size: clamp(2.25rem, 9vw, 2.9rem);
            line-height: 1.08;
            max-width: 10ch;
        }

        .login-intro p:not(.login-kicker) {
            max-width: 30ch;
            margin-top: 16px;
        }
    }
`
