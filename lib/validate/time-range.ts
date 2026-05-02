export type TimeRangeError = { error: string; status: 400 };

export function parseTimeRange(
  rawStart: unknown,
  rawEnd: unknown,
  opts?: { maxWindowMs?: number },
): { starts: Date; ends: Date } | TimeRangeError {
  if (typeof rawStart !== 'string' || !rawStart || typeof rawEnd !== 'string' || !rawEnd) {
    return { error: 'startsAt and endsAt must be valid ISO 8601 dates', status: 400 };
  }

  const starts = new Date(rawStart);
  const ends = new Date(rawEnd);

  if (isNaN(+starts) || isNaN(+ends)) {
    return { error: 'startsAt and endsAt must be valid ISO 8601 dates', status: 400 };
  }

  if (ends <= starts) {
    return { error: 'endsAt must be after startsAt', status: 400 };
  }

  if (opts?.maxWindowMs !== undefined && +ends - +starts > opts.maxWindowMs) {
    return { error: 'time window exceeds maximum', status: 400 };
  }

  return { starts, ends };
}
