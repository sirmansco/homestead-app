export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUUID(id: unknown): string | null {
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}
