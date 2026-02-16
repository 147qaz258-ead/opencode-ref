import "./landing.css"
import { createSignal, onMount, onCleanup, For, Show, type Component } from "solid-js"
import { A } from "@solidjs/router"
import { Title, Meta } from "@solidjs/meta"
import { useAuth } from "@/context/auth"

/* ─── Data ────────────────────────────────────────────────────────── */

const scrollySteps = [
  {
    tag: "01 — Autonomous Swarms",
    title: "Orchestrate. \nDon't just prompt.",
    desc: "Clawdone agents don't work in isolation. They form autonomous swarms that decompose complex visions into executable micro-tasks, delivering a finished project while you stay in the flow of creation.",
    screen: "code",
  },
  {
    tag: "02 — The Agent Market",
    title: "Trade & Deploy\nIntelligence.",
    desc: "Access a global marketplace of specialized agents. From high-frequency trading logic to complex front-end engineering, deploy pre-conditioned swarms in a single click.",
    screen: "terminal",
  },
  {
    tag: "03 — Measured Impact",
    title: "Watch Value\nCrystalize.",
    desc: "Experience real-time visual verification. Every autonomous action is logged, recorded, and verified via VNC, ensuring the outcome matches your vision exactly.",
    screen: "vnc",
  },
]

const bentoCards = [
  {
    icon: "🐝",
    title: "Swarm Orchestrator",
    desc: "Multi-agent coordination logic that self-corrects and adapts to complex requirements. True autonomy at scale.",
    span: 2,
  },
  {
    icon: "🏪",
    title: "Digital Market",
    desc: "Bootstrap your ideas with the Clawdone Agent Market. Community-vetted intelligence for every niche.",
    span: 2,
  },
  {
    icon: "💎",
    title: "Value Registry",
    desc: "Track every hour saved and every project delivered. Clawdone is built for ROI, not just interaction.",
    span: 1,
  },
  {
    icon: "🧬",
    title: "Evolutionary Learning",
    desc: "Your swarms get smarter with every task. Persistent memory ensures the context of your vision is never lost.",
    span: 1,
  },
  {
    icon: "🔒",
    title: "Safe Haven",
    desc: "High-level security with isolated Docker sandboxes. Your data stays yours; your swarms stay in their lane.",
    span: 1,
  },
  {
    icon: "🌊",
    title: "Zero-Touch Flow",
    desc: "From idea to 'Done' with zero friction. Let the swarm handle the infrastructure while you handle the future.",
    span: 1,
  },
]

/* ─── Terminal / Code Mock Content ─────────────────────────────── */

const codeLines = [
  { text: "import ", cls: "ok-term-keyword" },
  { text: "{ Agent, Sandbox }", cls: "ok-term-text" },
  { text: " from ", cls: "ok-term-keyword" },
  { text: "'@openkore/sdk'", cls: "ok-term-string" },
]

const terminalLines = [
  { prompt: "agent@sandbox", cmd: "npm install && npm run build" },
  { output: "added 847 packages in 12.3s" },
  { prompt: "agent@sandbox", cmd: "docker compose up -d" },
  { output: "✓ Container postgres started" },
  { output: "✓ Container redis started" },
  { output: "✓ Container app started" },
  { prompt: "agent@sandbox", cmd: "npm run test -- --coverage" },
  { output: "Tests: 42 passed, 42 total" },
  { output: "Coverage: 94.2% statements" },
]

/* ─── Component ───────────────────────────────────────────────── */

