// src/pages/HousingRiskPage.jsx
import { useState } from "react";
import FormField from "../components/FormField";
import ResultPanel from "../components/ResultPanel";
import { api } from "../utils/apiClient";
import { useApiCall } from "../hooks/useApiCall";

const initialState = {
  address: "",
  home_value: 250000,
  year_built: 1998,
  location_risk_tier: 2,
  structural_score: 70,
};

export default function HousingRiskPage({ apiKey, onResult }) {
  const [form, setForm] = useState(initialState);
  const { data, error, loading, run } = useApiCall((contract) =>
    api.evaluateHousing(contract, apiKey)
  );

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const result = await run(form);
      onResult?.({ type: "housing", input: form, output: result });
    } catch {
      // error state already captured
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-4 rounded border border-ink/10 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Housing risk input</h2>
        <FormField
          label="Address"
          id="address"
          type="text"
          value={form.address}
          onChange={set("address")}
        />
        <FormField
          label="Home value (USD)"
          id="home_value"
          value={form.home_value}
          onChange={set("home_value")}
          min={0}
          step={1000}
        />
        <FormField
          label="Year built"
          id="year_built"
          value={form.year_built}
          onChange={set("year_built")}
          min={1700}
          max={new Date().getFullYear()}
        />
        <FormField
          label="Location risk tier (1-5)"
          id="location_risk_tier"
          value={form.location_risk_tier}
          onChange={set("location_risk_tier")}
          min={1}
          max={5}
          hint="Illustrative tier — not from a licensed dataset"
        />
        <FormField
          label="Structural score (0-100)"
          id="structural_score"
          value={form.structural_score}
          onChange={set("structural_score")}
          min={0}
          max={100}
          hint="Higher is better condition"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full rounded bg-signal py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50"
        >
          {loading ? "Evaluating..." : "Evaluate housing risk"}
        </button>
      </form>

      <div>
        <ResultPanel result={data} error={error} loading={loading} />
      </div>
    </div>
  );
}
