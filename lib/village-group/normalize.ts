// Normalizes legacy village_group enum values to the canonical post-migration
// values. Must be called at every write boundary before inserting or updating
// users.villageGroup. The legacy labels (inner_circle, sitter) remain in the
// Postgres enum until a follow-up migration confirms zero rows; this helper
// prevents new rows from ever being written with old values.
//
// Mapping: inner_circle → covey, sitter → field.
// Default for null/undefined/unknown: 'field'.
export function normalizeVillageGroup(
  value: string | null | undefined,
): 'covey' | 'field' {
  if (value === 'covey' || value === 'inner_circle') return 'covey';
  if (value === 'field' || value === 'sitter') return 'field';
  return 'field';
}
