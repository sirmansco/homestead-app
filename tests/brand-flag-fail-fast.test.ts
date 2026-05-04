import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkBrandFlag } from '../lib/copy';

// Ship-blocker #9 regression: COVEY_BRAND_ACTIVE must fail loud at module load
// when unset or malformed in production. Silent fallback to Homestead means
// launch day silently doesn't happen.

describe('checkBrandFlag — pure validator', () => {
  it('returns "valid" when server flag is "true"', () => {
    expect(checkBrandFlag('true', undefined)).toBe('valid');
  });

  it('returns "valid" when server flag is "false"', () => {
    expect(checkBrandFlag('false', undefined)).toBe('valid');
  });

  it('returns "valid" when public flag is "true" and server is unset', () => {
    expect(checkBrandFlag(undefined, 'true')).toBe('valid');
  });

  it('returns "unset" when both flags are undefined', () => {
    expect(checkBrandFlag(undefined, undefined)).toBe('unset');
  });

  it('returns "malformed" for empty string', () => {
    expect(checkBrandFlag('', undefined)).toBe('malformed');
  });

  it('returns "malformed" for "yes"', () => {
    expect(checkBrandFlag('yes', undefined)).toBe('malformed');
  });

  it('returns "malformed" for "1"', () => {
    expect(checkBrandFlag('1', undefined)).toBe('malformed');
  });

  it('returns "malformed" for "TRUE" (case-sensitive)', () => {
    expect(checkBrandFlag('TRUE', undefined)).toBe('malformed');
  });

  it('returns "malformed" for garbage', () => {
    expect(checkBrandFlag('garbage', undefined)).toBe('malformed');
  });

  it('returns "malformed" when public flag is malformed', () => {
    expect(checkBrandFlag(undefined, 'maybe')).toBe('malformed');
  });
});

describe('lib/copy boot-time guard — production', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('warns when COVEY_BRAND_ACTIVE is unset in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.COVEY_BRAND_ACTIVE;
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(warnSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(payload.event).toBe('covey_brand_flag_unset');
    expect(payload.severity).toBe('warn');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('errors when COVEY_BRAND_ACTIVE is malformed in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.COVEY_BRAND_ACTIVE = 'yes';
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(errorSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(payload.event).toBe('covey_brand_flag_malformed');
    expect(payload.severity).toBe('error');
    expect(payload.serverValue).toBe('yes');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('stays silent when COVEY_BRAND_ACTIVE="false" in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.COVEY_BRAND_ACTIVE = 'false';
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays silent when COVEY_BRAND_ACTIVE="true" in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.COVEY_BRAND_ACTIVE = 'true';
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays silent in development even when unset', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    delete process.env.COVEY_BRAND_ACTIVE;
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays silent in development even when malformed', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.COVEY_BRAND_ACTIVE = 'garbage';
    delete process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE;
    await import('../lib/copy');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
