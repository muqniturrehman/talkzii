import { z } from 'zod';
import type { ComplianceSettings } from './schemas/workspace';

/** Retention choices offered in Settings → Compliance (null = keep forever). */
export const RETENTION_OPTIONS = [30, 90, 180, 365, 730, null] as const;

/**
 * Normalises a keyword or an inbound message for matching: Unicode NFKC,
 * collapsed whitespace, surrounding punctuation (incl. Urdu ۔ ، ؟) removed,
 * Latin letters upper-cased. "  stop! " and "Band karo." both match.
 */
export function normalizeKeyword(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,!?؟،۔'"“”‘’()-]+|[\s.,!?؟،۔'"“”‘’()-]+$/g, '')
    .toLocaleUpperCase('en');
}

/**
 * Whole-message keyword match, so "STOP" opts out but "please don't stop
 * my order" doesn't. Opt-out wins if a word is in both lists.
 */
export function matchOptKeyword(
  text: string | null | undefined,
  settings: Pick<ComplianceSettings, 'optOutKeywords' | 'optInKeywords'>,
): { action: 'opt_out' | 'opt_in'; keyword: string } | null {
  if (!text) return null;
  const message = normalizeKeyword(text);
  if (!message || message.length > 40) return null;
  const optOut = settings.optOutKeywords.find((k) => normalizeKeyword(k) === message);
  if (optOut) return { action: 'opt_out', keyword: optOut };
  const optIn = settings.optInKeywords.find((k) => normalizeKeyword(k) === message);
  return optIn ? { action: 'opt_in', keyword: optIn } : null;
}

/** Owner confirms by typing the workspace name. */
export const deleteWorkspaceSchema = z.object({ confirmName: z.string().trim().min(1).max(120) });
