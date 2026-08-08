// src/components/SubscriptionStatusBadge.jsx
const STATUS_STYLES = {
  active: "bg-risk-low/10 text-risk-low border-risk-low/30",
  trialing: "bg-risk-low/10 text-risk-low border-risk-low/30",
  free: "bg-ink/5 text-ink/60 border-ink/15",
  past_due: "bg-risk-elevated/10 text-risk-elevated border-risk-elevated/30",
  canceled: "bg-risk-high/10 text-risk-high border-risk-high/30",
};

export default function SubscriptionStatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-display font-medium uppercase tracking-wide ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
