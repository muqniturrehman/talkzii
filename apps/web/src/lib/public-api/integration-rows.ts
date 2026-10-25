import type { IntegrationProvider, OrderNotification } from '@talkzi/shared';
import type { Enums, Json } from '@talkzi/db';

/** The encrypted secret is selected only to report whether one is set; it never leaves the server. */
export const INTEGRATION_COLUMNS = 'id, provider, name, status, config, last_event_at, created_at, incoming_secret_encrypted';


export interface IntegrationResponse {
  id: string;
  provider: IntegrationProvider;
  name: string;
  status: Enums<'integration_status'>;
  notifications: OrderNotification[];
  last_event_at: string | null;
  created_at: string;
  incomingUrl: string;
  hasSecret: boolean;
}

export function toIntegrationResponse(
  row: {
    id: string;
    provider: string;
    name: string;
    status: Enums<'integration_status'>;
    config: Json;
    last_event_at: string | null;
    created_at: string;
    incoming_secret_encrypted: string | null;
  },
  baseUrl: string,
): IntegrationResponse {
  const config = (row.config ?? {}) as { notifications?: OrderNotification[] };
  return {
    id: row.id,
    provider: row.provider as IntegrationProvider,
    name: row.name,
    status: row.status,
    notifications: Array.isArray(config.notifications) ? config.notifications : [],
    last_event_at: row.last_event_at,
    created_at: row.created_at,
    incomingUrl: `${baseUrl}/api/webhooks/incoming/${row.id}`,
    hasSecret: Boolean(row.incoming_secret_encrypted),
  };
}
