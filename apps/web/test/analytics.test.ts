import { describe, expect, it } from 'vitest';
import { dayRange } from '@/lib/analytics/service';

describe('analytics day buckets', () => {
  it('lists calendar days in the workspace timezone, oldest first', () => {
    // 20:30 UTC on Oct 24 is already Oct 25 in Karachi (UTC+5).
    const now = new Date('2026-10-24T20:30:00Z');
    expect(dayRange(3, 'Asia/Karachi', now)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25']);
    expect(dayRange(3, 'UTC', now)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
    expect(dayRange(30, 'UTC', now)).toHaveLength(30);
  });
});
