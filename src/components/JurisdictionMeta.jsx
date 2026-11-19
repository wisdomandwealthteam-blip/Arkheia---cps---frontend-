// src/components/JurisdictionMeta.jsx
// Renders the jurisdiction metadata block returned by ClearCheck
// (preview and report responses share the same shape).

export default function JurisdictionMeta({ jurisdiction, metadata }) {
  if (!metadata) return null;
  return (
    <div className="rounded border border-ink/10 bg-ink/[0.02] p-4">
      <p className="font-display text-xs uppercase tracking-wide text-ink/50">
        Jurisdiction — {jurisdiction}
      </p>
      <dl className="mt-2 space-y-1.5 text-sm">
        {metadata.name && (
          <MetaRow label="Region" value={metadata.name} />
        )}
        {metadata.primary_statute && (
          <MetaRow label="Primary statute" value={metadata.primary_statute} />
        )}
        {metadata.dispute_window_days != null && (
          <MetaRow
            label="Dispute window"
            value={`${metadata.dispute_window_days} days`}
          />
        )}
        {metadata.regulator && (
          <MetaRow label="Regulator" value={metadata.regulator} />
        )}
      </dl>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-ink/45">{label}</dt>
      <dd className="font-display text-ink sm:text-right">{value}</dd>
    </div>
  );
}
