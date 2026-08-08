// src/pages/DashboardPage.jsx
import RiskTierBadge from "../components/RiskTierBadge";

export default function DashboardPage({ history }) {
  const total = history.length;
  const byTier = history.reduce((acc, h) => {
    const tier = h.output.risk_tier || h.output.combined_risk_tier;
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const avgScore = total
    ? (
        history.reduce(
          (sum, h) => sum + (h.output.risk_score ?? h.output.combined_risk_score ?? 0),
          0
        ) / total
      ).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Evaluations this session" value={total} />
        <StatCard label="Average risk score" value={avgScore} />
        <StatCard
          label="Most common tier"
          value={
            total
              ? Object.entries(byTier).sort((a, b) => b[1] - a[1])[0][0]
              : "—"
          }
        />
      </div>

      <div className="rounded border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="font-display text-sm font-semibold text-ink">
            Session history
          </h2>
          <p className="text-xs text-ink/40">
            Stored in this browser tab only — clears on refresh.
          </p>
        </div>
        {total === 0 ? (
          <p className="p-6 text-sm text-ink/40">
            No evaluations yet. Run one from the Auto or Housing tab.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-6 py-2 font-display font-medium">Type</th>
                <th className="px-6 py-2 font-display font-medium">Score</th>
                <th className="px-6 py-2 font-display font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h, i) => (
                <tr key={i} className="border-b border-ink/5 last:border-0">
                  <td className="px-6 py-2.5 capitalize text-ink/80">{h.type}</td>
                  <td className="px-6 py-2.5 font-display text-ink">
                    {h.output.risk_score ?? h.output.combined_risk_score}
                  </td>
                  <td className="px-6 py-2.5">
                    <RiskTierBadge
                      tier={h.output.risk_tier ?? h.output.combined_risk_tier}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded border border-ink/10 bg-white p-5">
      <p className="font-display text-xs uppercase tracking-wide text-ink/40">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
