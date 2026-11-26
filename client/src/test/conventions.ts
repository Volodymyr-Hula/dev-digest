/* Shared ConventionCandidate fixtures for client tests. */
import type { ConventionCandidate } from "@devdigest/shared";

export function makeConvention(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    rule: "Relative imports carry the .js suffix",
    evidence_path: "src/service.ts",
    evidence_snippet: "import { repo } from './repository.js';",
    evidence_lines: { start: 1, end: 1 },
    evidence_url: "https://github.com/acme/payments-api/blob/deadbeef/src/service.ts#L1",
    confidence: 0.9,
    status: "pending",
    skill_id: null,
    created_at: "2026-11-24T00:00:00Z",
    ...over,
  };
}
