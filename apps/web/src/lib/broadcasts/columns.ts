export const BROADCAST_LIST_COLUMNS =
  'id, name, status, template_name, template_language, scheduled_at, started_at, completed_at, paused_reason, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, skipped_count, estimated_cost, created_at';

export const BROADCAST_DETAIL_COLUMNS = `${BROADCAST_LIST_COLUMNS}, template_id, phone_number_id, audience, variable_mapping, template:message_templates(id, name, language, category, status, components), phone:phone_numbers(id, display_phone_number, verified_name, quality_rating, messaging_limit_tier)`;

/** Editing is only possible before a broadcast starts sending. */
export const EDITABLE_BROADCAST_STATUSES = ['draft', 'scheduled'] as const;
