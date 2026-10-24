import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

/** Relative in-app path only — blocks open redirects like //evil.com or https://… */
export const safeNextPathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s]*$/, 'Invalid redirect path');

export function safeNextPath(value: string | null | undefined, fallback = '/app'): string {
  const parsed = safeNextPathSchema.safeParse(value ?? '');
  return parsed.success ? parsed.data : fallback;
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #8B5CF6');
