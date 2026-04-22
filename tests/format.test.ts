import { describe, it, expect } from 'vitest';
import { shortName } from '../lib/format';

describe('shortName', () => {
  it('handles empty / whitespace', () => {
    expect(shortName('')).toBe('');
    expect(shortName('   ')).toBe('');
  });

  it('formats a full name as First L.', () => {
    expect(shortName('Matt Sirmans')).toBe('Matt S.');
    expect(shortName('Maria De La Cruz')).toBe('Maria C.');
  });

  it('capitalizes a lowercase first name', () => {
    expect(shortName('matt sirmans')).toBe('Matt S.');
  });

  it('handles email addresses', () => {
    expect(shortName('matt.sirmans@gmail.com')).toBe('Matt Sirmans');
    expect(shortName('mjsirmans@gmail.com')).toBe('Mjsirmans');
    expect(shortName('first_last@example.com')).toBe('First Last');
  });

  it('handles slug-style names', () => {
    expect(shortName('matt.sirmans')).toBe('Matt Sirmans');
    expect(shortName('first_last')).toBe('First Last');
  });

  it('capitalizes a single lowercase token', () => {
    expect(shortName('mjsirmans')).toBe('Mjsirmans');
    expect(shortName('matt')).toBe('Matt');
  });

  it('leaves mixed-case single tokens alone', () => {
    expect(shortName('iPhone')).toBe('iPhone');
    expect(shortName('McDonald')).toBe('McDonald');
  });
});
