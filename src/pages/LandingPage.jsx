// src/pages/LandingPage.jsx
// Mobile-first ARKHEIA DVE™ landing layout. ClearCheck™ is the primary
// customer-facing entry point: the live 3-step verification module is
// embedded below the fold and the primary CTA scrolls to / focuses it.
import ClearCheckPage from "./ClearCheckPage";

const PILOT_MAILTO =
  "mailto:admin@aspectsmediagroup.com?subject=ARKHEIA%20DVE%20Pilot%20Request";

const FLOW_STEPS = [
  {
    n: "01",
    title: "Input",
    body: "Enter the records you need checked. Sensitive identifiers are masked in your browser before anything is sent.",
  },
  {
    n: "02",
    title: "Verify",
    body: "The Deterministic Verification Engine runs the same fixed checks on every submission — identical input, identical result, every time.",
  },
  {
    n: "03",
    title: "Evidence",
    body: "Get a clear, itemized findings report you can act on — every conclusion traces back to the exact records that produced it.",
  },
];

function scrollToClearCheck() {
  const el = document.getElementById("clearcheck-module");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // focus the first field once the scroll has settled
  setTimeout(() => {
    el.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
  }, 600);
}

export default function LandingPage({ onEnter, apiKey }) {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="mx-auto max-w-2xl text-center md:max-w-none md:text-left">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">
          ARKHEIA DVE™ — Deterministic Verification Engine
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Verify First.
          <br />
          Decide Second.
        </h1>
        <p className="mt-5 max-w-xl text-ink/60 md:mx-0">
          Before you dispute, settle, underwrite, or ship — run the records
          through a verification engine that gives the same answer on the
          same input, every single time. No guesswork. No drift. Just
          evidence you can stand behind.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
          <button
            onClick={scrollToClearCheck}
            className="focus-ring rounded bg-ink px-6 py-3 font-display text-sm font-medium text-paper transition hover:bg-ink/85"
          >
            Run ClearCheck
          </button>
          <a
            href={PILOT_MAILTO}
            className="focus-ring rounded border border-ink/20 px-6 py-3 text-center font-display text-sm font-medium text-ink transition hover:bg-ink/5"
          >
            Request Pilot
          </a>
        </div>
      </section>

      {/* 3-step flow: Input → Verify → Evidence */}
      <section aria-label="How it works" className="border-t border-ink/10 pt-10">
        <ol className="grid gap-6 sm:grid-cols-3">
          {FLOW_STEPS.map((s, i) => (
            <li key={s.n} className="relative">
              <div className="flex items-center gap-3">
                <span className="font-display text-xs text-signal">{s.n}</span>
                <h3 className="font-display text-sm font-semibold text-ink">
                  {s.title}
                </h3>
                {i < FLOW_STEPS.length - 1 && (
                  <span aria-hidden="true" className="hidden text-ink/20 sm:inline">
                    →
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-ink/55">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Solutions powered by DVE™ */}
      <section aria-labelledby="solutions-heading" className="border-t border-ink/10 pt-10">
        <h2
          id="solutions-heading"
          className="font-display text-xs uppercase tracking-[0.2em] text-ink/50"
        >
          Solutions Powered by DVE™
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <SolutionCard
            name="ClearCheck™"
            badge="Live"
            badgeClass="border-risk-low/30 bg-risk-low/10 text-risk-low"
            body="Consumer record verification in three steps: enter your accounts, preview a redacted consistency check, then unlock the full evidence report. Identifiers are masked locally before anything leaves your device."
            action={{ label: "Run ClearCheck →", onClick: scrollToClearCheck }}
          />
          <SolutionCard
            name="RiskCheck™"
            badge="Active API"
            badgeClass="border-signal/30 bg-signal/10 text-signal"
            body="Deterministic auto and housing risk scoring over the /risk/auto and /risk/housing APIs. Every score is decomposed into the factors that produced it — the same contract always returns the same number."
            action={{ label: "Explore scoring →", onClick: () => onEnter("auto") }}
          />
          <SolutionCard
            name="SettlementCheck™"
            badge="Enterprise Pilot"
            badgeClass="border-risk-moderate/30 bg-risk-moderate/10 text-risk-moderate"
            body="Revenue-sharing, royalty, and treasury verification for finance teams — confirm that every distribution matches the agreement it came from before funds move."
            action={{ label: "Request Pilot →", href: PILOT_MAILTO }}
          />
          <SolutionCard
            name="ProvenanceCheck™"
            badge="Enterprise Pilot"
            badgeClass="border-risk-moderate/30 bg-risk-moderate/10 text-risk-moderate"
            body="Software supply-chain and evidence lineage verification — prove where artifacts came from, who touched them, and that nothing changed along the way."
            action={{ label: "Request Pilot →", href: PILOT_MAILTO }}
          />
        </div>
      </section>

      {/* Live ClearCheck™ module */}
      <section
        id="clearcheck-module"
        aria-labelledby="clearcheck-heading"
        className="scroll-mt-24 border-t border-ink/10 pt-10"
      >
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h2
            id="clearcheck-heading"
            className="font-display text-xl font-semibold text-ink"
          >
            ClearCheck™ — live verification
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-risk-low/30 bg-risk-low/10 px-3 py-1 font-display text-xs font-medium uppercase tracking-wide text-risk-low">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Live
          </span>
        </div>
        <p className="mb-6 max-w-xl text-sm text-ink/55">
          Three steps: enter your records, review the redacted preview, unlock
          the full report. Account numbers are masked in your browser before
          submission — raw identifiers never leave this device.
        </p>
        <ClearCheckPage apiKey={apiKey} />
      </section>
    </div>
  );
}

function SolutionCard({ name, badge, badgeClass, body, action }) {
  return (
    <div className="flex flex-col rounded border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">{name}</h3>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[11px] font-medium uppercase tracking-wide ${badgeClass}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {badge}
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-ink/55">{body}</p>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="focus-ring mt-4 self-start font-display text-sm font-medium text-signal transition hover:text-signal/80"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="focus-ring mt-4 self-start font-display text-sm font-medium text-signal transition hover:text-signal/80"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
