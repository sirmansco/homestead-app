import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCopy } from '../lib/copy';
import { homesteadCopy } from '../lib/copy.homestead';
import { coveyCopy } from '../lib/copy.covey';

describe('lib/copy — flag selector', () => {
  const original = process.env.COVEY_BRAND_ACTIVE;

  beforeEach(() => {
    delete process.env.COVEY_BRAND_ACTIVE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.COVEY_BRAND_ACTIVE;
    else process.env.COVEY_BRAND_ACTIVE = original;
  });

  it('returns homestead copy when flag is unset', () => {
    expect(getCopy().brand.name).toBe('Homestead');
  });

  it('returns homestead copy when flag is false', () => {
    process.env.COVEY_BRAND_ACTIVE = 'false';
    expect(getCopy().brand.name).toBe('Homestead');
  });

  it('returns covey copy when flag is true', () => {
    process.env.COVEY_BRAND_ACTIVE = 'true';
    expect(getCopy().brand.name).toBe('Covey');
  });

  it('homestead push titles match expected patterns', () => {
    const t = homesteadCopy;
    expect(t.urgentSignal.pushTitle('Smith family')).toBe('🔔 Smith family needs help');
    expect(t.request.pushTitle('Smith family')).toBe('📋 New shift — Smith family');
    expect(t.request.coveredTitle('Linda')).toBe('✅ Linda is on it');
    expect(t.emails.contact).toBe('hello@homestead.app');
    expect(t.icalendar.uidDomain).toBe('homestead.app');
    expect(t.urgentSignal.actionLabel).toBe('Ring the Bell');
    expect(t.request.acceptVerb).toBe('Claim');
  });

  it('covey push titles match expected patterns', () => {
    const t = coveyCopy;
    expect(t.urgentSignal.pushTitle('Smith family')).toBe('🪔 Smith family needs help');
    expect(t.request.pushTitle('Smith family')).toBe('📋 New Whistle — Smith family');
    expect(t.request.coveredTitle('Linda')).toBe('✅ Linda covered it');
    expect(t.emails.contact).toBe('hello@sirmans.co');
    expect(t.icalendar.uidDomain).toBe('joincovey.co');
    expect(t.urgentSignal.actionLabel).toBe('Light the Lantern');
    expect(t.request.acceptVerb).toBe('Cover');
  });

  it('both brands implement the same top-level AppCopy shape', () => {
    expect(Object.keys(homesteadCopy).sort()).toEqual(Object.keys(coveyCopy).sort());
  });

  it('flag false is byte-identical to unset (universal acceptance gate)', () => {
    process.env.COVEY_BRAND_ACTIVE = 'false';
    const flagOff = getCopy();
    delete process.env.COVEY_BRAND_ACTIVE;
    const flagUnset = getCopy();
    expect(flagOff).toBe(flagUnset); // same object reference — homesteadCopy
  });
});
