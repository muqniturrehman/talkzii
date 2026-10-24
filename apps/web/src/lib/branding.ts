import type { Branding } from '@talkzi/shared';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * CSS custom-property overrides for a white-labelled workspace. Values are
 * validated hex colours, so the output is safe to inline in a <style> tag.
 */
export function brandingStyle(branding: Branding): string | null {
  const primary = branding.primaryColor && HEX.test(branding.primaryColor) ? branding.primaryColor : null;
  const accent = branding.accentColor && HEX.test(branding.accentColor) ? branding.accentColor : null;
  if (!primary && !accent) return null;

  const vars = [
    primary ? `--primary:${primary};--ring:${primary};--gradient-from:${primary};--gradient-via:${primary};--gradient-to:${primary};` : '',
    accent ? `--accent:${accent};` : '',
  ].join('');
  return `:root,.dark{${vars}}`;
}
