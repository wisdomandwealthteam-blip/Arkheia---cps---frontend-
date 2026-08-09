// src/components/ResultPanel.jsx
import RiskTierBadge from "./RiskTierBadge";

export default function ResultPanel({ result, error, loading }) {
  if (loading) {
    return (
      <div className="rounded border border-ink/10 bg-white p-6 text-sm text-ink/50">
        Evaluating...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-risk-high/30 bg-risk-high/5 p-6">
        <p className="font-display text-sm font-medium text-risk-high">
          Evaluation failed
        </p>
        <p className="mt-1 text-sm text-ink/70">{error.message}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded border border-dashed border-ink/15 p-6 text-sm text-ink/40">
        Submit the form to see a risk evaluation.
      </div>
    );
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
