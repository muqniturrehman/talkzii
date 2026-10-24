import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hmacSha256, safeEqual, sha256Hex } from '@/lib/crypto';

describe('AES-256-GCM token encryption', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const token = 'EAAG-business-integration-system-user-token';
    const a = encryptSecret(token);
    const b = encryptSecret(token);
    expect(a).not.toEqual(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a)).toBe(token);
    expect(decryptSecret(b)).toBe(token);
  });

  it('detects tampering via the auth tag', () => {
    const payload = encryptSecret('secret');
    const [v, iv, tag, data] = payload.split(':');
    const flipped = Buffer.from(data!, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64url')].join(':'))).toThrow();
  });

  it('rejects unknown formats', () => {
    expect(() => decryptSecret('plaintext')).toThrow(/Unsupported/);
  });
});

describe('hash helpers', () => {
  it('computes stable digests and compares in constant time', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hmacSha256('key', 'msg')).toHaveLength(64);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
