// src/components/FormField.jsx
export default function FormField({
  label,
  id,
  type = "number",
  value,
  onChange,
  min,
  max,
  step,
  hint,
  required = true,
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-display text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(type === "number" ? e.target.valueAsNumber : e.target.value)}
        min={min}
        max={max}
        step={step}
        required={required}
        className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
      />
      {hint && <p className="text-xs text-ink/45">{hint}</p>}
    </div>
  );
}
