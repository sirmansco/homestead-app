---
tags: [homestead, plan, vercel, toolbar]
status: in-progress
last-updated: 2026-05-01
owner: matt
---

## Scope gate
**Goal:** wire up Vercel toolbar for visual design review on preview deployments.
**Success criteria:** visiting a preview deployment URL shows the Vercel toolbar (comment pin, inbox); toolbar does not appear on production (`joincovey.co`) for regular visitors.
**Out of scope:** toolbar on localhost; production enablement beyond env-gating.

## 1. Spec

Install `@vercel/toolbar` and create a `StaffToolbar` client component gated on `NEXT_PUBLIC_VERCEL_ENV === 'preview'`. Inject it into `app/layout.tsx` inside a `<Suspense>` boundary per Vercel's recommended App Router pattern.

## 2. File map

| File | Change |
|---|---|
| `package.json` | add `@vercel/toolbar` dependency |
| `app/components/StaffToolbar.tsx` | new 'use client' component — renders `<VercelToolbar />` only on preview env |
| `app/layout.tsx` | import StaffToolbar + wrap in Suspense in `<body>` |

## 3. Graveyard
(empty at start)

## 4. Anchors
- Toolbar already enabled on preview deployments by default in Vercel dashboard — package just ensures it renders
- `NEXT_PUBLIC_VERCEL_ENV` is set automatically by Vercel: `'preview'` on PR deployments, `'production'` on main

## 5. Fragile areas
- `app/layout.tsx` is a Server Component — StaffToolbar must be `'use client'` and wrapped in `Suspense` (per Vercel docs pattern)
- Don't add Clerk auth check — toolbar only shows to authenticated Vercel team members anyway
