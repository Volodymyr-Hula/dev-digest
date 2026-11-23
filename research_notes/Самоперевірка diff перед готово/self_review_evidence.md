# Evidence and best practices for LLM agent self-review of its own diff (as of 2026-11-23)

Method note: ~19 searches/fetches. Most vendor figures are self-reported; labelled as such. Several search results were summaries by the search tool of primary pages; where I fetched the primary page I say so.

## 1. Self-correction without external feedback: when it helps vs hurts

### Takeaway
Intrinsic self-critique (no tests/tools/oracle) is empirically unreliable: it can flip correct answers to wrong and gains in early papers largely came from oracle labels or external signals. Self-review works when anchored to external feedback (compiler, tests, tools, retrieval).

### Cited Findings
- Huang et al. (Google DeepMind/UIUC, arXiv Oct 2023, v2 Mar 2024): LLMs struggle to self-correct reasoning without external feedback and performance can degrade; earlier positive results used oracle correctness labels. GSM8K GPT-3.5: 75.9% -> 74.7% after two self-correction rounds; correct->incorrect flips 8.8% vs incorrect->correct 7.6% (figures via search summary of the paper). — [arXiv 2310.01798](https://arxiv.org/abs/2310.01798)
- Kamoi et al. critical survey (TACL 2024, covers up to May 2024): no prior work shows successful self-correction with feedback from prompted LLMs in general tasks; self-correction works well where reliable external feedback exists, or tasks with exceptionally favorable properties (e.g., decomposable responses), or with fine-tuning on large data. — [arXiv 2406.01297](https://arxiv.org/abs/2406.01297)
- CRITIC (Gou et al., ICLR 2024): the LLM verifies its output via external tools (search, code interpreter) then revises; gains on QA, math program synthesis, toxicity. Authors also report that self-correction without external feedback gives small gains or can hurt. — [arXiv 2305.11738](https://arxiv.org/abs/2305.11738)
- Self-Refine (Madaan et al., NeurIPS 2023): same-model feedback/refine loop, ~20% absolute average gain over 7 tasks (not code-specific; I did not verify code-only results). Huang et al. argue such gains partly depend on setup/oracles. — [NeurIPS abstract](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract.html)
- Reflexion (Shinn et al.): 91% pass@1 HumanEval vs 80% GPT-4; feedback sources include environment signals and self-written unit tests (which source drove the number not confirmed by me). — [arXiv 2303.11366](https://www.arxiv.org/pdf/2303.11366v2)
- Self-preference bias: evaluators recognize and favor own generations; preference correlates with self-recognition (NeurIPS 2024). — [arXiv 2404.13076](https://arxiv.org/abs/2404.13076v1). Follow-up (2025): part of self-preference is legitimate (own output really better) but a harmful component persists when the evaluator is wrong as generator, stronger in stronger models; long CoT before verdict reduces harmful self-preference. — [arXiv 2504.03846](https://arxiv.org/abs/2504.03846v3)
- Anthropic's Claude Code best-practices doc frames giving Claude a check it can run (tests, build, screenshot) as the key to unattended sessions; context fills fast and performance degrades. — [code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices) (via search snippet; detailed sections not read)

### Inferences
- A "re-read my diff and critique" step with no runnable evidence is the theatre case; the skill should require evidence (command output, grep results, test run) for each checklist item rather than assertions.
- Forcing explicit reasoning before verdict (per the 2025 self-preference result) is a cheap mitigation.

### Gaps
- No 2024-2026 controlled study found measuring self-review of agent diffs specifically (SWE-bench-style) with/without external signals. Did not retrieve post-2024 self-correction papers beyond the above (e.g., RL-trained self-correction).

## 2. Same-context vs fresh-context reviewer; ensembles; adversarial verification

### Takeaway
Practitioners and a small preprint favor a fresh-context reviewer given only diff + rules; evidence is thin and modest. Production tools use parallel passes plus a separate verifier; multiple runs find different things, so a single clean pass is not proof.

### Cited Findings
- "Cross-Context Review" preprint (single author, not peer reviewed): 30 artifacts, 150 injected errors, 360 reviews; fresh-session review F1 28.6% vs same-session self-review 24.6% (p=0.008, d=0.52), 2nd same-session 21.7%, context-aware subagent 23.8%. Effect modest; absolute F1 low; not necessarily code. — [arXiv 2603.12123](https://arxiv.org/abs/2603.12123)
- Augment guide (vendor): reviewer gets only diff + criteria, not generator's reasoning; read-only tools for reviewer subagents; cross-model review often preferred. — [Augment](https://www.augmentcode.com/guides/adversarial-code-review)
- Towards AI piece argues the real reason for a separate reviewer is context load more than bias; cites Xu et al. self-bias in six LLMs amplified by self-refinement (no code tasks). — [Towards AI](https://pub.towardsai.net/why-uncle-bob-and-matt-pocock-give-code-review-its-own-agent-928f3f68743b) (paywalled, via summary)
- Cursor Bugbot (vendor, fetched): parallel bug-finding passes, each with a different diff ordering, majority vote drops findings from only one pass; then a validator model; category filter; dedupe vs prior runs. — [Cursor blog](https://cursor.com/blog/building-bugbot)
- Anthropic Code Review (vendor, fetched): team of agents find bugs in parallel, verification step filters false positives, rank by severity; does not approve PRs. — [claude.com/blog/code-review](https://claude.com/blog/code-review)
- Repeated review runs keep producing new findings (12, 8, 5 in an anecdote); Semgrep reportedly 3/6/11 findings on identical runs; SWR-Bench aggregating 10 runs raised recall 118% (secondhand, via blog). Clean run is not a stopping signal. — [DEV post](https://dev.to/brightgir/the-never-ending-ai-code-review-why-one-pass-isnt-enough-3k05)
- Practice: judge verdict advisory, machine check is the gate. — [DEV](https://dev.to/agateon/no-agent-grades-its-own-homework-4hgk) (anecdotal)

### Inferences
- For a Claude Code skill: spawn a subagent with only `git diff` + rule files + changed-file read access, read-only, not the transcript. Single reviewer pass is stochastic; scoping by domain checklist (one focused pass per domain) approximates ensembling cheaply.

### Gaps
- No rigorous production-code evidence that fresh-context beats same-context beyond the one preprint. Did not verify 2603.12123 by fetching the full paper.

## 3. False positives and noise control in leading tools

### Takeaway
Common recipe: scope to the diff, generate candidates broadly, then verify each (second model, tool-based evidence, voting), threshold/rank by severity, cap volume, filter categories. Published precision numbers are all vendor-self-reported with incompatible metrics.

### Cited Findings
- Anthropic Code Review: "less than 1% of findings are marked incorrect by engineers" (internal, engineer-agreement metric); PRs >1,000 lines: 84% get findings, avg 7.5; <50 lines: 31%, avg 0.5; substantive comments 16% -> 54% of PRs; avg ~20 min, $15-25/review. Can surface pre-existing bugs in adjacent code. — [claude.com/blog/code-review](https://claude.com/blog/code-review)
- Anthropic open-source code-review plugin: reportedly confidence threshold 80/100, parallel agents (CLAUDE.md compliance, bug detector, history), separate scoring step; details come from third-party write-ups of source, agent count varies (4 vs 5). — [DeepWiki](https://deepwiki.com/anthropics/claude-plugins-official/7.2.4-code-review-plugin); conflict noted at [learn-prompting](https://learn-prompting.fr/blog/claude-code-review-plugin-guide)
- Cursor Bugbot: resolution rate 52% -> >70% over ~40 experiments, bugs/run 0.4 -> 0.7 (Jan 2026); later claims 78.13% over 50,310 PRs vs Greptile 63.49%, CodeRabbit 48.96% (Cursor's own table, Apr 2026). Resolution rate is a precision proxy; unresolved is assumed false positive. — [building bugbot](https://cursor.com/blog/building-bugbot), [bugbot learning](https://cursor.com/blog/bugbot-learning)
- CodeRabbit: generates grep/ast-grep/Python checks in a sandbox to confirm assumptions before posting; low-value feedback filtered; linter output validated by verification agent. — [CodeRabbit via DEV](https://dev.to/coderabbitai/how-coderabbits-agentic-code-validation-helps-with-code-reviews-nak). Caution: empty grep does not prove a bug (third-party) — [substack](https://theaiengineer.substack.com/p/how-coderabbit-actually-works)
- GitHub Copilot code review: combines LLM with deterministic tools (CodeQL default on, ESLint, PMD optional); agentic tool-calling GA Mar 5 2026. GitHub blog: swapping in better tools initially made reviews worse; fix was instructions to anchor on the diff, narrow with grep/glob, read targeted ranges; ~20% lower cost, quality maintained; no precision figures. — [changelog](https://github.blog/changelog/2026-03-05-copilot-code-review-now-runs-on-an-agentic-architecture/), [GitHub blog](https://github.blog/ai-and-ml/github-copilot/better-tools-made-copilot-code-review-worse-heres-how-we-actually-improved-it/), [linter changelog](https://github.blog/changelog/2025-11-20-linter-integration-with-copilot-code-review-now-in-public-preview/)
- Graphite: vendor claims FP rate under 3% / 5-8% (no method); downvote rate <4% with unspecified denominator; 96% positive feedback and 67% implementation rate in Anthropic case study. Earlier fix for false concerns: function-calling. — [Graphite guide](https://graphite.com/guides/ai-code-review-false-positives), [Anthropic case study](https://graphite.dev/blog/how-graphite-uses-claude)
- Greptile: 82% catch rate on 50 bug-fix PRs (vendor; false positives not counted); 66.2% precision claim from Morph (methodology unknown); independent-ish small posts conflict (11 FP vs CodeRabbit 2; or 0 FP in 120 findings). — [Greptile benchmarks](https://greptile.com/benchmarks), [Qodo overview](https://www.qodo.ai/glossary/what-is-ai-code-review-benchmarks/)
- Google AutoCommenter (ICSE-SEIP 2024): chose very high precision to protect developer experience; confidence threshold suppresses low-score predictions; threshold calibrated on temporal split; stale guidance caused complaints. Exact precision numbers not retrieved. — [arXiv 2405.13565](https://arxiv.org/abs/2405.13565)
- Google ML-suggested edits for review comments: 7.5% of reviewer comments addressed via applied ML edit (abstract). — [Google Research](https://research.google/pubs/resolving-code-review-comments-with-machine-learning/)
- Qodo: no primary numbers retrieved; only appears as source of benchmark commentary.

### Inferences
- Concrete knobs for the skill: report only issues anchored to a changed line (or directly caused by it); require quoted evidence (file:line + command output) per finding; drop findings lacking evidence; severity tiers; cap (e.g. top N) with the rest summarized; drop style/lint-class items already covered by tooling.
- Do not trust cross-vendor precision numbers; the metrics (resolution rate, downvote, "marked incorrect", catch rate) are not comparable.

### Gaps
- No independent, peer-reviewed precision/acceptance data for any tool. Qodo, Graphite Diamond specifics, and the exact Anthropic plugin prompt not verified from primary source.

## 4. Checklist/rubric-driven review

### Takeaway
I found no controlled study showing a prompt checklist beats generic "review this" on bug detection. Indirect support: tools win by feeding project rules (CLAUDE.md compliance agents, custom checks, learned rules) and by narrow focus.

### Cited Findings
- Sphinx (arXiv Jan 2026): checklists used to evaluate/train PR review models; up to 40% higher checklist coverage, but via training, not prompting. — [arXiv 2601.04252](https://arxiv.org/html/2601.04252v1)
- Ericsson experience report compared simple/detailed/security/few-shot prompts; results not extracted by me. — [arXiv 2507.19115](https://arxiv.org/pdf/2507.19115)
- Anthropic plugin dedicates agents to CLAUDE.md compliance (third-party description, see section 3). Bugbot "learned rules" feature raises resolution rate (vendor). — [bugbot learning](https://cursor.com/blog/bugbot-learning)
- GitHub: narrow, diff-anchored instructions improved review cost without quality loss. — [GitHub blog](https://github.blog/ai-and-ml/github-copilot/better-tools-made-copilot-code-review-worse-heres-how-we-actually-improved-it/)
- Rubric length: no evidence found.

### Inferences
- Treat checklists as opinion-backed: make each item a concrete, checkable, repo-specific question (e.g. "does any route handler import an adapter or db?" answerable by grep) and keep per-domain lists short; load only domains touched by the diff.

### Gaps
- Rubric length/focus effect: no data. Controlled checklist-vs-generic comparisons for LLM review not found.

## 5. Ordering: deterministic gates first

### Takeaway
Consistent practitioner/vendor direction: run deterministic tools first and feed their results to the LLM; LLM review adds what tools cannot check. No ablation data on order specifically.

### Cited Findings
- Copilot code review pairs LLM with CodeQL/ESLint/PMD and hands fixes to the coding agent. — [GitHub changelog Oct 2025](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/)
- CodeRabbit validates linter output with a verification agent to cut noise. — [CodeRabbit via DEV](https://dev.to/coderabbitai/how-coderabbits-agentic-code-validation-helps-with-code-reviews-nak)
- Anthropic best practices: provide runnable verification (tests/build/screenshots); a bundled `/verify` skill and `/code-review` skill used together (via search results). — [Anthropic docs](https://code.claude.com/docs/en/best-practices), [claude.com article](https://claude.com/ja/resources/articles/building-verification-loops-in-claude-code-with-skills)
- Google AutoCommenter: 66% of practices went beyond what static analysis can check (secondary coverage) — supports LLM layer for non-lintable rules. — [DX newsletter](https://newsletter.getdx.com/p/ai-assisted-code-reviews-at-google)

### Inferences
- Order: typecheck/tests/greps (deterministic, cheap, binary) -> LLM review of residue the gates cannot express (architecture, semantics, missing tests). For this repo: `pnpm typecheck`/`npm run typecheck` in touched packages, relevant tests, protected-file check (git diff on migrations/lockfiles), then checklist.

### Gaps
- No published comparison of gates-first vs LLM-first.

## 6. Handling findings: auto-fix vs report vs ask; fix loops; termination

### Takeaway
Evidence is mostly opinion. Strongest signals: tools keep human as approver, reviewers re-run find new issues (no natural fixed point), so termination must be predefined and bounded.

### Cited Findings
- Anthropic Code Review does not approve PRs; human retains approval. — [claude.com/blog/code-review](https://claude.com/blog/code-review)
- Judge verdict advisory; deterministic check is the gate (anecdotal). — [DEV](https://dev.to/agateon/no-agent-grades-its-own-homework-4hgk)
- Repeat passes keep surfacing new findings; commenters argue for predefined acceptance criteria / "done" signal; fix is reduced scope per pass, not more runs. — [DEV](https://dev.to/brightgir/the-never-ending-ai-code-review-why-one-pass-isnt-enough-3k05)
- Huang et al.: unsupervised revision rounds can flip correct to incorrect, so each revision should be re-validated by tests. — [arXiv 2310.01798](https://arxiv.org/abs/2310.01798)
- Google: ML-suggested fix to review comments — applied for ~7.5% of comments; fixes are suggestions author applies. — [Google Research](https://research.google/pubs/resolving-code-review-comments-with-machine-learning/)
- Graphite reports 67% implementation rate of AI comments (vendor). — [Graphite](https://graphite.dev/blog/how-graphite-uses-claude)

### Inferences (opinion, not evidence)
- Auto-fix only high-confidence, evidenced, local findings within the task's scope (own-diff defects), then re-run the deterministic gates; report-and-ask for anything involving scope change, design choices, protected files, or contested findings.
- Bounded loop: one review pass, one fix pass, one re-verify of gates and only the fixed items; stop at max 2 rounds or when no new evidenced findings of severity >= medium; do not re-run full review for a "clean" signal. Anything unresolved is reported to the user, not silently dropped.
- Never let the reviewer weaken tests/gates to pass.

### Gaps
- No empirical study of auto-fix vs ask thresholds or loop-count optimum for agent self-review. Practitioner pieces by Willison/Osmani were not retrieved (not searched specifically).
