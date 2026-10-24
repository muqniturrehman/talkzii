export interface AnalyticsPayload {
  range: { days: number; from: string; to: string };
  advanced: boolean;
  totals: {
    inbound: number;
    outbound: number;
    conversationsStarted: number;
    resolved: number;
    medianFirstResponseSeconds: number | null;
    answeredRate: number | null;
    deliveryRate: number | null;
    readRate: number | null;
    csatAverage: number | null;
    csatResponses: number;
    estimatedCostUsd: number;
  };
  volume: { day: string; inbound: number; outbound: number }[];
  responseTimes: { day: string; medianMinutes: number | null; answered: number; total: number }[];
  costByCategory: { category: 'marketing' | 'utility' | 'authentication' | 'service'; billable: number; total: number; rate: number; cost: number }[];
  csat: { score: number; responses: number }[];
  quality: { at: string; phone: string; event: string; rating: string | null; tier: string | null }[];
  broadcasts: { id: string; name: string; startedAt: string | null; sent: number; delivered: number; read: number; replied: number; failed: number }[];
}
