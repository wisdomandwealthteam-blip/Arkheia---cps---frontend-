// src/App.jsx
import { useEffect, useState } from "react";
import SystemStatus from "./components/SystemStatus";
import ApiKeyInput from "./components/ApiKeyInput";
import LandingPage from "./pages/LandingPage";
import AutoRiskPage from "./pages/AutoRiskPage";
import HousingRiskPage from "./pages/HousingRiskPage";
import DashboardPage from "./pages/DashboardPage";
import DeveloperPage from "./pages/DeveloperPage";
import BillingPage from "./pages/BillingPage";

const TABS = [
  { id: "home", label: "Overview" },
  { id: "auto", label: "Auto" },
  { id: "housing", label: "Housing" },
  { id: "dashboard", label: "Dashboard" },
  { id: "billing", label: "Billing" },
  { id: "developer", label: "Developer" },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [apiKey, setApiKey] = useState("demo-key-local-dev");
  const [history, setHistory] = useState([]);
  const [checkoutBanner, setCheckoutBanner] = useState(null);

  const addToHistory = (entry) => setHistory((h) => [...h, entry]);

  // Handle redirect-back from Stripe Checkout / Customer Portal. The
  // frontend has no real router (tab state only), so these arrive as
  // query params on the root URL — see stripe_service.py for the
  // matching redirect URLs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const targetTab = params.get("tab");

    if (checkout === "success") {
      setCheckoutBanner({ type: "success", message: "Subscription updated — welcome aboard." });
      setTab("billing");
    } else if (checkout === "cancelled") {
      setCheckoutBanner({ type: "cancelled", message: "Checkout cancelled — no changes made." });
      setTab("billing");
    } else if (targetTab === "billing") {
      setTab("billing");
    }

    if (checkout || targetTab) {
      // clean the URL so a refresh doesn't re-trigger the banner
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={() => setTab("home")}
            className="focus-ring font-display text-sm font-semibold tracking-tight text-ink"
          >
            ARKHEIA · CPS
          </button>
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`focus-ring rounded px-3 py-1.5 font-display text-xs font-medium transition ${
                  tab === t.id
                    ? "bg-ink text-paper"
                    : "text-ink/50 hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <SystemStatus />
            <ApiKeyInput value={apiKey} onChange={setApiKey} />
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-ink/5 px-6 py-2 sm:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`focus-ring shrink-0 rounded px-3 py-1 font-display text-xs font-medium ${
                tab === t.id ? "bg-ink text-paper" : "text-ink/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {checkoutBanner && (
          <div
            className={`mb-6 rounded border px-4 py-3 text-sm ${
              checkoutBanner.type === "success"
                ? "border-risk-low/30 bg-risk-low/5 text-risk-low"
                : "border-ink/15 bg-ink/5 text-ink/70"
            }`}
          >
            {checkoutBanner.message}
          </div>
        )}

        {tab === "home" && <LandingPage onEnter={setTab} />}
        {tab === "auto" && <AutoRiskPage apiKey={apiKey} onResult={addToHistory} />}
        {tab === "housing" && <HousingRiskPage apiKey={apiKey} onResult={addToHistory} />}
        {tab === "dashboard" && <DashboardPage history={history} />}
        {tab === "billing" && <BillingPage apiKey={apiKey} />}
        {tab === "developer" && <DeveloperPage history={history} />}
      </main>

      <footer className="border-t border-ink/10 px-6 py-6 text-center text-xs text-ink/35">
        ARKHEIA-CPS — illustrative deterministic risk model, not licensed actuarial data.
      </footer>
    </div>
  );
}
