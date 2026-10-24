import { z } from 'zod';
import { hexColorSchema } from './common';

const base = {
  conversationId: z.uuid(),
  /** Client-generated id for idempotent retries. */
  clientMessageId: z.string().min(8).max(64).optional(),
  replyToMessageId: z.uuid().optional(),
};

export const templateVariablesSchema = z.object({
  header: z.array(z.string().max(60)).max(1).optional(),
  body: z.array(z.string().max(1024)).max(20).optional(),
  /** URL suffix per dynamic URL button index ("0", "1"). */
  buttons: z.record(z.string(), z.string().max(2000)).optional(),
  headerMediaUrl: z.url().optional(),
});
export type TemplateVariables = z.infer<typeof templateVariablesSchema>;

export const sendMessageSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('text'),
    text: z.string().trim().min(1, 'Message is empty').max(4096),
    previewUrl: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('template'),
    templateId: z.uuid(),
    variables: templateVariablesSchema.default({}),
  }),
  z.object({
    ...base,
    type: z.enum(['image', 'video', 'audio', 'document']),
    mediaId: z.string().min(1).max(200).optional(),
    mediaUrl: z.url().optional(),
    storagePath: z.string().max(500).optional(),
    mimeType: z.string().max(100).optional(),
    caption: z.string().max(1024).optional(),
    filename: z.string().max(240).optional(),
  }).refine((v) => Boolean(v.mediaId || v.mediaUrl), { message: 'Provide mediaId or mediaUrl', path: ['mediaId'] }),
  z.object({
    ...base,
    type: z.literal('location'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().max(100).optional(),
    address: z.string().max(200).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('interactive_buttons'),
    body: z.string().trim().min(1).max(1024),
    buttons: z.array(z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(20) })).min(1).max(3),
  }),
]);
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const updateConversationSchema = z
  .object({
    status: z.enum(['open', 'pending', 'snoozed', 'resolved']).optional(),
    assignedTo: z.uuid().nullable().optional(),
    snoozedUntil: z.iso.datetime({ offset: true }).nullable().optional(),
    botPaused: z.boolean().optional(),
    csatScore: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const conversationListQuerySchema = z.object({
  status: z.enum(['open', 'pending', 'snoozed', 'resolved', 'all']).default('open'),
  /** "me", "unassigned", "all" or a member's user id. */
  assignee: z.union([z.enum(['me', 'unassigned', 'all']), z.uuid()]).default('all'),
  labelId: z.uuid().optional(),
  phoneNumberId: z.uuid().optional(),
  unread: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  /** ISO timestamp of the last item's last_message_at (keyset pagination). */
  cursor: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const messagePageQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Strips characters that would break a PostgREST `or=(...)` filter. */
export function sanitizeSearchTerm(q: string): string {
  return q.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  mentions: z.array(z.uuid()).max(20).default([]),
});

export const labelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColorSchema.default('#8B5CF6'),
  description: z.string().max(200).optional(),
});

export const labelLinkSchema = z.object({ labelId: z.uuid() });

export const cannedReplySchema = z.object({
  shortcut: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,32}$/, 'Letters, numbers, - and _ only'),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
});
export type CannedReplyInput = z.infer<typeof cannedReplySchema>;

export const aiConversationSchema = z.object({ conversationId: z.uuid() });

export const aiDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(20, 'Add at least a few sentences').max(200_000),
});

/** Registers a file already uploaded to Storage (media/<workspace>/<conversation>/…) with WhatsApp. */
export const mediaUploadSchema = z.object({
  conversationId: z.uuid(),
  storagePath: z.string().min(10).max(500),
  mimeType: z.string().min(3).max(100),
  filename: z.string().min(1).max(240),
});

/** WhatsApp media limits (Cloud API). */
export const MEDIA_LIMITS = {
  image: { maxBytes: 5 * 1024 * 1024, mime: ['image/jpeg', 'image/png'] },
  video: { maxBytes: 16 * 1024 * 1024, mime: ['video/mp4', 'video/3gpp'] },
  audio: { maxBytes: 16 * 1024 * 1024, mime: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'] },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mime: [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
} as const;
export type MediaKind = keyof typeof MEDIA_LIMITS;

export function mediaKindForMime(mime: string): MediaKind | null {
  for (const [kind, limits] of Object.entries(MEDIA_LIMITS) as [MediaKind, (typeof MEDIA_LIMITS)[MediaKind]][]) {
    if ((limits.mime as readonly string[]).includes(mime)) return kind;
  }
  return null;
}
