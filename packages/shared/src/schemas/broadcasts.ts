import { z } from 'zod';

/** Where a template variable's value comes from for each recipient. */
export const variableSourceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('contact.name'), fallback: z.string().max(200).default('there') }),
  z.object({ source: z.literal('contact.first_name'), fallback: z.string().max(200).default('there') }),
  z.object({ source: z.literal('contact.phone') }),
  z.object({ source: z.literal('custom_field'), key: z.string().min(1).max(50), fallback: z.string().max(200).default('') }),
  z.object({ source: z.literal('static'), value: z.string().max(1000) }),
]);
export type VariableSource = z.infer<typeof variableSourceSchema>;

export const variableMappingSchema = z.object({
  header: z.array(variableSourceSchema).max(1).default([]),
  body: z.array(variableSourceSchema).max(20).default([]),
  /** URL suffix per dynamic URL button index. */
  buttons: z.record(z.string(), variableSourceSchema).default({}),
  headerMediaUrl: z.string().url().optional(),
});
export type VariableMapping = z.infer<typeof variableMappingSchema>;

export const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all'), excludeLabelIds: z.array(z.uuid()).max(20).default([]) }),
  z.object({ type: z.literal('labels'), labelIds: z.array(z.uuid()).min(1).max(20), excludeLabelIds: z.array(z.uuid()).max(20).default([]) }),
  z.object({ type: z.literal('contacts'), contactIds: z.array(z.uuid()).min(1).max(10_000) }),
]);
export type Audience = z.infer<typeof audienceSchema>;

export const saveBroadcastSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateId: z.uuid(),
  phoneNumberId: z.uuid().optional(),
  audience: audienceSchema,
  variables: variableMappingSchema,
});
export type SaveBroadcastInput = z.infer<typeof saveBroadcastSchema>;

export const launchBroadcastSchema = z.object({
  /** ISO time to send at; omitted = now. */
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
});

export const broadcastActionSchema = z.object({ action: z.enum(['pause', 'resume', 'cancel']) });
