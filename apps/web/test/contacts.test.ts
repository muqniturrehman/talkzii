import { describe, expect, it } from 'vitest';
import { csvCell, prepareImportRows } from '@/lib/contacts/import';

describe('contact import preparation', () => {
  it('normalises phones with the default country, dedupes and reports invalid rows', () => {
    const { valid, invalid } = prepareImportRows(
      [
        { row: 2, phone: '0300 1234567', name: ' Ayesha ', email: 'ayesha@example.com', labels: ['VIP', 'VIP', ' '], customFields: { city: 'Lahore', empty: ' ' } },
        { row: 3, phone: '+92 300 1234567', name: 'Duplicate' },
        { row: 4, phone: '12', name: 'Too short' },
        { row: 5, phone: '', name: 'No phone' },
        { row: 6, phone: '+44 7700 900123', email: 'not-an-email' },
        { row: 7, phone: '+1 415 555 0100' },
      ],
      '92',
    );
    expect(valid).toEqual([
      { row_number: 2, wa_id: '923001234567', name: 'Ayesha', email: 'ayesha@example.com', custom_fields: { city: 'Lahore' }, labels: ['VIP'] },
      { row_number: 7, wa_id: '14155550100', name: null, email: null, custom_fields: {}, labels: [] },
    ]);
    expect(invalid.map((i) => i.row)).toEqual([3, 4, 5, 6]);
    expect(invalid[0]?.reason).toContain('Duplicate');
    expect(invalid[2]?.reason).toBe('Missing phone number');
  });

  it('escapes CSV cells and neutralises formula injection', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
    expect(csvCell({ tier: 'gold' })).toBe('"{""tier"":""gold""}"');
  });
});
