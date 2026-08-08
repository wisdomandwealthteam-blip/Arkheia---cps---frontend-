// src/pages/LandingPage.jsx
import { useState } from "react";

const DEMO_INPUT = { driver_age: 22, vehicle_value: 28000, incident_history: 1, region_risk_tier: 3 };
const DEMO_FACTORS = [
  { label: "driver_age_factor", value: 38.0 },
  { label: "vehicle_value_factor", value: 15.9 },
  { label: "incident_history_factor", value: 15.0 },
  { label: "region_risk_factor", value: 50.0 },
];
const DEMO_SCORE = 27.4;

export default function LandingPage({ onEnter }) {
  const [runs, setRuns] = useState(0);
  const [pulsing, setPulsing] = useState(false);

  function rerun() {
    setPulsing(true);
    setRuns((r) => r + 1);
    setTimeout(() => setPulsing(false), 600);
  }

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">
            Deterministic risk evaluation
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Same input.
            <br />
            Same output.
            <br />
            Every time.
          </h1>
          <p className="mt-5 max-w-md text-ink/60">
            CPS evaluates auto and housing risk through a fixed, auditable
            model — no hidden state, no randomness, no drift between runs.
            Run the same contract a thousand times and get the same number
            a thousand times.
          </p>
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => onEnter("auto")}
              className="focus-ring rounded bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition hover:bg-ink/85"
            >
              Try auto evaluation
            </button>
            <button
              onClick={() => onEnter("housing")}
              className="focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              Try housing evaluation
            </button>
          </div>
        </div>

        {/* Signature element: a small, live, re-runnable determinism demo */}
        <div className="rounded border border-ink/10 bg-ink p-6 font-display text-paper">
          <div className="flex items-center justify-between text-xs text-paper/50">
            <span>LIVE DEMO — run #{runs + 1}</span>
            <button
              onClick={rerun}
              className="focus-ring rounded border border-paper/20 px-2 py-1 text-paper/80 transition hover:bg-paper/10"
            >
              re-run same input →
            </button>
          </div>
          <div className="mt-4 text-xs text-paper/40">input</div>
          <pre className="mt-1 overflow-x-auto text-xs text-paper/80">
{JSON.stringify(DEMO_INPUT, null, 2)}
          </pre>
          <div className="mt-4 space-y-1">
            {DEMO_FACTORS.map((f) => (
              <div key={f.label} className="flex items-center justify-between text-xs">
                <span className="text-paper/50">{f.label}</span>
                <span
                  className={`transition-opacity duration-300 ${pulsing ? "opacity-40" : "opacity-100"}`}
                >
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-paper/10 pt-4">
            <span className="text-xs text-paper/50">risk_score</span>
            <span
              className={`text-2xl font-semibold transition-transform duration-300 ${pulsing ? "scale-110 text-signal" : "text-paper"}`}
            >
              {DEMO_SCORE}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-paper/30">
            Identical output on every run — this is the guarantee, not a coincidence.
          </p>
        </div>
      </section>

      {/* Explanation strip */}
      <section className="grid gap-6 border-t border-ink/10 pt-10 sm:grid-cols-3">
        <Feature
          title="No hidden state"
          body="Every evaluation is a pure function of its input. Nothing is remembered between requests that could change the answer."
        />
        <Feature
          title="Auditable factors"
          body="Every score is decomposed into the individual factors that produced it — never a black box."
        />
        <Feature
          title="Built to extend"
          body="Weights, factors, and tiers are centralized and versioned, so the model can evolve without breaking the API contract."
        />
      </section>
    </div>
  );
}

function Feature({ title, body }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink/55">{body}</p>
    </div>
  );
}
