// src/components/ApiKeyInput.jsx
export default function ApiKeyInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="api-key" className="font-display text-xs text-ink/60 whitespace-nowrap">
        API key
      </label>
      <input
        id="api-key"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="demo-key-local-dev"
        className="focus-ring w-48 rounded border border-ink/15 bg-white px-2 py-1 font-display text-xs text-ink placeholder:text-ink/30"
      />
    </div>
  );
}
