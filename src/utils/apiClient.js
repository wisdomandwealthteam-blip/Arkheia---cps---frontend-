// src/utils/apiClient.js
// Centralized API logic. Set VITE_API_BASE_URL to override the deployed
// ARKHEIA-CPS backend (defaults to the Render deployment below).

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://arkheia-cps-10.onrender.com";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = "GET", body, apiKey } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Could not reach the CPS backend. Check the API URL and your connection.",
      0,
      String(networkErr)
    );
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      data?.detail || `Request failed (${response.status})`,
      response.status,
      data
    );
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  evaluateAuto: (contract, apiKey) =>
    request("/risk/auto", { method: "POST", body: contract, apiKey }),
  evaluateHousing: (contract, apiKey) =>
    request("/risk/housing", { method: "POST", body: contract, apiKey }),
  evaluateAggregate: (payload, apiKey) =>
    request("/risk/aggregate", { method: "POST", body: payload, apiKey }),

  // ClearCheck consumer flow
  clearCheckPreview: (payload, apiKey) =>
    request("/api/clearcheck/preview", { method: "POST", body: payload, apiKey }),
  clearCheckReport: (checkId, apiKey) =>
    request(`/api/clearcheck/report/${encodeURIComponent(checkId)}`, { apiKey }),
  clearCheckCheckout: (checkId, customerEmail, apiKey) =>
    request("/api/clearcheck/checkout", {
      method: "POST",
      body: { check_id: checkId, customer_email: customerEmail || null },
      apiKey,
    }),

  // GovernanceCheck: configured policy gate, then the full audit receipt.
  governanceCheck: (payload, apiKey) =>
    request("/api/governance/check", { method: "POST", body: payload, apiKey }),
  governanceReceipt: (receiptId, apiKey) =>
    request(`/api/governance/checks/${encodeURIComponent(receiptId)}`, { apiKey }),

  // Remaining DVE gates are verification-only POST receipt endpoints.
  settlementCheck: (payload, apiKey) =>
    request("/api/settlement/check", { method: "POST", body: payload, apiKey }),
  provenanceCheck: (payload, apiKey) =>
    request("/api/provenance/check", { method: "POST", body: payload, apiKey }),
  custodyCheck: (payload, apiKey) =>
    request("/api/custody/check", { method: "POST", body: payload, apiKey }),
  edgeCheck: (payload, apiKey) =>
    request("/api/edge/check", { method: "POST", body: payload, apiKey }),
};

export { ApiError };
