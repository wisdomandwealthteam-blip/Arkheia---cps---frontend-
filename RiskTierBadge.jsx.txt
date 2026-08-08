// src/components/RiskTierBadge.jsx
const TIER_STYLES = {
  LOW: "bg-risk-low/10 text-risk-low border-risk-low/30",
  MODERATE: "bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30",
  ELEVATED: "bg-risk-elevated/10 text-risk-elevated border-risk-elevated/30",
  HIGH: "bg-risk-high/10 text-risk-high border-risk-high/30",
};

export default function RiskTierBadge({ tier }) {
  const style = TIER_STYLES[tier] || "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-display font-medium uppercase tracking-wide ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {tier}
    </span>
  );
}
