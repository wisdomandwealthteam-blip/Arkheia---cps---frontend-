import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernancePayload, governanceSample } from "../src/utils/governance.js";

for (const field of ["model_id", "decision_domain", "action"]) {
  test(`${field} rejects SSN-like values across all allowed separators`, () => {
    for (const value of [
      "123.45.6789", "123:45:6789", "123_45_6789", "123-45-6789",
      "123.45:6789", "123__45--6789", "123456789",
    ]) {
      assert.throws(
        () => buildGovernancePayload({ ...governanceSample(true), [field]: value }),
        /operational code/,
      );
    }
    assert.doesNotThrow(() => buildGovernancePayload(governanceSample(true)));
  });
}
