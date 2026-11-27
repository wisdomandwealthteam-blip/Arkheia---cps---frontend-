// src/App.jsx
import { useEffect, useState } from "react";
import LandingPage, { InstitutionalGateSelector } from "./pages/LandingPage";
import AutoRiskPage from "./pages/AutoRiskPage";
import HousingRiskPage from "./pages/HousingRiskPage";
import DashboardPage from "./pages/DashboardPage";
import DeveloperPage from "./pages/DeveloperPage";
import BillingPage from "./pages/BillingPage";
import ClearCheckPage from "./pages/ClearCheckPage";
import GovernanceCheckPage from "./pages/GovernanceCheckPage";
import SettlementCheckPage from "./pages/SettlementCheckPage";
import ProvenanceCheckPage from "./pages/ProvenanceCheckPage";
import CustodyCheckPage from "./pages/CustodyCheckPage";
import EdgeVerifyPage from "./pages/EdgeVerifyPage";
import { captureGovernancePilot, syncTabHistory, tabFromLocation } from "./utils/navigation";

const TABS = [
  { id: "home", label: "Overview" },
  { id: "auto", label: "Auto" },
  { id: "housing", label: "Housing" },
  { id: "clearcheck", label: "ClearCheck" },
  { id: "governance", label: "GovernanceCheck" },
  { id: "settlement", label: "SettlementCheck" },
  { id: "provenance", label: "ProvenanceCheck" },
  { id: "custody", label: "CustodyCheck" },
  { id: "edge", label: "EdgeVerify" },
  { id: "dashboard", label: "Dashboard" },
  { id: "billing", label: "Billing" },
  { id: "developer", label: "Developer" },
];

const TRIAL_API = "https://arkheia-cps-10.onrender.com/api/clearcheck/trial";

function readTrialSession() {
  try {
    return window.localStorage.getItem("clearcheck_trial_session_id") || null;
  } catch {
    return null;
  }
}

function persistTrial(active, expiresAt, sessionId) {
  try {
    window.localStorage.setItem("trial_active", String(active));
    if (sessionId) window.localStorage.setItem("clearcheck_trial_session_id", sessionId);
    if (expiresAt) window.localStorage.setItem("clearcheck_trial_expires_at", String(expiresAt));
    else window.localStorage.removeItem("clearcheck_trial_expires_at");
  } catch {
    // Storage may be unavailable in private browsing; verified in-memory state still works.
  }
}

