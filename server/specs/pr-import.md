# Spec — repo and PR import

How a repo enters the system, how its PRs are synced from GitHub into Postgres, and how the PR list derives its review status. This is the precondition of [review-flow.md](review-flow.md). Refs are `server/src/…`.

## Repo import (`modules/repos`)

| Route | Behaviour |
|-------|-----------|
| `POST /repos {url}` | `201` new, `200` existing (`repos/routes.ts:29`) |
| `GET /repos` | workspace-scoped list |
| `POST /repos/:id/refresh` | enqueue `clone` + best-effort `repo-intel-refresh` (`repos/service.ts:115-138`) |
| `DELETE /repos/:id` | 404 if not in workspace; PRs cascade (`db/schema/pulls.ts:14`) |

- **PI-1** Only these URL shapes are accepted: `https://github.com/<owner>/<repo>[.git][/]` and `git@github.com:<owner>/<repo>[.git]`. Other hosts, credentials, port, query/fragment, extra segments, `.`/`..` ⇒ 400 `invalid_repo_url` (`repos/helpers.ts:60-101`). Owner/name must match `GITHUB_OWNER_RE` / `GITHUB_REPO_RE` (`repos/constants.ts`) because they become directories under `cloneDir`.
- **PI-2** The clone URL is **always rebuilt** from validated `owner/name` (`canonicalCloneUrl`, `helpers.ts:104`), both at enqueue time and again inside the job, because `jobs.payload` persists and may hold stale input (`repos/service.ts:49-56`). A token is never embedded in the URL; auth is the `GitClient` adapter's concern.
- **PI-3** Import is idempotent per `(workspace_id, full_name)`: unique index `repos_ws_fullname_uq` (`db/schema/repos.ts:22`); a duplicate returns the existing row with `created=false` and enqueues nothing (`service.ts:95-96`).
- **PI-4** The clone is a `JobRunner` job of kind `clone`, shallow (`CLONE_DEPTH=1`); on success it stores `clone_path` and **enqueues** (does not call) `repo-intel-index` (`service.ts:56-79`). A failure to enqueue the index job never fails the clone.
- **PI-5** `POST /repos` responds before the clone finishes; `clone_path` is `null` until the job completes.

## PR list sync — `GET /repos/:id/pulls` (`modules/pulls/routes.ts:26`)

- **PI-6** The repo must belong to the caller's workspace, else 404 "Repo not found".
- **PI-7 Local-first.** If `container.github()` throws (no `GITHUB_TOKEN`) or the GitHub call fails, the handler logs a warning and serves persisted rows; it never fails the read (`:34-39,75-77`).
- **PI-8** Sync is an upsert on `(repo_id, number)` — unique index `pr_repo_number_uq` (`db/schema/pulls.ts:31`). On conflict **only** `title`, `head_sha`, `status`, `updated_at` are updated (`pulls/routes.ts:65-72`); `author`, `branch`, `base`, `additions`, `deletions`, `files_count` are written once at insert. There is no transaction around the loop.
- **PI-9** Diff stats are not in GitHub's list payload, so rows with `additions=0 ∧ deletions=0 ∧ files_count=0` are backfilled from `getPullRequest`, at most `BACKFILL_LIMIT = 10` per request (`:89-112`).
- **PI-10** Response rows (`PrMeta`) carry `score`, `cost_usd`, `severity_counts` of the **latest** `kind='review'` review (newest `created_at`); all `null` when never reviewed. `severity_counts` excludes dismissed findings (`:114-147`, status of this change: uncommitted at time of writing). `cost_usd` is the snapshot on the producing run ([review-flow.md](review-flow.md) RF-41).

## PR detail — `GET /pulls/:id` (`:179`)

- **PI-11** PR must be in the caller's workspace (404 "Pull request not found"), repo must exist (404 "Repo not found").
- **PI-12** With a token: fetch detail from GitHub, **replace** `pr_files` and `pr_commits` for the PR (delete then insert), and update `body`, `additions`, `deletions`, `files_count` (`:201-235`). `pr_files.patch` is what the reviewer falls back to when `git diff` is unavailable ([review-flow.md](review-flow.md) RF-8).
- **PI-13** The whole refresh sits in one `try`; **any** error (GitHub, DB) logs a warning and serves persisted `pr_files`/`pr_commits` instead (`:238-269`).

## Manual poll — `POST /repos/:id/poll` (`modules/polling/routes.ts`)

- **PI-14** Syncs the PR list the same way (same four updated columns, `polling/routes.ts:49-56`) and sets `repos.last_polled_at`; returns `{ synced, reviewTriggered: false }`. It never starts a review: review is manual only.
- **PI-15** Unlike the list route it does **not** degrade: `container.github()` throwing makes it a 500 `config_error` when no token is set (`polling/routes.ts:28`).
- **PI-16** There is no scheduler: nothing calls `poll` periodically on the server.

## Inline comments (proxied, not persisted)

`GET /pulls/:id/comments` returns `[]` on a missing client or GitHub error; `POST /pulls/:id/comments` returns 400 `github_unavailable` without a token and 400 `github_comment_failed` when GitHub rejects (`pulls/routes.ts:289-342`). Comments are never stored locally.

## Review status derivation

`deriveReviewStatus` (`pulls/status.ts:35`) is pure; `status` in the DB is GitHub's merge state, the API `status` is derived on read (`pulls/routes.ts:163`):

| Condition (in order) | Result |
|----------------------|--------|
| `ghStatus` is `merged` or `closed` | that value (`status.ts:45`) |
| `last_reviewed_sha` null or ≠ `head_sha` | `needs_review` (`:46`) |
| `updated_at` older than `STALE_DAYS = 7` days | `stale` (`:47-48`) |
| otherwise | `reviewed` |

`last_reviewed_sha` is written only by a **successful** run ([review-flow.md](review-flow.md) RF-24); failed/cancelled runs leave the PR `needs_review`. Pinned by `test/pulls-status.test.ts`.

## Tests

`test/repos-url.test.ts` (URL parsing), `test/pulls-status.test.ts`, `test/pulls-comments.it.test.ts`, `test/reviews.it.test.ts:272` (severity counts), `test/git-adapter-safety.test.ts`.
