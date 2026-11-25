// src/pages/LandingPage.jsx
// Mobile-first ARKHEIA DVE™ "Decision Appliance" landing layout
// (PLATFORM-ARCHITECTURE-2026-V1). ClearCheck™ is the primary
// customer-facing entry point: the live 3-step verification module is
// embedded below the fold and the primary CTA scrolls to / focuses it.
import { useState } from "react";
import ClearCheckPage from "./ClearCheckPage";

const PILOT_MAILTO =
  "mailto:admin@aspectsmediagroup.com?subject=ARKHEIA%20DVE%20Pilot%20Request";

// Core verification contract: every run follows the same 5-stage path.
const CONTRACT_STAGES = ["Input", "Verification", "Finding", "Evidence", "Receipt"];

function scrollToClearCheck() {
  const el = document.getElementById("clearcheck-module");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // focus the first field once the scroll has settled
  setTimeout(() => {
    el.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
  }, 600);
}

const pilotMailto = (product) =>
  `mailto:admin@aspectsmediagroup.com?subject=${encodeURIComponent(product)}%20Pilot`;

const BADGE_STYLES = {
  LIVE: "border-risk-low/30 bg-risk-low/10 text-risk-low",
  "ACTIVE API": "border-signal/30 bg-signal/10 text-signal",
  "PILOT READY": "border-risk-moderate/30 bg-risk-moderate/10 text-risk-moderate",
};

const GATE_MODES = [
  {
    label: "1. Pre-Funding API Gate",
    context: "Lenders & Fintechs: Run inline via POST /api/clearcheck before funds release. Returns a deterministic PASS / HOLD SHA-256 receipt (chk_...) to block statutory or accounting mismatches automatically.",
    output: "Expected Gate Output: Automated PASS / HOLD Underwriting Receipt",
  },
  {
    label: "2. Clean-File Certificate (Auto & Housing)",
    context: "Auto Dealers, Mortgage Brokers & Leasing Offices: Certify borrower packets prior to lender submission to prove zero mathematical or statutory defects and eliminate underwriting kickbacks.",
    output: "Expected Gate Output: Attachable Clean-File Verification Certificate",
  },
  {
    label: "3. DVE™ Pipeline Stage 1",
    context: "Enterprise Platforms: Sanitize PII in-browser and enforce statutory rules at intake before chaining verified payloads into GovernanceCheck™ and SettlementCheck™.",
    output: "Expected Gate Output: Canonical Stage 1 Digest for Downstream DVE™ Engines",
  },
];

