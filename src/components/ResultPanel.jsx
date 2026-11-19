// src/components/ResultPanel.jsx
import RiskTierBadge from "./RiskTierBadge";
import JurisdictionMeta from "./JurisdictionMeta";

const SEVERITY_STYLES = {
  low: "bg-risk-low/10 text-risk-low border-risk-low/30",
  medium: "bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30",
  high: "bg-risk-high/10 text-risk-high border-risk-high/30",
};

function SeverityBadge({ severity }) {
  const style =
    SEVERITY_STYLES[String(severity).toLowerCase()] ||
    "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[11px] font-medium uppercase tracking-wide ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
    </span>
  );
}

export default function ResultPanel({ result, error, loading, variant = "risk" }) {
  if (loading) {
    return (
      <div className="rounded border border-ink/10 bg-white p-6 text-sm text-ink/50">
        {variant === "clearcheck" ? "Loading report..." : "Evaluating..."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-risk-high/30 bg-risk-high/5 p-6">
        <p className="font-display text-sm font-medium text-risk-high">
          {variant === "clearcheck" ? "Report unavailable" : "Evaluation failed"}
        </p>
        <p className="mt-1 text-sm text-ink/70">{error.message}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded border border-dashed border-ink/15 p-6 text-sm text-ink/40">
        {variant === "clearcheck"
          ? "No report loaded yet."
          : "Submit the form to see a risk evaluation."}
      </div>
    );
  }

  if (variant === "clearcheck") {
    return <ClearCheckReport report={result} />;
  }

  return (
    <div className="rounded border border-ink/10 bg-white p-6">
      <div className="flex items-center justify-between">
        <p className="font-display text-xs uppercase tracking-wide text-ink/50">
          {result.type} risk result
        </p>
        <RiskTierBadge tier={result.risk_tier} />
      </div>
      <p className="mt-3 font-display text-4xl font-semibold text-ink">
        {result.risk_score}
        <span className="ml-1 text-lg font-normal text-ink/40">/100</span>
      </p>
      <div className="mt-4 space-y-1.5 border-t border-ink/10 pt-4">
        {Object.entries(result.raw).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-ink/60">{key.replace(/_/g, " ")}</span>
            <span className="font-display text-ink">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink/35">Model: {result.model_version}</p>
    </div>
  );
}

function ClearCheckReport({ report }) {
  return (
    <div className="rounded border border-ink/10 bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-wide text-ink/50">
            Full ClearCheck report
          </p>
          <p className="mt-0.5 break-all font-display text-[11px] text-ink/35">
            {report.check_id}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-risk-low/30 bg-risk-low/10 px-3 py-1 font-display text-xs font-medium uppercase tracking-wide text-risk-low">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Unlocked
        </span>
      </div>

      <p className="mt-4 font-display text-4xl font-semibold text-ink">
        {report.findings_count}
        <span className="ml-2 text-lg font-normal text-ink/40">
          finding{report.findings_count === 1 ? "" : "s"}
        </span>
      </p>

      {report.findings.length === 0 ? (
        <p className="mt-4 border-t border-ink/10 pt-4 text-sm text-ink/55">
          No consistency issues detected across the submitted accounts.
        </p>
      ) : (
        <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
          {report.findings.map((f, i) => (
            <div key={i} className="rounded border border-ink/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-xs font-semibold text-ink">
                  {f.code}
                </span>
                <SeverityBadge severity={f.severity} />
              </div>
              <p className="mt-2 text-sm text-ink/80">{f.description}</p>
              <p className="mt-2 font-display text-xs text-ink/45">
                account {f.account_ref} · field: {f.field.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <JurisdictionMeta
          jurisdiction={report.jurisdiction}
          metadata={report.jurisdiction_metadata}
        />
      </div>

      <p className="mt-4 border-t border-ink/10 pt-4 text-xs leading-relaxed text-ink/45">
        {report.notice}
      </p>
    </div>
  );
}
