import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function privateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function privateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
  // IPv4-mapped, dotted (::ffff:127.0.0.1) or hex as WHATWG URL normalises it (::ffff:7f00:1).
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return privateV4(dotted[1]!);
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1]!, 16);
    const low = parseInt(hex[2]!, 16);
    return privateV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? privateV6(ip) : privateV4(ip);
}

/**
 * SSRF guard for customer-supplied webhook URLs: https only (http://localhost
 * outside production) and the host must not resolve to a private address.
 */
export async function assertPublicUrl(raw: string, options: { allowLocalhost?: boolean } = {}): Promise<URL> {
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (local && options.allowLocalhost && url.protocol === 'http:') return url;
  if (url.protocol !== 'https:') throw new Error('Webhook URLs must use https.');
  if (url.username || url.password) throw new Error('Webhook URLs cannot contain credentials.');
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve ${host}.`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Webhook URLs must point to a public internet address.');
  }
  return url;
}