export default function LandingPage({ onEnter, apiKey, trialSessionId }) {
  const products = [
    {
      name: "ClearCheck™",
      useCase: "Pre-Submission Record & Underwriting Gate — Certify borrower packets, block defective payloads before funding, and sanitize Stage 1 pipeline inputs.",
      badge: "LIVE",
      body: "Report & intake consistency verification. Enter your records, preview a redacted consistency check, then unlock the full evidence report — identifiers are masked locally before anything leaves your device.",
      action: { label: "Run ClearCheck →", onClick: scrollToClearCheck },
    },
    {
      name: "RiskCheck™",
      useCase: "Pre-execution exposure scoring and automated policy gating before capital or contracts move.",
      badge: "ACTIVE API",
      body: "Deterministic Auto & Housing risk verification over the /risk/auto and /risk/housing APIs. Every score is decomposed into the factors that produced it — the same contract always returns the same number.",
      action: { label: "Open RiskCheck evaluator →", onClick: () => onEnter("auto") },
    },
    {
      name: "SettlementCheck™",
      useCase: "Deterministic ledger and payment reconciliation with SHA-256 settlement receipts.",
      badge: "PILOT READY",
      body: "Royalty, revenue-share & treasury allocation verification. Confirm every distribution matches the agreement it came from before funds move.",
      action: { label: "Request Pilot →", href: pilotMailto("SettlementCheck") },
    },
    {
      name: "ProvenanceCheck™",
      useCase: "Cryptographic origin, licensing, and royalty chain verification for digital and media assets.",
      badge: "PILOT READY",
      body: "Dependency, software & document lineage verification. Prove where artifacts came from, who touched them, and that nothing changed along the way.",
      action: { label: "Request Pilot →", href: pilotMailto("ProvenanceCheck") },
    },
    {
      name: "GovernanceCheck™",
      useCase: "Policy enforcement and deterministic guardrails for enterprise AI model outputs.",
      badge: "PILOT READY",
      body: "Multi-signature & custody authorization verification. Confirm that every action was signed by the right parties under the right policy before it executes.",
      action: { label: "Request Pilot →", href: pilotMailto("GovernanceCheck") },
    },
    {
      name: "EdgeVerify™",
      useCase: "Offline-capable, zero-dependency verification receipts for local nodes and field hardware.",
      badge: "PILOT READY",
      body: "Hardware state, sensor & controlled execution verification. Verify device readings and execution conditions at the edge before decisions depend on them.",
      action: { label: "Request Pilot →", href: pilotMailto("EdgeVerify") },
    },
  ];

  return (
    <div className="space-y-16">
      {/* Hero card */}
      <div className="space-y-4">
        <section className="mx-auto max-w-2xl rounded-lg border border-ink/10 bg-white p-6 text-center shadow-sm sm:p-10 md:max-w-none md:text-left">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">
            ARKHEIA DVE™ · DETERMINISTIC VERIFICATION ENGINE
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Verify records.
            <br />
            Verify transactions.
            <br />
            Verify AI outputs.
          </h1>
          <p className="mt-4 font-display text-lg font-semibold leading-snug text-signal sm:text-xl">
            Verification Infrastructure for High-Trust Systems
          </p>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/70 md:mx-0">
            Stop defective underwriting files, un-auditable AI outputs, and settlement discrepancies before money moves or compliance audits fail.
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

        {/* Verifiable engineering evidence — not customer claims */}
        <section aria-label="Verifiable system proof" className="rounded-lg border border-ink/10 bg-white">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col bg-white p-5">
              <dt className="order-2 mt-2 text-xs leading-relaxed text-ink/65">Automated deterministic &amp; billing test assertions passing</dt>
              <dd className="order-1 font-display text-2xl font-semibold text-ink">272 / 272</dd>
            </div>
            <div className="flex flex-col bg-white p-5">
              <dt className="order-2 mt-2 text-xs leading-relaxed text-ink/65">Reproducible output parity (same input, same output, every run)</dt>
              <dd className="order-1 font-display text-2xl font-semibold text-ink">100%</dd>
            </div>
            <div className="flex flex-col bg-white p-5">
              <dt className="order-2 mt-2 text-xs leading-relaxed text-ink/65">Raw PII persisted or used for AI model training</dt>
              <dd className="order-1 font-display text-2xl font-semibold text-ink">Zero</dd>
            </div>
            <div className="flex flex-col bg-white p-5">
              <dt className="order-2 mt-2 text-xs leading-relaxed text-ink/65">Cryptographically signed audit receipt (<code>chk_...</code>) on every check</dt>
              <dd className="order-1 font-display text-2xl font-semibold text-ink">SHA-256</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Core verification contract strip */}
      <section aria-label="Core verification contract" className="border-t border-ink/10 pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-ink/50">
            Core Verification Contract
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 font-display text-[11px] font-medium uppercase tracking-wide text-signal">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            AI Explains. ARKHEIA Verifies.
          </span>
        </div>
        <ol className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-x-4">
          {CONTRACT_STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-x-3 sm:gap-x-4">
              <span className="inline-flex items-center gap-2 rounded border border-ink/15 bg-white px-3 py-2 font-display text-xs font-semibold text-ink sm:px-4 sm:text-sm">
                <span className="font-normal text-signal">{String(i + 1).padStart(2, "0")}</span>
                {stage}
              </span>
              {i < CONTRACT_STAGES.length - 1 && (
                <span aria-hidden="true" className="text-ink/25">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* One Engine. Six Solutions. — mobile accordion */}
      <section aria-labelledby="solutions-heading" className="border-t border-ink/10 pt-10">
        <div aria-label="Built for high-trust teams" className="mb-8 flex flex-wrap items-center gap-3">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">
            BUILT FOR HIGH-TRUST TEAMS:
          </p>
          <ul className="flex flex-wrap gap-2">
            {[
              "Fintech & Lending Underwriters",
              "Auto & Mortgage Brokerages",
              "Enterprise AI Governance Leads",
              "Payment & Treasury Operations",
            ].map((team) => (
              <li key={team} className="rounded-full border border-ink/15 bg-white px-3 py-1.5 font-display text-xs font-medium text-ink/75">
                {team}
              </li>
            ))}
          </ul>
        </div>
        <h2
          id="solutions-heading"
          className="font-display text-xl font-semibold text-ink"
        >
          One Engine. Six Solutions.
        </h2>
        <p className="mt-2 max-w-xl text-sm text-ink/55">
          Every product below runs on the same Deterministic Verification
          Engine — one fixed contract, six domains of proof.
        </p>
        <ProductAccordion products={products} />
      </section>

      {/* Concrete catch before the live pre-funding gate */}
      <section aria-labelledby="verification-scenario-heading" className="rounded-lg border border-signal/25 bg-white p-6 shadow-sm sm:p-8">
        <p className="font-display text-xs uppercase tracking-[0.15em] text-signal">
          REAL VERIFICATION SCENARIO · PRE-FUNDING GATE
        </p>
        <h2 id="verification-scenario-heading" className="mt-3 font-display text-xl font-semibold leading-snug text-ink">
          How ARKHEIA Catches a Costly Defect Before Funding
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/70">
          An incoming underwriting payload reports a past-due amount exceeding the total account balance—a statutory accuracy conflict under 15 U.S.C. § 1681 that triggers lender kickbacks and compliance exposure.
        </p>
        <p className="mt-5 rounded border border-signal/20 bg-signal/5 p-4 text-sm leading-relaxed text-ink/80">
          ClearCheck™ redacts PII in-browser, flags <code className="break-all font-semibold text-signal">PAST_DUE_EXCEEDS_BALANCE</code> in milliseconds, and issues a signed <strong className="font-display text-ink">GATE: HOLD</strong> receipt (<code className="break-all">chk_0cfa2d...</code>) before capital moves.
        </p>
      </section>

      {/* Live ClearCheck™ module */}
      <section
        id="clearcheck-module"
        aria-labelledby="clearcheck-heading"
        className="scroll-mt-24 border-t border-ink/10 pt-10"
      >
        <p className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-signal">
          CLEARCHECK™ · DETERMINISTIC INTAKE & UNDERWRITING GATE
        </p>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h2
            id="clearcheck-heading"
            className="font-display text-xl font-semibold text-ink"
          >
            Stop defective records before capital moves or audits fail.
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
        <ClearCheckPage
          apiKey={apiKey}
          trialSessionId={trialSessionId}
          inputContext={<InstitutionalGateSelector />}
        />
      </section>
    </div>
  );
}

export function InstitutionalGateSelector() {
  const [activeMode, setActiveMode] = useState(0);

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Institutional gate mode" className="flex flex-wrap gap-2 rounded border border-ink/10 bg-white p-2">
        {GATE_MODES.map((mode, index) => (
          <button
            key={mode.label}
            type="button"
            aria-pressed={activeMode === index}
            aria-controls="gate-mode-context"
            onClick={() => setActiveMode(index)}
            className={`focus-ring flex-1 rounded px-3 py-2 text-left font-display text-xs font-medium transition ${
              activeMode === index ? "bg-ink text-paper" : "text-ink/60 hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div id="gate-mode-context" role="status" aria-live="polite" className="rounded border border-signal/25 bg-signal/5 p-4">
        <p className="text-sm leading-relaxed text-ink/75">{GATE_MODES[activeMode].context}</p>
        <p className="mt-3 font-display text-xs font-semibold text-signal">{GATE_MODES[activeMode].output}</p>
      </div>
    </div>
  );
}

function ProductAccordion({ products }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="mt-6 divide-y divide-ink/10 rounded-lg border border-ink/10 bg-white">
      {products.map((p, i) => {
        const open = openIndex === i;
        const panelId = `product-panel-${i}`;
        const buttonId = `product-button-${i}`;
        return (
          <div key={p.name}>
            <h3>
              <button
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? -1 : i)}
                className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
              >
                <span className="flex items-center gap-3">
                  <span className="font-display text-sm font-semibold text-ink sm:text-base">
                    {p.name}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[11px] font-medium uppercase tracking-wide ${BADGE_STYLES[p.badge]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {p.badge}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </button>
            </h3>
            <p className="px-4 pb-4 text-sm text-ink/55 sm:px-5">{p.useCase}</p>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!open}
              className="px-4 pb-5 sm:px-5"
            >
              <p className="text-sm text-ink/55">{p.body}</p>
              {p.action.href ? (
                <a
                  href={p.action.href}
                  className="focus-ring mt-3 inline-block font-display text-sm font-medium text-signal transition hover:text-signal/80"
                >
                  {p.action.label}
                </a>
              ) : (
                <button
                  onClick={p.action.onClick}
                  className="focus-ring mt-3 font-display text-sm font-medium text-signal transition hover:text-signal/80"
                >
                  {p.action.label}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
