// src/utils/billingApi.js
import { API_BASE_URL } from "./apiClient";

async function billingRequest(path, { method = "GET", body, apiKey } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = new Error(data?.detail || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return data;
}

export const billingApi = {
  getStatus: (apiKey) => billingRequest("/billing/status", { apiKey }),

  createCheckoutSession: (tier, apiKey, customerEmail) =>
    billingRequest("/billing/create-checkout-session", {
      method: "POST",
      apiKey,
      body: { tier, customer_email: customerEmail || null },
    }),

  createPortalSession: (apiKey) =>
    billingRequest("/billing/create-portal-session", {
      method: "POST",
      apiKey,
    }),
};
