import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the built-in agents (General + Security +
 * Performance + API Contract), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Later milestones populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset). One file per smart-diff role; src/config.ts carries a
    // hunk whose new line 12 is the seeded CRITICAL finding, src/api/users.ts a
    // hunk that does not reach line 45 (so its finding is off-patch).
    const configPatch = [
      '@@ -9,3 +9,7 @@',
      ' export const config = {',
      '   port: Number(process.env.PORT ?? 3000),',
      '+  // rate limiting',
      "+  stripeKey: 'sk_live_xxxxxxxxxxxxxxxx',",
      '+  rateLimitMax: 100,',
      '+  rateLimitWindowMs: 60_000,',
      ' };',
    ].join('\n');
    const usersPatch = [
      '@@ -10,6 +10,11 @@',
      ' export async function listUsers(db: Db) {',
      '-  const rows = await db.select().from(users);',
      '-  return rows;',
      '+  const rows = await db.select().from(users);',
      '+  const limited = rows.slice(0, 100);',
      '+  return limited.map(toDto);',
      '+}',
      '+',
      '+function toDto(row: UserRow) {',
      '+  return { id: row.id, name: row.name };',
      ' }',
      ' ',
      ' export const usersRoute = "/users";',
    ].join('\n');
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0, patch: configPatch },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2, patch: usersPatch },
      {
        prId: pr!.id,
        path: 'src/middleware/ratelimit.test.ts',
        additions: 3,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,3 @@',
          "+import { describe, it } from 'vitest';",
          "+describe('ratelimit', () => {",
          "+  it.todo('rejects the 101st request in a window');",
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: '.env.example',
        additions: 2,
        deletions: 0,
        patch: ['@@ -1,1 +1,3 @@', ' PORT=3000', '+RATE_LIMIT_MAX=100', '+RATE_LIMIT_WINDOW_MS=60000'].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'docs/rate-limiting.md',
        additions: 2,
        deletions: 0,
        patch: ['@@ -0,0 +1,2 @@', '+# Rate limiting', '+Public endpoints allow 100 requests per minute per client.'].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'pnpm-lock.yaml',
        additions: 2,
        deletions: 1,
        patch: ['@@ -10,2 +10,3 @@', ' lockfileVersion: 9', '-  bucket: 1.0.0', '+  bucket: 1.1.0', '+  limiter: 2.0.0'].join('\n'),
      },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- PR #482 intent (shown on the PR page; no LLM call needed) ----
  await db
    .insert(t.prIntent)
    .values({
      prId: pr!.id,
      intent: 'Add token-bucket rate limiting to the public API so unauthenticated clients cannot abuse it.',
      intentClass: 'feature',
      rationale: 'The title and description both describe a new rate limiter on the public endpoints.',
      confidence: 'medium',
      inScope: ['Rate-limiting middleware for public endpoints', 'Rate-limit configuration'],
      outOfScope: ['Authenticated API behaviour', 'Billing logic'],
      sources: [
        { kind: 'title', ref: 'title', status: 'used', chars: 41 },
        { kind: 'description', ref: 'description', status: 'used', chars: 89 },
        { kind: 'branch', ref: pr!.branch, status: 'used' },
        { kind: 'commits', ref: '1 commit(s)', status: 'used' },
        { kind: 'paths', ref: '4 file(s)', status: 'used' },
        { kind: 'diff_stats', ref: '+247/-38', status: 'used' },
        { kind: 'ticket_key', ref: 'PAY-482', status: 'referenced_not_fetched' },
      ],
      source: 'model',
      headSha: pr!.headSha,
    })
    .onConflictDoNothing();

  // ---- built-in agents (the starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Catches breaking API contract changes, route/schema drift and status-code mistakes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
