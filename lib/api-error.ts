import { NextResponse } from 'next/server';

export class NotAdminError extends Error {
  constructor() {
    super('No access');
    this.name = 'NotAdminError';
  }
}

export function apiError(err: unknown, fallback = 'Something went wrong', status = 500, tag?: string) {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[api${tag ? `:${tag}` : ''}]`, raw, err instanceof Error ? err.stack : undefined);
  return NextResponse.json({ error: fallback }, { status });
}

export function authError(err: unknown, tag?: string, fallback = 'Something went wrong') {
  if (err instanceof NotAdminError) return NextResponse.json({ error: 'no_access' }, { status: 403 });
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === 'Not signed in') return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (raw === 'No access') return NextResponse.json({ error: 'no_access' }, { status: 403 });
  if (raw === 'No active household') return NextResponse.json({ error: 'no_household' }, { status: 409 });
  return apiError(err, fallback, 500, tag);
}