const LandingPage: Component = () => {
  const auth = useAuth()
  const [activeStep, setActiveStep] = createSignal(0)
  let stepsRef: HTMLDivElement | undefined
  let stepElements: HTMLDivElement[] = []

  // IntersectionObserver for scroll-triggered entrance animations
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("ok-visible")
          }
        })
      },
      { threshold: 0.15 }
    )
    document.querySelectorAll(".ok-observe").forEach((el) => observer.observe(el))
    onCleanup(() => observer.disconnect())
  })

  // Scrollytelling: track which step is centered in viewport
  onMount(() => {
    const onScroll = () => {
      const midY = window.innerHeight * 0.45
      let closest = 0
      let closestDist = Infinity
      stepElements.forEach((el, i) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const dist = Math.abs(center - midY)
        if (dist < closestDist) {
          closestDist = dist
          closest = i
        }
      })
      setActiveStep(closest)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onCleanup(() => window.removeEventListener("scroll", onScroll))
  })

  return (
    <div class="landing-page">
      {/* SEO */}
      <Title>Clawdone — Automate Your Work, Reclaim Your Life</Title>
      <Meta name="description" content="Clawdone: The epoch of autonomous execution. Orchestrate intelligent swarms to deliver finished results, giving you the freedom to focus on your highest visions." />
      <Meta property="og:title" content="Clawdone — Automate Your Work, Reclaim Your Life" />
      <Meta property="og:description" content="Done, Not Just Assisted. Orchestrate autonomous agent swarms to get the job done." />
      <Meta property="og:type" content="website" />

      {/* ─── Navigation ─── */}
      <nav class="ok-nav">
        <a class="ok-nav-brand" href="/">
          <div class="ok-nav-brand-icon">C</div>
          <span>Clawdone</span>
        </a>
        <ul class="ok-nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#capabilities">Capabilities</a></li>
        </ul>
        <Show
          when={auth.isAuthenticated}
          fallback={
            <A href="/login" class="ok-nav-cta" data-testid="sign-in-button">
              Sign In →
            </A>
          }
        >
          <div class="ok-nav-user">
            <A href="/home" class="ok-nav-cta" data-testid="dashboard-button">
              Dashboard →
            </A>
          </div>
        </Show>
      </nav>

      {/* ─── Hero ─── */}
      <section class="ok-hero">
        <div class="ok-hero-bg">
          <div class="ok-hero-orb ok-hero-orb--1" />
          <div class="ok-hero-orb ok-hero-orb--2" />
          <div class="ok-hero-orb ok-hero-orb--3" />
        </div>

        <div class="ok-hero-content">
          {/* Left – Copy */}
          <div class="ok-hero-text ok-anim-up ok-observe">
            <div class="ok-badge ok-anim-up ok-d1">
              <span class="ok-badge-dot" />
              Now in Public Beta
            </div>
            <h1 class="ok-anim-up ok-d2">
              Automate Your Work, <br />
              <span class="ok-gradient">Reclaim Your Life</span>
            </h1>
            <p class="ok-hero-sub ok-anim-up ok-d3">
              Beyond tools, beyond assistance. Clawdone orchestrates intelligent agent swarms to deliver finished results, giving you the freedom to build what matters.
            </p>
            <div class="ok-hero-ctas ok-anim-up ok-d4">
              <Show
                when={auth.isAuthenticated}
                fallback={
                  <A href="/login" class="ok-btn-primary" data-testid="sign-in-button">
                    Sign In to Get Started →
                  </A>
                }
              >
                <A href="/home" class="ok-btn-primary" data-testid="dashboard-button">
                  Go to Dashboard →
                </A>
              </Show>
              <a href="#how-it-works" class="ok-btn-secondary">
                See How It Works
              </a>
            </div>
          </div>

          {/* Right – 3D Mock Interface */}
          <div class="ok-hero-visual ok-anim-up ok-d5">
            <div class="ok-mock-wrapper">
              <div class="ok-mock-window">
                <div class="ok-mock-titlebar">
                  <div class="ok-mock-dot ok-mock-dot--red" />
                  <div class="ok-mock-dot ok-mock-dot--yellow" />
                  <div class="ok-mock-dot ok-mock-dot--green" />
                  <span class="ok-mock-titlebar-title">Clawdone — Autonomous Swarm Session</span>
                </div>
                <div class="ok-mock-body">
                  <div class="ok-mock-sidebar">
                    <div class="ok-mock-sidebar-dot active" />
                    <div class="ok-mock-sidebar-dot" />
                    <div class="ok-mock-sidebar-dot" />
                    <div class="ok-mock-sidebar-dot" />
                  </div>
                  <div class="ok-mock-main">
                    <div class="ok-term-line">
                      <span class="ok-term-prompt">agent@sandbox:~$</span>{" "}
                      <span class="ok-term-cmd">create-react-app my-project</span>
                    </div>
                    <div class="ok-term-line">
                      <span class="ok-term-output">Creating a new React app in /workspace/my-project...</span>
                    </div>
                    <div class="ok-term-line">
                      <span class="ok-term-output">Installing packages: react, react-dom, react-scripts</span>
                    </div>
                    <div class="ok-term-line">
                      <span class="ok-term-output">✓ Project scaffolded successfully</span>
                    </div>
                    <div class="ok-term-line" style={{ "margin-top": "12px" }}>
                      <span class="ok-term-prompt">agent@sandbox:~$</span>{" "}
                      <span class="ok-term-cmd">npm run dev</span>
                    </div>
                    <div class="ok-term-line">
                      <span class="ok-term-output">VITE v5.0 ready in 320ms</span>
                    </div>
                    <div class="ok-term-line">
                      <span class="ok-term-output">➜ Local: http://localhost:3000/</span>
                    </div>
                    <div class="ok-term-line" style={{ "margin-top": "12px" }}>
                      <span class="ok-term-prompt">agent@sandbox:~$</span>{" "}
                      <span class="ok-cursor" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Scrollytelling: How It Works ─── */}
      <section id="how-it-works" style={{ background: "var(--ok-bg)" }}>
        <div class="ok-section" style={{ "padding-bottom": "20px" }}>
          <div class="ok-section-header ok-observe">
            <div class="ok-section-tag">⚡ How It Works</div>
            <h2 class="ok-section-title">From Prompt to Production</h2>
            <p class="ok-section-desc">
              One natural-language instruction triggers a fully autonomous pipeline —
              code generation, execution, and verification.
            </p>
          </div>
        </div>

        <div class="ok-scrolly" ref={stepsRef}>
          <div class="ok-scrolly-container">
            {/* Left – Text Steps */}
            <div class="ok-scrolly-steps">
              <For each={scrollySteps}>
                {(step, i) => (
                  <div
                    ref={(el) => (stepElements[i()] = el)}
                    class={`ok-scrolly-step ${activeStep() === i() ? "ok-step-active" : ""}`}
                  >
                    <div class="ok-scrolly-step-tag">{step.tag}</div>
                    <h3>{step.title}</h3>
                    <p>{step.desc}</p>
                  </div>
                )}
              </For>
            </div>

            {/* Right – Sticky Mock UI */}
            <div class="ok-scrolly-visual">
              <div class="ok-scrolly-mock">
                <div class="ok-mock-window">
                  <div class="ok-mock-titlebar">
                    <div class="ok-mock-dot ok-mock-dot--red" />
                    <div class="ok-mock-dot ok-mock-dot--yellow" />
                    <div class="ok-mock-dot ok-mock-dot--green" />
                    <span class="ok-mock-titlebar-title">
                      {scrollySteps[activeStep()]?.screen === "code"
                        ? "code-editor.ts"
                        : scrollySteps[activeStep()]?.screen === "terminal"
                          ? "terminal — bash"
                          : "vnc — desktop"}
                    </span>
                  </div>
                  <div class="ok-mock-body" style={{ display: "block", padding: "20px" }}>
                    {/* Screen: Code Editor */}
                    <div class={`ok-screen ${activeStep() === 0 ? "ok-screen-active" : ""}`}>
                      <div class="ok-term-line">
                        <span class="ok-term-comment">{"// Agent-generated code"}</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-keyword">import </span>
                        <span class="ok-term-text">{"{ Agent, Sandbox }"}</span>
                        <span class="ok-term-keyword"> from </span>
                        <span class="ok-term-string">'@openkore/sdk'</span>
                      </div>
                      <div class="ok-term-line">&nbsp;</div>
                      <div class="ok-term-line">
                        <span class="ok-term-keyword">const </span>
                        <span class="ok-term-text">agent</span>
                        <span class="ok-term-keyword"> = </span>
                        <span class="ok-term-keyword">new </span>
                        <span class="ok-term-text">Agent</span>
                        <span class="ok-term-text">{"({"}</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-text">{"  model: "}</span>
                        <span class="ok-term-string">"claude-sonnet-4-20250514"</span>
                        <span class="ok-term-text">,</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-text">{"  sandbox: "}</span>
                        <span class="ok-term-keyword">new </span>
                        <span class="ok-term-text">Sandbox</span>
                        <span class="ok-term-text">{"({ image: "}</span>
                        <span class="ok-term-string">"node:20"</span>
                        <span class="ok-term-text">{" })"}</span>
                        <span class="ok-term-text">,</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-text">{"  skills: ["}</span>
                        <span class="ok-term-string">"file-io"</span>
                        <span class="ok-term-text">{", "}</span>
                        <span class="ok-term-string">"web-scraper"</span>
                        <span class="ok-term-text">{"]"}</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-text">{"})"}</span>
                      </div>
                      <div class="ok-term-line">&nbsp;</div>
                      <div class="ok-term-line">
                        <span class="ok-term-keyword">await </span>
                        <span class="ok-term-text">agent.run</span>
                        <span class="ok-term-text">(</span>
                        <span class="ok-term-string">"Build a REST API with user auth"</span>
                        <span class="ok-term-text">)</span>
                        <span class="ok-cursor" />
                      </div>
                    </div>

                    {/* Screen: Terminal */}
                    <div class={`ok-screen ${activeStep() === 1 ? "ok-screen-active" : ""}`}>
                      <For each={terminalLines}>
                        {(line) => (
                          <div class="ok-term-line">
                            <Show when={line.prompt}>
                              <span class="ok-term-green">{line.prompt}:~$ </span>
                              <span class="ok-term-cmd">{line.cmd}</span>
                            </Show>
                            <Show when={line.output}>
                              <span class="ok-term-output">{line.output}</span>
                            </Show>
                          </div>
                        )}
                      </For>
                      <div class="ok-term-line" style={{ "margin-top": "12px" }}>
                        <span class="ok-term-green">agent@sandbox:~$ </span>
                        <span class="ok-cursor" />
                      </div>
                    </div>

                    {/* Screen: VNC Desktop */}
                    <div class={`ok-screen ${activeStep() === 2 ? "ok-screen-active" : ""}`}>
                      <div style={{
                        background: "linear-gradient(135deg, #2d3748, #4a5568)",
                        "border-radius": "8px",
                        padding: "16px",
                        "margin-bottom": "12px",
                        "min-height": "200px",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px"
                      }}>
                        {/* Fake browser bar */}
                        <div style={{
                          background: "rgba(255,255,255,0.08)",
                          "border-radius": "6px",
                          padding: "8px 12px",
                          display: "flex",
                          "align-items": "center",
                          gap: "8px"
                        }}>
                          <div style={{
                            display: "flex",
                            gap: "4px"
                          }}>
                            <div style={{ width: "6px", height: "6px", "border-radius": "50%", background: "rgba(255,255,255,0.2)" }} />
                            <div style={{ width: "6px", height: "6px", "border-radius": "50%", background: "rgba(255,255,255,0.2)" }} />
                            <div style={{ width: "6px", height: "6px", "border-radius": "50%", background: "rgba(255,255,255,0.2)" }} />
                          </div>
                          <div style={{
                            flex: "1",
                            background: "rgba(255,255,255,0.05)",
                            "border-radius": "4px",
                            padding: "4px 10px",
                            "font-size": "11px",
                            "font-family": "var(--ok-mono)",
                            color: "rgba(255,255,255,0.4)"
                          }}>
                            https://localhost:3000
                          </div>
                        </div>
                        {/* Fake page content */}
                        <div style={{
                          flex: "1",
                          background: "rgba(255,255,255,0.03)",
                          "border-radius": "4px",
                          padding: "16px",
                          display: "flex",
                          "flex-direction": "column",
                          gap: "8px"
                        }}>
                          <div style={{ width: "60%", height: "10px", background: "rgba(255,255,255,0.1)", "border-radius": "4px" }} />
                          <div style={{ width: "80%", height: "8px", background: "rgba(255,255,255,0.06)", "border-radius": "4px" }} />
                          <div style={{ width: "45%", height: "8px", background: "rgba(255,255,255,0.06)", "border-radius": "4px" }} />
                          <div style={{
                            "margin-top": "8px",
                            display: "grid",
                            "grid-template-columns": "1fr 1fr",
                            gap: "8px"
                          }}>
                            <div style={{ height: "48px", background: "rgba(255,107,53,0.15)", "border-radius": "6px" }} />
                            <div style={{ height: "48px", background: "rgba(124,92,252,0.12)", "border-radius": "6px" }} />
                          </div>
                        </div>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-comment">{"// Agent observing rendered output via VNC..."}</span>
                      </div>
                      <div class="ok-term-line">
                        <span class="ok-term-green">✓ </span>
                        <span class="ok-term-output">Visual check passed — UI matches spec</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bento Grid: Capabilities ─── */}
      <section id="capabilities" style={{ background: "var(--ok-bg-warm)" }}>
        <div class="ok-section">
          <div class="ok-section-header ok-observe">
            <div class="ok-section-tag">🧱 Capabilities</div>
            <h2 class="ok-section-title">Everything Agents Need</h2>
            <p class="ok-section-desc">
              A complete runtime for autonomous software agents — from isolated execution to persistent state.
            </p>
          </div>

          <div class="ok-bento">
            <For each={bentoCards}>
              {(card, i) => (
                <div
                  class={`ok-bento-card ok-observe ${card.span === 2 ? "ok-bento-card--2x" : ""}`}
                  style={{ "transition-delay": `${i() * 0.06}s` }}
                >
                  <div class="ok-bento-icon">{card.icon}</div>
                  <h4>{card.title}</h4>
                  <p>{card.desc}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section class="ok-cta-section">
        <div class="ok-cta-glow" />
        <div class="ok-cta-inner ok-observe">
          <h2>Ready to Build with <span class="ok-gradient">Intelligent Agents</span>?</h2>
          <p>Start orchestrating autonomous agents in minutes. No infrastructure required.</p>
          <div style={{ display: "flex", gap: "12px", "justify-content": "center", "flex-wrap": "wrap" }}>
            <A href="/home" class="ok-btn-primary">
              Launch Dashboard →
            </A>
            <a href="https://github.com" target="_blank" class="ok-btn-secondary">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer class="ok-footer">
        <div class="ok-footer-inner">
          <div class="ok-footer-brand">
            <div class="ok-nav-brand-icon" style={{ width: "24px", height: "24px", "font-size": "12px", "border-radius": "6px" }}>C</div>
            <span>© {new Date().getFullYear()} Clawdone. Done, Not Just Assisted.</span>
          </div>
          <ul class="ok-footer-links">
            <li><a href="https://github.com" target="_blank">GitHub</a></li>
            <li><a href="#">Documentation</a></li>
            <li><a href="#">Changelog</a></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
