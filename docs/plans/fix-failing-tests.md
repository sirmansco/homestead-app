---
tags: [homestead, plan, tests, debug]
status: in-progress
last-updated: 2026-05-01
owner: matt
---

## Scope gate
**Goal:** fix 5 pre-existing failing tests in kid-avatar-upload.test.ts (×4) and member-card-layout.test.ts (×1).
**Success criteria:** `npm test` shows 0 failing tests, all 5 previously failing tests pass.
**Out of scope:** changing production logic in ScreenVillage.tsx; changing what the tests assert (only the extraction anchors).

## 1. Spec

Root cause: both test files use string-literal anchors to extract sections of ScreenVillage.tsx source. Those anchors were written against an older version of the source that used hardcoded strings. The source was refactored to use `getCopy()` dynamic copy, but the tests were never updated. The underlying feature is correctly implemented.

### kid-avatar-upload.test.ts (4 failing)
- Extraction anchor: looks for `'"The Kids"'` — source now uses `` `The ${getCopy().circle.kidLabel}s` ``
- Fix: update the marker to a stable string that still exists in that section, e.g., `getCopy().circle.kidLabel` or the `GroupHeader` call itself.

### member-card-layout.test.ts (1 failing)
- `GROUP_LABEL` assertion: test checks `cardSrc.indexOf('GROUP_LABEL', flexRowOpen)` — string `GROUP_LABEL` doesn't exist in source. Source uses `getGroupLabel()[villageGroup]`.
- The layout is structurally correct (action row IS outside flex row). Fix: update the test to search for the actual string `getGroupLabel` instead of `GROUP_LABEL`.

## 2. File map

| File | Change |
|---|---|
| `tests/kid-avatar-upload.test.ts` | Update `marker` string for kids section extraction |
| `tests/member-card-layout.test.ts` | Update `GROUP_LABEL` search string to `getGroupLabel` |

## 3. Graveyard
(empty at start)

## 4. Anchors
- `targetType="kid"`, `targetId={k.id}`, `onPhotoChange`, `targetType && targetId`, `type="file"` — all present in ScreenVillage.tsx source ✓
- Action row layout: `display: 'flex', alignItems: 'center', gap: 10` at line 116; action-row condition at line 165 — structurally correct ✓
- `Remove` / `Keep` buttons are outside the flex row ✓

## 5. Fragile areas
- The extraction logic uses `indexOf` against raw source text — any refactor of ScreenVillage.tsx indentation or string literals will break tests again. Long-term, these tests should use AST-based extraction, but that's out of scope here.