export default function App() {
  const [tab, setTab] = useState(() => tabFromLocation(window.location));
  const [apiKey] = useState("demo-key-local-dev");
  const [history, setHistory] = useState([]);
  const [checkoutBanner, setCheckoutBanner] = useState(null);
  const [clearCheckId, setClearCheckId] = useState(null);
  // Neither the return query nor localStorage is an authorization source.
  const [trialSessionId, setTrialSessionId] = useState(readTrialSession);
  const [trialActive, setTrialActive] = useState(false);
  const [trialExpiresAt, setTrialExpiresAt] = useState(null);
  const [trialSyncError, setTrialSyncError] = useState(null);
  const [trialRefresh, setTrialRefresh] = useState(0);
  const [trialPortalLoading, setTrialPortalLoading] = useState(false);

  const addToHistory = (entry) => setHistory((h) => [...h, entry]);

  // Preserve existing single-report, subscription, and Customer Portal returns.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const targetTab = params.get("tab");
    const checkId = params.get("check_id");
    const trial = params.get("trial");
    const sessionId = params.get("session_id");

    if (trial === "active") {
      setTab("billing");
      if (sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
        setTrialSessionId(sessionId);
        persistTrial(false, null, sessionId);
        setCheckoutBanner({ type: "pending", message: "Confirming your 7-day trial payment and access…" });
      } else {
        setCheckoutBanner({ type: "cancelled", message: "A valid checkout session is required to confirm trial access." });
      }
    } else if (trial === "canceled") {
      setTab("billing");
      setCheckoutBanner({ type: "cancelled", message: "Trial checkout canceled — no new access activated." });
    } else if (checkId) {
      setClearCheckId(checkId);
      setTab("clearcheck");
      if (checkout === "success") {
        setCheckoutBanner({ type: "success", message: "Payment received — your ClearCheck report is unlocked below." });
      } else if (checkout === "cancelled") {
        setCheckoutBanner({ type: "cancelled", message: "Checkout cancelled — the report stays locked." });
      }
    } else if (checkout === "success") {
      setCheckoutBanner({ type: "success", message: "Subscription updated — welcome aboard." });
      setTab("billing");
    } else if (checkout === "cancelled") {
      setCheckoutBanner({ type: "cancelled", message: "Checkout cancelled — no changes made." });
      setTab("billing");
    } else if (targetTab === "billing" || targetTab === "clearcheck") {
      setTab(targetTab);
    }

    if (checkout || targetTab || checkId || trial) {
      // Preserve unrelated query parameters while removing checkout credentials.
      ["checkout", "tab", "check_id", "trial", "session_id"].forEach((key) => params.delete(key));
      const search = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
    }
  }, []);

  // URL/history navigation is separate from payment and access verification.
  useEffect(() => {
    syncTabHistory(window, tab, true);
  }, [tab]);

  useEffect(() => {
    const onPopState = () => setTab(tabFromLocation(window.location));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigateTab(nextTab) {
    syncTabHistory(window, nextTab);
    setTab(nextTab);
  }

  useEffect(() => {
    if (!trialSessionId) return;
    const controller = new AbortController();
    let retryTimer;
    let attempts = 0;
    setTrialSyncError(null);

    async function verifyTrial() {
      try {
        const response = await fetch(`${TRIAL_API}/status?session_id=${encodeURIComponent(trialSessionId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to confirm trial access. Check again from Billing.");
        const result = await response.json();
        if (controller.signal.aborted) return;
        const expiresAt = Number(result.trial_expires_at);
        const active = result.trial_active === true && Number.isFinite(expiresAt) && expiresAt > Date.now() / 1000;
        setTrialActive(active);
        setTrialExpiresAt(active ? expiresAt : null);
        persistTrial(active, active ? expiresAt : null, trialSessionId);
        if (active) {
          setCheckoutBanner((banner) => banner?.type === "pending"
            ? { type: "success", message: "Your 7-day ClearCheck™ trial access is active." }
            : banner);
        } else if (attempts < 4) {
          // Stripe's signed webhook can arrive after the browser return.
          attempts += 1;
          retryTimer = window.setTimeout(verifyTrial, 1500);
        } else {
          setCheckoutBanner((banner) => banner?.type === "pending"
            ? { type: "pending", message: "Trial access is not yet confirmed. If you just paid, check access again from Billing." }
            : banner);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setTrialActive(false);
        setTrialExpiresAt(null);
        persistTrial(false, null, trialSessionId);
        setTrialSyncError(err.message || "Unable to confirm trial access.");
      }
    }

    verifyTrial();
    const onVisibility = () => {
      if (document.visibilityState === "visible") verifyTrial();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [trialSessionId, tab, trialRefresh]);

  useEffect(() => {
    if (!trialActive || !trialExpiresAt) return;
    const timer = window.setTimeout(() => {
      setTrialActive(false);
      setTrialExpiresAt(null);
      persistTrial(false, null, trialSessionId);
    }, Math.max(0, trialExpiresAt * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [trialActive, trialExpiresAt, trialSessionId]);

  async function manageTrial() {
    setTrialPortalLoading(true);
    setTrialSyncError(null);
    try {
      const response = await fetch(`${TRIAL_API}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: trialSessionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Trial billing is temporarily unavailable.");
      const portalUrl = result.url || result.portal_url;
      if (!portalUrl || new URL(portalUrl).origin !== "https://billing.stripe.com") {
        throw new Error("A valid Stripe billing link was not returned.");
      }
      window.location.assign(portalUrl);
    } catch (err) {
      setTrialSyncError(err.message || "Unable to open trial billing.");
      setTrialPortalLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <button onClick={() => navigateTab("home")} className="focus-ring font-display text-sm font-semibold tracking-tight text-ink">
            ARKHEIA DVE™
          </button>
          <nav className="hidden flex-wrap gap-1 sm:flex">
            {TABS.map((t) => (
              <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => navigateTab(t.id)} className={`focus-ring rounded px-3 py-1.5 font-display text-xs font-medium transition ${tab === t.id ? "bg-ink text-paper" : "text-ink/50 hover:bg-ink/5 hover:text-ink"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <span className="whitespace-nowrap font-display text-xs text-risk-low">● Verification Engine Online</span>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-ink/5 px-6 py-2 sm:hidden">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => navigateTab(t.id)} className={`focus-ring shrink-0 rounded px-3 py-1 font-display text-xs font-medium ${tab === t.id ? "bg-ink text-paper" : "text-ink/50"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {checkoutBanner && (
          <div role="status" className={`mb-6 rounded border px-4 py-3 text-sm ${checkoutBanner.type === "success" ? "border-risk-low/30 bg-risk-low/5 text-risk-low" : "border-ink/15 bg-ink/5 text-ink/70"}`}>
            {checkoutBanner.message}
          </div>
        )}
        {(tab === "dashboard" || tab === "billing") && trialActive && (
          <span role="status" className="mb-6 inline-flex rounded-full border border-risk-low/30 bg-risk-low/10 px-3 py-1 font-display text-xs font-medium text-risk-low">
            ● 7-Day Trial Active
          </span>
        )}
        {tab === "billing" && trialSessionId && (
          <div className="mb-6 space-y-3 rounded border border-ink/10 bg-white p-4">
            <p className="font-display text-sm font-semibold text-ink">ClearCheck™ trial billing</p>
            {trialActive && <p className="text-xs text-ink/55">Trial ends {new Date(trialExpiresAt * 1000).toLocaleString()}. Manage or cancel access below.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={manageTrial} disabled={trialPortalLoading} className="focus-ring rounded border border-ink/20 px-4 py-2 font-display text-xs text-ink disabled:opacity-50">
                {trialPortalLoading ? "Opening billing..." : "Manage / cancel trial →"}
              </button>
              <button type="button" onClick={() => setTrialRefresh((value) => value + 1)} className="focus-ring rounded border border-ink/20 px-4 py-2 font-display text-xs text-ink">Check access status</button>
            </div>
            {trialSyncError && <p role="alert" className="text-xs text-risk-high">{trialSyncError}</p>}
          </div>
        )}

        {tab === "home" && (
          <div onClickCapture={(event) => captureGovernancePilot(event, navigateTab)}>
            <LandingPage onEnter={navigateTab} apiKey={apiKey} trialSessionId={trialActive ? trialSessionId : null} />
          </div>
        )}
        {tab === "auto" && <AutoRiskPage apiKey={apiKey} onResult={addToHistory} />}
        {tab === "housing" && <HousingRiskPage apiKey={apiKey} onResult={addToHistory} />}
        {tab === "clearcheck" && <ClearCheckPage key={clearCheckId ?? "fresh"} apiKey={apiKey} initialCheckId={clearCheckId} inputContext={<InstitutionalGateSelector />} trialSessionId={trialActive ? trialSessionId : null} />}
        {tab === "governance" && <GovernanceCheckPage apiKey={apiKey} />}
        {tab === "settlement" && <SettlementCheckPage apiKey={apiKey} />}
        {tab === "provenance" && <ProvenanceCheckPage apiKey={apiKey} />}
        {tab === "custody" && <CustodyCheckPage apiKey={apiKey} />}
        {tab === "edge" && <EdgeVerifyPage apiKey={apiKey} />}
        {tab === "dashboard" && <DashboardPage history={history} />}
        {tab === "billing" && <BillingPage apiKey={apiKey} />}
        {tab === "developer" && <DeveloperPage history={history} />}
      </main>

      <footer className="border-t border-ink/10 px-6 py-6 text-center text-xs text-ink/35">
        ARKHEIA DVE™ — verification reports are informational and do not constitute legal, financial, or credit-repair advice.
      </footer>
    </div>
  );
}
