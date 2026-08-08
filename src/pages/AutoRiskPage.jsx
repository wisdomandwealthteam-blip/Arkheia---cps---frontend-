// src/pages/AutoRiskPage.jsx
import { useState } from "react";
import FormField from "../components/FormField";
import ResultPanel from "../components/ResultPanel";
import { api } from "../utils/apiClient";
import { useApiCall } from "../hooks/useApiCall";

const initialState = {
  vin: "",
  driver_age: 30,
  vehicle_value: 15000,
  incident_history: 0,
  region_risk_tier: 2,
};

export default function AutoRiskPage({ apiKey, onResult }) {
  const [form, setForm] = useState(initialState);
  const { data, error, loading, run } = useApiCall((contract) =>
    api.evaluateAuto(contract, apiKey)
  );

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const result = await run(form);
      onResult?.({ type: "auto", input: form, output: result });
    } catch {
      // error state already captured by useApiCall
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-4 rounded border border-ink/10 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Auto risk input</h2>
        <FormField
          label="VIN"
          id="vin"
          type="text"
          value={form.vin}
          onChange={set("vin")}
          hint="Vehicle identification number"
        />
        <FormField
          label="Driver age"
          id="driver_age"
          value={form.driver_age}
          onChange={set("driver_age")}
          min={16}
          max={100}
        />
        <FormField
          label="Vehicle value (USD)"
          id="vehicle_value"
          value={form.vehicle_value}
          onChange={set("vehicle_value")}
          min={0}
          step={100}
        />
        <FormField
          label="Prior incidents"
          id="incident_history"
          value={form.incident_history}
          onChange={set("incident_history")}
          min={0}
          max={20}
        />
        <FormField
          label="Region risk tier (1-5)"
          id="region_risk_tier"
          value={form.region_risk_tier}
          onChange={set("region_risk_tier")}
          min={1}
          max={5}
          hint="Illustrative tier — not from a licensed dataset"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full rounded bg-signal py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50"
        >
          {loading ? "Evaluating..." : "Evaluate auto risk"}
        </button>
      </form>

      <div>
        <ResultPanel result={data} error={error} loading={loading} />
      </div>
    </div>
  );
}
