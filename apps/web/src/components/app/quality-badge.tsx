import { Badge } from '@talkzi/ui/badge';

const QUALITY: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  GREEN: { label: 'High quality', variant: 'success' },
  YELLOW: { label: 'Medium quality', variant: 'warning' },
  RED: { label: 'Low quality', variant: 'danger' },
  UNKNOWN: { label: 'Quality pending', variant: 'secondary' },
};

export function QualityBadge({ rating }: { rating: string | null | undefined }) {
  const meta = QUALITY[(rating ?? 'UNKNOWN').toUpperCase()] ?? QUALITY.UNKNOWN!;
  return (
    <Badge variant={meta.variant}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </Badge>
  );
}

const TIER_LABELS: Record<string, string> = {
  TIER_50: '50 / day',
  TIER_250: '250 / day',
  TIER_1K: '1K / day',
  TIER_10K: '10K / day',
  TIER_100K: '100K / day',
  TIER_UNLIMITED: 'Unlimited',
};

export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return 'Tier pending';
  return TIER_LABELS[tier] ?? tier.replace('TIER_', '');
}
