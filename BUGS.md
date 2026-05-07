# Bug log moved

Per the project's "two repos rule" in vault memory, the canonical bug log
lives at the **vault path**, not inside the app repo:

- **Canonical:** `Apps/Covey/BUGS.md` (vault path, one level up)
- This file: stale duplicate, kept only as a redirect

Bugs and TODOs belong at the vault path. Code belongs in this app repo. A
parallel `BUGS.md` here causes sessions to read the wrong one and miss
active work — confirmed during the 2026-05-06 Circle / invite / role
audit, where this file claimed the only active bugs were two iOS push
items (already fixed) while the canonical vault file actually had ten
fresh entries.

Move new bug reports to the vault path. Do not re-populate this file.
