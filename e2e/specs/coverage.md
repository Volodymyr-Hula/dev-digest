# Coverage map

One row per flow. A flow's journey and asserted fixtures must stay true; update this table whenever a flow is added, renamed or retargeted. Fixtures are defined in [seed-fixtures.md](seed-fixtures.md).

| Flow | Journey | Route(s) | Asserted (text / URL) | Fixtures |
|------|---------|----------|-----------------------|----------|
| `01-app-boot` | cold root load, redirect to a repo's PR list | `/` → `/repos/<id>/pulls` | URL `/pulls`; `Pull Requests` | S1 only (≥1 repo) |
| `02-repo-pulls-detail` | PR list → open PR #482 → detail route | `/repos/<id>/pulls`, `/pulls/482` | `Add rate limiting to public API endpoints` (twice); `COST`; URL `/pulls/482` | repo, PR #482 |
| `03-agents` | agents list | `/agents` | `Security Reviewer` | agents |
| `04-pr-findings` | PR #482 → Agent runs tab → run accordion open | `/pulls/482?tab=findings` | `request changes`; `2 findings`; `Hardcoded Stripe secret key in commit`; URL `tab=findings` | PR #482, review, findings |
| `05-pr-diff` | PR #482 → Files changed tab | `/pulls/482?tab=diff` | `src/config.ts`; URL `tab=diff` | PR #482, `pr_files` |
| `06-onboarding` | add-repository form renders, no submit | `/onboarding` | `Add a repository`; `Repository URL` | none |
| `07-settings` | both settings sections render | `/settings/api-keys`, `/settings/models` | `API Keys`; `Feature Models` | none |

Not covered (by design, they need a model or a mutation): running a review, onboarding submit, agent create/edit/delete, finding dismiss, inline diff comments, settings save/test connection.

Known gaps in what a passing flow proves:
- `01` does not assert PR #482; it only proves client, API and DB answer (`flows/01-app-boot.flow.json:3`).
- `03` checks one of three seeded agents.
- `02` checks the COST column header, not a cost value.
