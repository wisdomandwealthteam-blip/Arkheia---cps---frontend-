// src/utils/apiClient.js
// Centralized API logic. Change API_BASE_URL to point at your deployed
// backend once it's live on Render (see README).

export const API_BASE_URL =
  import.meta.env.VITE_CPS_API_BASE_URL || "http://localhost:8000";

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
};

export { ApiError };
