# GovernanceCheck frontend outcomes

## Completed outcomes

- [x] **Preserve existing application behavior.** Keep `LandingPage.jsx` and `ClearCheckPage.jsx` byte-for-byte unchanged. Do not change existing ClearCheck endpoints, CORS origins, Stripe billing, checkout, trial, or unlock logic. Reuse the existing frontend, design system, API configuration, and dependency lockfile; do not introduce a new hosting configuration or billing flow.

- [x] **Add governance navigation without editing the landing page.** Register direct `/governance` navigation and a GovernanceCheck tab in `App.jsx`, with address-bar updates and back/forward handling. Because the landing page is protected, its existing GovernanceCheck pilot link is handled by a scoped click-capture wrapper in `App.jsx`. Match only the existing recipient and `GovernanceCheck Pilot` subject; preserve all other links, landing copy, and layout. Modified clicks retain their existing native behavior. Preserve checkout-return precedence and unrelated query/hash values.

- [x] **Reuse the three-step verification UX and institutional visual system.** Add `src/pages/GovernanceCheckPage.jsx` with the existing ink/paper/signal palette, typography, form components, and dark local-redaction sidebar. Steps are **Input + redaction**, **Redacted preview**, and **Full receipt**. At the top of Step 1, include the exact prefill-only buttons `Load Defective AI Output (Triggers HOLD)` and `Load Compliant AI Output (Triggers PASS)`. Loading a sample never submits an API request.

  Both samples use model `underwriting-v1`, domain `underwriting`, proposed action `APPROVE`, minimum confidence `0.85`, maximum unsupervised amount `10000`, and synthetic subject `SAMPLE-0001`. The defective sample uses confidence `0.68`, transaction amount `45000`, and human override `false`, triggering `LOW_MODEL_CONFIDENCE` and `UNSUPERVISED_HIGH_VALUE_ACTION`. The compliant sample uses confidence `0.96`, transaction amount `5000`, and human override `true`, producing PASS.

- [x] **Validate editable inputs and redact identifiers locally.** Allow a blank model ID so the backend can evaluate missing provenance. Support editable domain strings with `underwriting`, `credit_limit`, `claims`, and `agent_action` suggestions; proposed action, confidence score, human-override checkbox, both policy thresholds, transaction amount, and subject reference. Confidence values must be finite and between `0` and `1`; amounts must be finite and nonnegative. Empty, invalid, NaN, or infinite numeric inputs must never silently become valid defaults.

  Mask the subject reference with the existing `maskAccountNumber` helper before display or transmission. The raw reference input is password-type, with a masked hint and sidebar. Do not collect names, email, or SSN fields. Label model/domain/action as operational codes, include a client-side PII notice, and reject email-like values, spaces/names, and nine-digit SSN-like values across every permitted separator variant. Do not persist form inputs in browser storage or log them. Send only the explicit request allowlist; discard unrelated form fields.

- [x] **Integrate the exact backend request and receipt contracts.** Add only two governance methods to the centralized API client, reusing `API_BASE_URL`, request handling, and the existing optional API-key header. POST `/api/governance/check` sends the flat request below. GET `/api/governance/checks/{receipt_id}` sends only the receipt identifier, never form inputs.

  Step 2 displays the gate, finding codes and plain-English reasons, and the masked submitted payload. Step 3 retrieves the same stored receipt and displays its full identifier, SHA-256 digest, architecture version, evaluation timestamp in UTC, and findings. Include a JSON receipt download. Require `receipt_id` to equal `gov_` plus the lowercase 64-hex `sha256_digest`, architecture `PLATFORM-ARCHITECTURE-2026-V1`, ISO UTC evaluation time, and exact static rule codes/reasons in unique fixed order. PASS requires no findings; HOLD requires findings. Retain only the documented response fields and reject disagreement between POST preview and GET receipt.

- [x] **Handle async states and gate semantics safely.** Include loading, error, retry, back, and restart states. Edits, preset loading, restart, navigation, and unmount invalidate pending results so stale receipts cannot replace current state. HOLD means stop and review before downstream action. PASS means only the configured rules passed: it is not legal authorization, collected human approval, or permission to execute. No action execution or invented payment/unlock behavior is added.

## Exact request contract

There are exactly eight top-level keys; only `policy_thresholds` is nested:

```json
{
  "model_id": "underwriting-v1",
  "decision_domain": "underwriting",
  "proposed_action": "APPROVE",
  "confidence_score": 0.68,
  "human_override_required": false,
  "policy_thresholds": {
    "min_confidence": 0.85,
    "max_unsupervised_amount": 10000
  },
  "transaction_amount": 45000,
  "redacted_subject_ref": "*******0001"
}
```

The compliant request uses the same fields with confidence `0.96`, human override `true`, and transaction amount `5000`. Local form fields `action`, `amount`, and `subject_reference` map to `proposed_action`, `transaction_amount`, and masked `redacted_subject_ref`; obsolete nested envelopes are not sent.

Receipt rules, in order:

1. `LOW_MODEL_CONFIDENCE`: Model confidence is below the policy minimum.
2. `UNSUPERVISED_HIGH_VALUE_ACTION`: Transaction amount exceeds the unsupervised policy maximum without required human override.
3. `MISSING_MODEL_PROVENANCE`: Model provenance is missing or unknown.

Receipt identity and consistency validation do not authenticate a digital signature or independently recompute the backend digest. The backend reuses ClearCheck's existing canonical content-addressed SHA-256 implementation.

## Final validation evidence

- `npm test`: **73 passed**, zero failed, cancelled, skipped, or TODO.
- `npm run build`: **1/1 final production build passed**, 50 modules transformed.
- Offline cross-repository integration: **2/2 cases passed** using the real frontend sample payload builder, backend TestClient POST, deterministic replay, GET lookup, and frontend receipt validation. No live URL requests were used.
- Full backend pytest suite after replay-integrity hardening: **432 passed**.
- `git diff --check` passed. Protected landing/ClearCheck/billing files and the dependency lockfile remain byte-identical to the original revision. Existing request/ClearCheck API methods and checkout/trial/portal sections are unchanged.
- Node tests exercise helpers and actual source component handlers through a minimal test-only hook adapter. Real React/JSX production compatibility is checked by Vite. No browser or screenshot testing was performed.

## Boundaries

Existing hosting must retain SPA fallback support for direct `/governance` reloads; hosting was not inspected or modified. The existing locked toolchain's audit findings (one moderate esbuild issue and one high Vite issue) remain unchanged; upgrading the toolchain is outside this feature's scope. No new dependencies were added.
