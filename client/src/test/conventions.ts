/* Shared ConventionCandidate fixtures for client tests. */
import type { ConventionCandidate } from "@devdigest/shared";

export function makeConvention(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    rule: "Relative imports carry the .js suffix",
    evidence_path: "src/service.ts",
    evidence_snippet: "import { repo } from './repository.js';",
    confidence: 0.9,
    status: "pending",
    skill_id: null,
    created_at: "2026-11-24T00:00:00Z",
    ...over,
  };
}
