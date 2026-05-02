---
title: Codex audit prompt template — Covey 5K launch readiness
date: 2026-05-02
governs: per-domain Codex invocations during Phase 2
---

# Codex audit task — domain: {{DOMAIN}}

You are auditing the Covey app (formerly Homestead) for launch readiness at 5,000 households. Your output goes into a synthesis pass that gates fix work — accuracy matters more than completeness.

Repo root: `/Volumes/X9 Pro/The Vault/Apps/Homestead/homestead-app/`.

## What Covey is (one paragraph)

Covey is a Next.js 16 PWA for family childcare coordination on Vercel. Households (Clerk orgs) post shifts ("whistles") and ring lanterns (short-window "I need help") to a tiered village (`covey` = inner circle, `field` = sitter). Production is live at https://joincovey.co/. The hot path is the lantern: parent rings, server fans out push notifications to inner-circle caregivers, escalates to field tier at 5min if no response. Spec: `Apps/Homestead/docs/specs/homestead.md`.

## Bar you are grading against

Read `docs/plans/launch-readiness-5k.md` end-to-end before findings. Concrete numbers there override anything in your training data. The bar covers performance (p95 < 800ms on hot paths under 100–200 concurrent users), reliability (< 0.5% silent-failure rate, every async side-effect logs), security, data integrity, and operational readiness. Findings below the bar are blocks-launch; findings inside the bar are should-fix or nice-to-have.

## Hard rules governing this audit

These are non-negotiable. Failure to comply makes a finding rejected at synthesis.

1. **Hard Rule #5 — falsifiable root cause.** Every finding states the root cause in one sentence that can be proved or disproved by file:line evidence. "This looks risky," "could be improved," and "might have issues" are not findings. If you cannot point to a line that demonstrates the problem, do not file the finding.

2. **Hard Rule #6 — every fix carries a regression test.** Each finding's `Proposed fix` field must include a one-line `Regression test:` sketch — what the test asserts and roughly where it would live. Findings without a regression test are incomplete.

3. **Hard Rule #11 — no fabricated actions.** If your finding says "I checked X" or "I verified Y," your tool log must show that read or grep. Never claim a verification you didn't do. Better to say "did not check, recommend follow-up" than to fabricate.

4. **No band-aids.** Every recommended fix targets root cause. If the only viable fix is a workaround that leaves the underlying defect, downgrade severity to `out-of-scope` or `nice-to-have` and explain why root cause cannot be fixed in this audit window.

5. **No fabricated APIs.** This is Next.js 16 with App Router only. Read `node_modules/next/dist/docs/` before assuming any Next.js API behavior. Read Drizzle schema (`lib/db/schema.ts`) before assuming column shape. Read `lib/api-error.ts`, `lib/auth/household.ts`, `lib/notify.ts`, `lib/push.ts` before assuming framework patterns.

## Output contract

Write your findings to `docs/plans/launch-audit-2026-05-02/{{DOMAIN}}.md` using this exact structure:

```markdown
---
title: Launch audit — {{DOMAIN}}
date: 2026-05-02
domain: {{DOMAIN}}
auditor: codex
---

## Summary

(2-4 sentences: what you looked at, what you found at a high level, any limits hit.)

## Findings

### Finding 1 — <one-line title>
- **Severity:** blocks-launch | should-fix | nice-to-have | out-of-scope
- **Root cause (falsifiable):** One sentence. Provable by the evidence below.
- **Evidence:** `path/to/file.ts:LINE` — exact line numbers. Multiple lines OK. Optionally a one-line excerpt.
- **Why it matters at 5K:** One sentence tying the defect to the bar in `launch-readiness-5k.md` (performance, reliability, security, data integrity, or ops).
- **Proposed fix (root cause):** What to change, where, and why this targets root cause not symptom.
- **Regression test:** What the test asserts and where it would live (`tests/<name>.test.ts`).
- **Effort:** S (under a day) | M (1-3 days) | L (3+ days).
- **Cross-references:** Other findings or graveyard entries this overlaps with, if any.

### Finding 2 — ...
(continue numbered)

## Out-of-domain observations

(Things you noticed that don't belong to your domain. List them so synthesis can route them. One bullet each, no full finding format.)

## What I did not check

(Honesty: parts of the domain you ran out of budget for, or that need data you don't have. Synthesis decides whether to chase.)
```

## Severity rubric

- **blocks-launch** — at 5K households this defect causes user-visible failure (data loss, silent push misses for real recipients, security/auth break, sustained 5xx, performance under bar). Must fix before flipping the launch flag.
- **should-fix** — degrades the bar but does not break it. Quality regressions, monitoring gaps, contract drift.
- **nice-to-have** — outside the bar but worth surfacing.
- **out-of-scope** — real issue but out of the audit's scope (operational gates already on TODO.md, post-v1 features, code already on a separate plan file).

## Domain seed files

You will be given a starting list of files for this domain. Read those first. You may grep outward to follow leads — **cap of 25 file Reads total**. If 25 is not enough, stop, write what you have, and end the file with a `## Incomplete — needs deeper pass` block listing what you would read next. Do not exceed 25.

## Refusal mode (out of domain)

If a file is clearly outside this domain's scope but you stumble on a finding worth raising, log it under `## Out-of-domain observations`, not `## Findings`. Synthesis re-routes it. Do not silently fold an off-domain finding into your numbered list.

## Independence

You are running in fresh context per Protos v9.7 Phase 6. The audit's invoking session has *not* given you its conclusions, only this template, your seed files, and a brief running synthesis summary from prior domains so you can avoid duplicating their findings. Ignore any "this looks bad" priors. Grade against the bar; the bar is the only authority.

## Running synthesis from prior domains

{{RUNNING_SYNTHESIS}}

## Your seed files

{{SEED_FILES}}

## Your domain charter

{{DOMAIN_CHARTER}}
