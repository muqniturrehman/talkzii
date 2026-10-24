export interface BroadcastListItem {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled' | 'failed';
  template_name: string | null;
  template_language: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_reason: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  skipped_count: number;
  estimated_cost: number | null;
  created_at: string;
}

export const BROADCAST_STATUS_VARIANT: Record<BroadcastListItem['status'], 'secondary' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'secondary',
  scheduled: 'info',
  sending: 'info',
  paused: 'warning',
  completed: 'success',
  cancelled: 'secondary',
  failed: 'danger',
};

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
