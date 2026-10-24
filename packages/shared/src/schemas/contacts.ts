import { z } from 'zod';
import { emailSchema } from './common';

const customFieldsSchema = z
  .record(z.string().trim().min(1).max(50), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length <= 50, { message: 'Up to 50 custom fields' });

export const createContactSchema = z.object({
  phone: z.string().trim().min(5, 'Enter a phone number').max(32),
  name: z.string().trim().max(120).optional(),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  customFields: customFieldsSchema.optional(),
  labelIds: z.array(z.uuid()).max(20).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
    email: emailSchema.nullable().optional().or(z.literal('').transform(() => null)),
    locale: z.string().trim().max(20).nullable().optional(),
    customFields: customFieldsSchema.optional(),
    optedOut: z.boolean().optional(),
    optOutReason: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const CONTACT_SORTS = ['created_desc', 'created_asc', 'name_asc', 'last_inbound_desc'] as const;

export const contactListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  labelId: z.uuid().optional(),
  optedOut: z.enum(['true', 'false']).optional(),
  source: z.enum(['whatsapp', 'import', 'api', 'manual', 'integration']).optional(),
  sort: z.enum(CONTACT_SORTS).default('created_desc'),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const bulkContactActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_label'), ids: z.array(z.uuid()).min(1).max(1000), labelId: z.uuid() }),
  z.object({ action: z.literal('remove_label'), ids: z.array(z.uuid()).min(1).max(1000), labelId: z.uuid() }),
  z.object({ action: z.literal('opt_out'), ids: z.array(z.uuid()).min(1).max(1000) }),
  z.object({ action: z.literal('opt_in'), ids: z.array(z.uuid()).min(1).max(1000) }),
  z.object({ action: z.literal('delete'), ids: z.array(z.uuid()).min(1).max(1000) }),
]);
export type BulkContactAction = z.infer<typeof bulkContactActionSchema>;

export const IMPORT_BATCH_SIZE = 500;

export const importRowSchema = z.object({
  /** Original 1-based CSV row (for error reporting). */
  row: z.number().int().min(1),
  phone: z.string().max(64),
  name: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  customFields: z.record(z.string().max(50), z.string().max(1000)).optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const contactImportSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(IMPORT_BATCH_SIZE),
  updateExisting: z.boolean().default(false),
  labelIds: z.array(z.uuid()).max(10).default([]),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  /** WhatsApp policy: contacts must have opted in to receive messages. */
  consent: z.literal(true, { message: 'Confirm that these contacts opted in' }),
});
export type ContactImportInput = z.infer<typeof contactImportSchema>;

export const contactNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) });
