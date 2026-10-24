import type { Json } from '@talkzi/db';

/** Normalised view of messages.media (inbound webhook + outbound sends share this shape). */
export interface MessageMedia {
  id: string | null;
  link: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  storagePath: string | null;
  voice: boolean;
  animated: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function parseMessageMedia(media: Json | null | undefined): MessageMedia | null {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return null;
  const m = media as Record<string, unknown>;
  const parsed: MessageMedia = {
    id: str(m.id),
    link: str(m.link),
    mimeType: str(m.mimeType) ?? str(m.mime_type),
    filename: str(m.filename),
    caption: str(m.caption),
    storagePath: str(m.storagePath) ?? str(m.storage_path),
    voice: m.voice === true,
    animated: m.animated === true,
  };
  return parsed.id || parsed.link || parsed.storagePath ? parsed : null;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function extensionForMime(mime: string | null | undefined, filename?: string | null): string {
  const fromName = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined;
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const base = (mime ?? '').split(';')[0]?.trim() ?? '';
  return EXT[base] ?? 'bin';
}

/** Storage-safe file name: keeps letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '');
  return cleaned.slice(-80) || 'file';
}
