import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Structural rule: only lib/notify.ts is allowed to import @/lib/push or
// the raw web-push module. Routes that try to ad-hoc-push notifications
// (which bypasses preference checks, recipient resolution, and email)
// fail this test. See bug #3.

const APP_ROOT = join(__dirname, '..');
const APP_DIR = join(APP_ROOT, 'app');

// Modules that may import push primitives. lib/notify.ts is the canonical
// consumer; lib/push.ts is itself the module that defines them.
// app/api/push/test/route.ts is a diagnostic endpoint that targets the
// caller's own subscriptions — no notify-level recipient resolution needed.
const ALLOWED_FILES = new Set([
  join(APP_ROOT, 'lib', 'notify.ts'),
  join(APP_ROOT, 'lib', 'push.ts'),
  join(APP_ROOT, 'app', 'api', 'push', 'test', 'route.ts'),
]);

const FORBIDDEN_IMPORTS = [
  /from ['"]@\/lib\/push['"]/,
  /from ['"]web-push['"]/,
  /import\(['"]@\/lib\/push['"]\)/,
  /import\(['"]web-push['"]\)/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('notify-module isolation', () => {
  it('no file under app/ imports @/lib/push or web-push', () => {
    const files = walk(APP_DIR);
    const offenders: { file: string; match: string }[] = [];

    for (const file of files) {
      if (ALLOWED_FILES.has(file)) continue;
      const src = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN_IMPORTS) {
        const m = src.match(re);
        if (m) {
          offenders.push({ file: relative(APP_ROOT, file), match: m[0] });
          break;
        }
      }
    }

    expect(offenders, `Routes must call lib/notify.ts, not push primitives directly:\n${
      offenders.map(o => `  ${o.file}: ${o.match}`).join('\n')
    }`).toEqual([]);
  });
});
