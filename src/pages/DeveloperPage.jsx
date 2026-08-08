// src/pages/DeveloperPage.jsx
export default function DeveloperPage({ history }) {
  return (
    <div className="rounded border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-6 py-4">
        <h2 className="font-display text-sm font-semibold text-ink">
          Raw response log
        </h2>
        <p className="text-xs text-ink/40">
          Every request/response pair from this session, most recent first.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="p-6 text-sm text-ink/40">No requests logged yet.</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {[...history].reverse().map((h, i) => (
            <div key={i} className="p-6">
              <p className="mb-2 font-display text-xs uppercase tracking-wide text-ink/40">
                {h.type} — request #{history.length - i}
              </p>
              <pre className="overflow-x-auto rounded bg-ink text-paper p-4 text-xs leading-relaxed">
{JSON.stringify({ input: h.input, output: h.output }, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
