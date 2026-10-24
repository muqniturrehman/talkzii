/**
 * Phone helpers. WhatsApp IDs (wa_id) are international numbers as digits
 * only, e.g. 923001234567. Pakistan (92) is the default country.
 */
export const DEFAULT_COUNTRY_CODE = '92';

/**
 * Normalises user input to a wa_id, or null when it can't be a valid number.
 * Handles "+92 300 1234567", "0092…", national "0300-1234567" and bare
 * subscriber numbers ("3001234567") using the default country code.
 */
export function normalizePhone(input: string | number | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (input === null || input === undefined) return null;
  let raw = String(input).trim();
  if (!raw) return null;
  // Spreadsheet exports turn long numbers into "9.23001234567E+11".
  if (/^\d(\.\d+)?e\+\d+$/i.test(raw)) raw = Number(raw).toFixed(0);

  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  const cc = defaultCountryCode.replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;

  if (!hasPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = cc + digits.replace(/^0+/, '');
    else if (!digits.startsWith(cc) && digits.length <= 10) digits = cc + digits;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  // Pakistani mobiles: 92 + 3XX + 7 digits.
  if (digits.startsWith('92') && digits[2] === '3' && digits.length !== 12) return null;
  return digits;
}

/** "+92 300 1234567" for Pakistani mobiles, "+<digits>" otherwise. */
export function formatPhone(waId: string | null | undefined): string {
  if (!waId) return '';
  const digits = waId.replace(/\D/g, '');
  if (/^923\d{9}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (/^1\d{10}$/.test(digits)) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}
