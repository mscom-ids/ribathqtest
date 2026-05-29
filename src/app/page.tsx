import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react"

const metrics = [
  { label: "Students Guided", value: "348+", note: "active hifdh journeys" },
  { label: "Completion Rate", value: "94.2%", note: "consistent progression" },
  { label: "Faculty Network", value: "32", note: "mentors and supervisors" },
]

const pillars = [
  {
    icon: BookOpen,
    title: "Memorization",
    description: "Structured sabaq, revision cycles, and day-by-day retention monitoring.",
  },
  {
    icon: BarChart3,
    title: "Insight Layer",
    description: "Elegant analytics for tracking rhythm, consistency, and academic momentum.",
  },
  {
    icon: Users2,
    title: "Faculty Flow",
    description: "A coordinated workspace for teachers, administrators, and institutional oversight.",
  },
]

const highlights = [
  "Designed for focused Quranic learning environments",
  "Built for clarity, accountability, and institutional calm",
  "Balanced between heritage, discipline, and modern systems",
]

export default function Home() {
  return (
    <main className="landing-shell">
      <style>{landingStyles}</style>
      <div className="landing-ambient" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <header className="landing-header">
        <div className="landing-brand">
          <div className="landing-brand-mark">
            <Image src="/logo.png" alt="Ma'din Ribathul Quran logo" width={58} height={58} />
          </div>
          <div>
            <p className="landing-eyebrow">Ma'din Ribathul Quran</p>
            <h2>Preserving sacred learning with modern precision</h2>
          </div>
        </div>

        <Link href="/login" className="landing-header-link">
          Enter portal
        </Link>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-kicker">
            <Sparkles size={14} />
            <span>Elegant institutional operating layer</span>
          </div>

          <h1>
            Ma'din Ribathul Quran
            <span> Hifdh Management Portal</span>
          </h1>

          <p className="hero-description">
            A refined operating space for Quran memorization, faculty guidance,
            progress tracking, and daily institutional coordination.
          </p>

          <div className="hero-actions">
            <Link href="/login" className="hero-primary">
              Login to Portal
              <ArrowRight size={16} />
            </Link>
            <div className="hero-trust">
              <ShieldCheck size={16} />
              <span>Secure access for admins, faculty, and guardians</span>
            </div>
          </div>

          <div className="hero-highlights">
            {highlights.map((item) => (
              <div key={item} className="hero-highlight-item">
                <span className="hero-highlight-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-panel">
          <div className="hero-panel-top">
            <span className="panel-chip">Institution Overview</span>
            <span className="panel-status">Live System</span>
          </div>

          <div className="hero-panel-card">
            <div className="hero-panel-logo">
              <Image src="/logo.png" alt="Institution emblem" width={66} height={66} />
            </div>
            <div>
              <p>Ma'din Ribathul Quran</p>
              <h3>Built for disciplined growth and beautiful simplicity</h3>
            </div>
          </div>

          <div className="metrics-list">
            {metrics.map((metric) => (
              <div key={metric.label} className="metric-row">
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
                <p>{metric.note}</p>
              </div>
            ))}
          </div>

          <div className="panel-quote">
            <p>"Read, and your Lord is the Most Generous."</p>
            <span>Surah Al-Alaq 96:3</span>
          </div>
        </div>
      </section>

      <section className="pillars-section">
        <div className="section-heading">
          <p className="landing-eyebrow">Core System</p>
          <h2>Everything important, presented with more polish and better rhythm.</h2>
        </div>

        <div className="pillars-grid">
          {pillars.map(({ icon: Icon, title, description }) => (
            <article key={title} className="pillar-card">
              <div className="pillar-icon">
                <Icon size={22} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-band">
        <div className="feature-band-copy">
          <p className="landing-eyebrow">Designed For Focus</p>
          <h2>A calmer first impression for a serious learning environment.</h2>
          <p>
            The landing experience now feels more composed and premium while keeping
            the portal practical, direct, and easy to enter.
          </p>
        </div>

        <div className="feature-band-card">
          <div className="feature-mini-card">
            <GraduationCap size={18} />
            <div>
              <strong>Premium presentation</strong>
              <span>Cleaner spacing and typography with better visual hierarchy.</span>
            </div>
          </div>
          <div className="feature-mini-card">
            <Sparkles size={18} />
            <div>
              <strong>Modern atmosphere</strong>
              <span>Soft gradients, glass surfaces, and restrained motion cues.</span>
            </div>
          </div>
          <div className="feature-mini-card">
            <ShieldCheck size={18} />
            <div>
              <strong>Still practical</strong>
              <span>Clear call to action, readable content, and mobile-safe structure.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

const landingStyles = `
  .landing-shell {
    --landing-surface: rgba(9, 18, 34, 0.72);
    --landing-surface-strong: rgba(10, 21, 40, 0.88);
    --landing-border: rgba(140, 189, 255, 0.16);
    --landing-border-strong: rgba(125, 223, 190, 0.28);
    --landing-text: #eff5ff;
    --landing-muted: #9baec8;
    --landing-accent: #7ddfbe;
    --landing-accent-soft: #c7f2e3;
    --landing-gold: #f0c483;
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    background:
      linear-gradient(rgba(4, 10, 18, 0.8), rgba(4, 10, 18, 0.86)),
      url("/landing-photo.png") center / cover fixed,
      linear-gradient(180deg, #06101d 0%, #091526 100%);
    color: var(--landing-text);
    padding: 28px;
    font-family: var(--font-geist-sans), sans-serif;
  }

  .landing-ambient,
  .landing-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .landing-ambient {
    background:
      linear-gradient(115deg, rgba(125, 223, 190, 0.14), transparent 34%),
      linear-gradient(290deg, rgba(240, 196, 131, 0.12), transparent 28%);
  }

  .landing-grid {
    opacity: 0.36;
    background-image:
      linear-gradient(to right, rgba(132, 156, 194, 0.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(132, 156, 194, 0.08) 1px, transparent 1px);
    background-size: 72px 72px;
  }

  .landing-header,
  .hero-section,
  .pillars-section,
  .feature-band {
    position: relative;
    z-index: 1;
    width: min(1200px, 100%);
    margin: 0 auto;
  }

  .landing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 18px 22px;
    border: 1px solid var(--landing-border);
    border-radius: 18px;
    background: rgba(7, 14, 28, 0.72);
    backdrop-filter: blur(18px);
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.25);
  }

  .landing-brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .landing-brand-mark {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(223, 244, 238, 0.92));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  }

  .landing-brand-mark img,
  .hero-panel-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .landing-eyebrow {
    margin: 0 0 6px;
    font-family: var(--font-space-mono), monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--landing-accent);
  }

  .landing-brand h2,
  .section-heading h2,
  .feature-band-copy h2,
  .hero-panel-card h3 {
    margin: 0;
    font-family: var(--font-playfair), Georgia, serif;
  }

  .landing-brand h2 {
    font-size: 1.05rem;
    color: rgba(239, 245, 255, 0.92);
    font-weight: 600;
  }

  .landing-header-link,
  .hero-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-decoration: none;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .landing-header-link {
    border: 1px solid var(--landing-border);
    border-radius: 999px;
    padding: 12px 18px;
    color: var(--landing-text);
    background: rgba(255, 255, 255, 0.05);
  }

  .landing-header-link:hover,
  .hero-primary:hover {
    transform: translateY(-2px);
  }

  .hero-section {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    gap: 32px;
    align-items: start;
    padding: 56px 0 32px;
  }

  .hero-copy,
  .hero-panel,
  .pillar-card,
  .feature-band-card {
    backdrop-filter: blur(18px);
  }

  .hero-copy {
    padding: 18px 8px 18px 0;
  }

  .hero-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid rgba(125, 223, 190, 0.24);
    border-radius: 999px;
    background: rgba(125, 223, 190, 0.08);
    color: var(--landing-accent-soft);
    font-family: var(--font-space-mono), monospace;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-copy h1 {
    margin: 26px 0 18px;
    max-width: 820px;
    font-family: var(--font-playfair), Georgia, serif;
    font-size: clamp(3rem, 5.2vw, 5.25rem);
    line-height: 1;
    letter-spacing: 0;
  }

  .hero-copy h1 span {
    display: block;
    color: var(--landing-accent-soft);
    font-style: italic;
  }

  .hero-description,
  .feature-band-copy p:last-child {
    max-width: 62ch;
    margin: 0;
    color: var(--landing-muted);
    font-size: 1.02rem;
    line-height: 1.8;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 30px;
  }

  .hero-primary {
    border-radius: 999px;
    padding: 16px 24px;
    background: linear-gradient(135deg, var(--landing-accent) 0%, #98f0cf 100%);
    color: #031017;
    font-weight: 800;
    box-shadow: 0 18px 44px rgba(125, 223, 190, 0.24);
  }

  .hero-trust {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--landing-muted);
    font-size: 0.95rem;
  }

  .hero-highlights {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 40px;
  }

  .hero-highlight-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(7, 14, 28, 0.58);
    color: var(--landing-muted);
    font-size: 0.92rem;
    line-height: 1.65;
  }

  .hero-highlight-dot {
    width: 9px;
    height: 9px;
    margin-top: 6px;
    border-radius: 999px;
    flex: 0 0 auto;
    background: linear-gradient(135deg, var(--landing-accent), var(--landing-gold));
    box-shadow: 0 0 18px rgba(125, 223, 190, 0.45);
  }

  .hero-panel {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-height: 0;
    border: 1px solid var(--landing-border);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(9, 18, 34, 0.9) 0%, rgba(11, 23, 43, 0.78) 100%);
    padding: 28px;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.34);
  }

  .hero-panel-top,
  .hero-panel-card,
  .metric-row > div,
  .feature-mini-card {
    display: flex;
  }

  .hero-panel-top {
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-chip,
  .panel-status {
    font-family: var(--font-space-mono), monospace;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .panel-chip {
    color: var(--landing-accent-soft);
  }

  .panel-status {
    color: var(--landing-gold);
  }

  .hero-panel-card {
    align-items: center;
    gap: 16px;
    padding: 18px;
    border: 1px solid var(--landing-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
  }

  .hero-panel-logo {
    width: 66px;
    height: 66px;
    flex: 0 0 auto;
    border-radius: 8px;
    overflow: hidden;
    padding: 8px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(230, 248, 242, 0.94));
  }

  .hero-panel-card p,
  .metric-row p,
  .feature-mini-card span {
    margin: 0;
    color: var(--landing-muted);
  }

  .hero-panel-card p {
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-panel-card h3 {
    margin-top: 6px;
    font-size: 1.45rem;
    line-height: 1.3;
  }

  .metrics-list {
    display: grid;
    gap: 14px;
  }

  .metric-row {
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
  }

  .metric-row > div {
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }

  .metric-row span {
    color: var(--landing-muted);
    font-size: 0.95rem;
  }

  .metric-row strong {
    font-size: 1.35rem;
    color: var(--landing-accent-soft);
  }

  .metric-row p {
    font-size: 0.88rem;
  }

  .panel-quote {
    margin-top: auto;
    padding: 22px 0 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .panel-quote p {
    margin: 0 0 8px;
    font-family: var(--font-playfair), Georgia, serif;
    font-size: 1.5rem;
    font-style: italic;
    line-height: 1.45;
  }

  .panel-quote span {
    font-family: var(--font-space-mono), monospace;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--landing-gold);
  }

  .pillars-section,
  .feature-band {
    padding: 28px 0 60px;
  }

  .section-heading {
    max-width: 720px;
    margin-bottom: 24px;
  }

  .section-heading h2,
  .feature-band-copy h2 {
    font-size: clamp(2rem, 4vw, 3.4rem);
    line-height: 1.08;
    letter-spacing: 0;
  }

  .pillars-grid,
  .feature-band {
    display: grid;
    gap: 20px;
  }

  .pillars-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pillar-card {
    padding: 28px;
    border: 1px solid var(--landing-border);
    border-radius: 8px;
    background: var(--landing-surface);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  .pillar-card:hover,
  .feature-mini-card:hover {
    transform: translateY(-3px);
    border-color: var(--landing-border-strong);
  }

  .pillar-icon {
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(125, 223, 190, 0.16), rgba(240, 196, 131, 0.12));
    color: var(--landing-accent);
    margin-bottom: 18px;
  }

  .pillar-card h3,
  .feature-mini-card strong {
    margin: 0 0 10px;
    font-family: var(--font-playfair), Georgia, serif;
  }

  .pillar-card h3 {
    font-size: 1.5rem;
  }

  .pillar-card p {
    margin: 0;
    color: var(--landing-muted);
    line-height: 1.75;
  }

  .feature-band {
    grid-template-columns: minmax(0, 0.95fr) minmax(320px, 1.05fr);
    align-items: start;
  }

  .feature-band-card {
    display: grid;
    gap: 16px;
    padding: 22px;
    border: 1px solid var(--landing-border);
    border-radius: 12px;
    background: var(--landing-surface-strong);
  }

  .feature-mini-card {
    align-items: flex-start;
    gap: 14px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--landing-accent);
    transition: transform 180ms ease, border-color 180ms ease;
  }

  .feature-mini-card strong {
    display: block;
    font-size: 1.12rem;
    color: var(--landing-text);
  }

  .feature-mini-card span {
    display: block;
    line-height: 1.7;
  }

  @media (max-width: 980px) {
    .hero-section,
    .feature-band,
    .pillars-grid,
    .hero-highlights {
      grid-template-columns: 1fr;
    }

    .hero-copy {
      padding-right: 0;
    }
  }

  @media (max-width: 720px) {
    .landing-shell {
      padding: 16px;
    }

    .landing-header {
      padding: 18px;
      border-radius: 12px;
      flex-direction: column;
      align-items: flex-start;
    }

    .landing-brand {
      align-items: flex-start;
    }

    .hero-section {
      padding-top: 30px;
      gap: 22px;
    }

    .hero-copy h1 {
      font-size: clamp(2.6rem, 13vw, 4.2rem);
    }

    .hero-actions {
      align-items: flex-start;
      flex-direction: column;
    }

    .hero-panel,
    .pillar-card,
    .feature-band-card {
      border-radius: 12px;
    }
  }
`
