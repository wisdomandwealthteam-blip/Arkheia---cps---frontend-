// src/pages/BillingPage.jsx
import { useEffect, useState } from "react";
import { billingApi } from "../utils/billingApi";
import SubscriptionStatusBadge from "../components/SubscriptionStatusBadge";

const TIER_ORDER = ["free", "pro", "enterprise"];

const TIER_COPY = {
  free: {
    name: "Free",
    price: "$0/mo",
    blurb: "Auto risk evaluation only, 30 requests/min.",
  },
  pro: {
    name: "Pro",
    price: "$49/mo",
    blurb: "Auto + Housing + Aggregate, 300 requests/min.",
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    blurb: "All modules, 3,000 requests/min, dedicated support.",
  },
};

export default function BillingPage({ apiKey }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // tier being checked out, or "portal"

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    billingApi
      .getStatus(apiKey)
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  async function handleUpgrade(tier) {
    setActionLoading(tier);
    try {
      const { checkout_url } = await billingApi.createCheckoutSession(tier, apiKey);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err);
      setActionLoading(null);
    }
  }

  async function handleManageBilling() {
    setActionLoading("portal");
    try {
      const { portal_url } = await billingApi.createPortalSession(apiKey);
      window.location.href = portal_url;
    } catch (err) {
      setError(err);
      setActionLoading(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink/50">Loading subscription status...</p>;
  }

  if (error && !status) {
    return (
      <div className="rounded border border-risk-high/30 bg-risk-high/5 p-6">
        <p className="font-display text-sm font-medium text-risk-high">
          Couldn't load billing status
        </p>
        <p className="mt-1 text-sm text-ink/70">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current status */}
      <div className="rounded border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-wide text-ink/50">
              Current plan
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {status.display_name}
            </p>
          </div>
          <SubscriptionStatusBadge status={status.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-ink/10 pt-4 text-sm">
          <div>
            <p className="text-ink/45">Rate limit</p>
            <p className="font-display text-ink">
              {status.rate_limit_per_minute} req/min
            </p>
          </div>
          <div>
            <p className="text-ink/45">Modules</p>
            <p className="font-display text-ink">
              {status.allowed_modules.includes("*")
                ? "All"
                : status.allowed_modules.join(", ")}
            </p>
          </div>
          {status.current_period_end && (
            <div>
              <p className="text-ink/45">Renews</p>
              <p className="font-display text-ink">
                {new Date(Number(status.current_period_end) * 1000).toLocaleDateString()}
              </p>
            </div>
          )}
          {status.monthly_price_usd !== null && (
            <div>
              <p className="text-ink/45">Price</p>
              <p className="font-display text-ink">${status.monthly_price_usd}/mo</p>
            </div>
          )}
        </div>

        {status.has_stripe_customer && (
          <button
            onClick={handleManageBilling}
            disabled={actionLoading === "portal"}
            className="focus-ring mt-5 rounded border border-ink/20 px-4 py-2 font-display text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
          >
            {actionLoading === "portal" ? "Redirecting..." : "Manage billing"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-risk-high/30 bg-risk-high/5 p-4">
          <p className="text-sm text-risk-high">{error.message}</p>
        </div>
      )}

      {/* Plan comparison / upgrade */}
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">
          Available plans
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const copy = TIER_COPY[tier];
            const isCurrent = status.tier === tier;
            return (
              <div
                key={tier}
                className={`rounded border p-5 ${
                  isCurrent ? "border-signal bg-signal/5" : "border-ink/10 bg-white"
                }`}
              >
                <p className="font-display text-sm font-semibold text-ink">
                  {copy.name}
                </p>
                <p className="mt-1 font-display text-lg text-ink">{copy.price}</p>
                <p className="mt-2 text-xs text-ink/55">{copy.blurb}</p>
                {isCurrent ? (
                  <p className="mt-4 font-display text-xs uppercase tracking-wide text-signal">
                    Current plan
                  </p>
                ) : tier === "free" ? null : (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={actionLoading === tier}
                    className="focus-ring mt-4 w-full rounded bg-ink py-2 font-display text-xs font-medium text-paper transition hover:bg-ink/85 disabled:opacity-50"
                  >
                    {actionLoading === tier ? "Redirecting..." : `Upgrade to ${copy.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
