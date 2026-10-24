import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from '../src/phone';

describe('normalizePhone', () => {
  it.each([
    ['+92 300 1234567', '923001234567'],
    ['0092-300-1234567', '923001234567'],
    ['03001234567', '923001234567'],
    ['3001234567', '923001234567'],
    ['923001234567', '923001234567'],
    ['(0300) 123 4567', '923001234567'],
    ['9.23001234567E+11', '923001234567'],
    ['+1 (415) 555-0100', '14155550100'],
    ['+44 7700 900123', '447700900123'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('uses the workspace default country code for national numbers', () => {
    expect(normalizePhone('07700 900123', '44')).toBe('447700900123');
    expect(normalizePhone('050 123 4567', '971')).toBe('971501234567');
  });

  it.each(['', 'abc', '123', '+92 300 12345', '00000000000', null, undefined])('rejects %s', (input) => {
    expect(normalizePhone(input as string)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('groups Pakistani mobiles and falls back to +digits', () => {
    expect(formatPhone('923001234567')).toBe('+92 300 1234567');
    expect(formatPhone('14155550100')).toBe('+1 415 555 0100');
    expect(formatPhone('447700900123')).toBe('+447700900123');
  });
});
